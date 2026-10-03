// src/services/backupService.js
// ---------------------------------------------------------------------------
// Copia de seguridad automática de los archivos SQLite en Turso
// (https://turso.tech — capa gratuita, sin tarjeta).
//
// Pensado para hostings con disco NO persistente (plan gratuito de Render):
//   - Al arrancar: restaura la última copia desde Turso.
//   - Tras cada petición que modifica datos (POST/PUT/DELETE): sube una
//     copia a los pocos segundos (con "debounce" para agrupar ráfagas,
//     p. ej. responder varias preguntas seguidas).
//   - Cada BACKUP_INTERVALO_MS: comprobación periódica (solo sube si algo
//     cambió; cubre por ejemplo las sesiones de login).
//   - Al recibir SIGTERM/SIGINT (redeploy o apagado): copia final.
//
// Correcciones respecto a la versión anterior (causa de la pérdida de datos):
//   1. La BD está en modo WAL: los cambios recientes viven en "carnet.db-wal"
//      y NO en "carnet.db" hasta que SQLite hace un checkpoint. Antes se
//      subía carnet.db con fs.readFileSync, así que el progreso casi nunca
//      llegaba a Turso. Ahora se usa db.serialize(), que devuelve la imagen
//      completa y coherente de la base de datos (WAL incluido).
//   2. Si la restauración al arrancar fallaba (red, Turso caído...), la app
//      arrancaba con la BD vacía del repositorio y el respaldo periódico
//      SOBRESCRIBÍA la copia buena de Turso. Ahora, si no se pudo restaurar,
//      no se sube nada hasta comprobarlo.
//   3. Al restaurar se eliminan los -wal/-shm sobrantes para que SQLite no
//      mezcle restos antiguos con la copia restaurada.
//
// Sin TURSO_DATABASE_URL/TURSO_AUTH_TOKEN, este servicio no hace nada.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const Database = require('better-sqlite3');

const DEBOUNCE_MS = 4 * 1000; // espera tras el último cambio antes de subir
const MAX_ESPERA_MS = 20 * 1000; // como mucho se sube cada 20 s aunque no paren los cambios

let libsqlClient = null;
let tablaLista = false;

// Solo se permite subir copias si sabemos que lo que hay en disco es
// la versión buena: o se restauró desde Turso, o Turso estaba vacío.
let subidaPermitida = false;

const ultimoHashSubido = {}; // nombre -> sha1 del contenido subido
let respaldoEnCurso = Promise.resolve();
let temporizadorDebounce = null;
let primerCambioPendiente = null;

function habilitado() {
  return !!(process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN);
}

function obtenerCliente() {
  if (!habilitado()) return null;
  if (!libsqlClient) {
    const { createClient } = require('@libsql/client');
    libsqlClient = createClient({
      url: process.env.TURSO_DATABASE_URL,
      authToken: process.env.TURSO_AUTH_TOKEN,
    });
  }
  return libsqlClient;
}

function resolverRutaDb() {
  return process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), 'database/carnet.db');
}

function resolverRutaSesiones() {
  return path.join(path.dirname(resolverRutaDb()), 'sessions.db');
}

function archivosARespaldar() {
  return [
    { nombre: 'carnet', ruta: resolverRutaDb() },
    { nombre: 'sessions', ruta: resolverRutaSesiones() },
  ];
}

async function asegurarTabla(client) {
  if (tablaLista) return;
  await client.execute(`
    CREATE TABLE IF NOT EXISTS respaldo_sqlite (
      nombre TEXT PRIMARY KEY,
      datos BLOB NOT NULL,
      tamano_original INTEGER NOT NULL,
      actualizado_en TEXT NOT NULL
    )
  `);
  // Migración desde el esquema antiguo (columna "id" en vez de "nombre").
  const info = await client.execute('PRAGMA table_info(respaldo_sqlite)');
  const columnas = info.rows.map((r) => r.name);
  if (columnas.length && !columnas.includes('nombre')) {
    console.log('🔧 Esquema antiguo de "respaldo_sqlite" detectado — migrando...');
    await client.execute('DROP TABLE respaldo_sqlite');
    await client.execute(`
      CREATE TABLE respaldo_sqlite (
        nombre TEXT PRIMARY KEY,
        datos BLOB NOT NULL,
        tamano_original INTEGER NOT NULL,
        actualizado_en TEXT NOT NULL
      )
    `);
  }
  tablaLista = true;
}

/** Imagen completa y coherente de un archivo SQLite (incluye lo que está en el WAL). */
function instantanea(ruta) {
  const conexion = new Database(ruta, { readonly: true, fileMustExist: true });
  try {
    return conexion.serialize();
  } finally {
    conexion.close();
  }
}

function borrarRestosWal(ruta) {
  for (const sufijo of ['-wal', '-shm', '-journal']) {
    const p = ruta + sufijo;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Restaura desde Turso. Llamar ANTES de abrir cualquier conexión a la BD.
 * Reintenta varias veces; si no lo consigue, la app arranca igualmente pero
 * con la subida de copias BLOQUEADA, para no machacar la copia buena.
 */
async function restaurarSiExiste() {
  if (!habilitado()) {
    console.log('ℹ️  Copia de seguridad (Turso) no configurada — usando los archivos locales tal cual.');
    return;
  }

  const intentos = 5;
  for (let i = 1; i <= intentos; i++) {
    try {
      const client = obtenerCliente();
      await asegurarTabla(client);

      let algunaRestaurada = false;
      for (const archivo of archivosARespaldar()) {
        const resultado = await client.execute({
          sql: 'SELECT datos, actualizado_en FROM respaldo_sqlite WHERE nombre = ?',
          args: [archivo.nombre],
        });
        if (!resultado.rows.length) continue;

        const fila = resultado.rows[0];
        const datos = zlib.gunzipSync(Buffer.from(fila.datos));

        fs.mkdirSync(path.dirname(archivo.ruta), { recursive: true });
        borrarRestosWal(archivo.ruta);
        fs.writeFileSync(archivo.ruta, datos);
        ultimoHashSubido[archivo.nombre] = crypto.createHash('sha1').update(datos).digest('hex');
        console.log(`✅ "${archivo.nombre}" restaurado desde Turso (copia del ${fila.actualizado_en} UTC, ${(datos.length / 1024 / 1024).toFixed(2)} MB).`);
        algunaRestaurada = true;
      }

      if (!algunaRestaurada) {
        console.log('ℹ️  Turso no tiene copias todavía (primer arranque). Se usan los archivos del despliegue.');
      }
      subidaPermitida = true;
      return;
    } catch (err) {
      console.error(`⚠️  Restauración desde Turso fallida (intento ${i}/${intentos}):`, err.message);
      if (i < intentos) await esperar(2000 * i);
    }
  }

  console.error('❌ No se pudo restaurar desde Turso. La app arranca, pero NO se subirán copias para no sobrescribir la buena. Reinicia el servicio cuando Turso responda.');
}

async function subirAhora({ forzar = false } = {}) {
  if (!habilitado()) return;
  if (!subidaPermitida) {
    throw new Error('Subida bloqueada: la restauración inicial desde Turso no se completó.');
  }
  const client = obtenerCliente();
  await asegurarTabla(client);

  for (const archivo of archivosARespaldar()) {
    if (!fs.existsSync(archivo.ruta)) continue;

    const datos = instantanea(archivo.ruta);
    const hash = crypto.createHash('sha1').update(datos).digest('hex');
    if (!forzar && ultimoHashSubido[archivo.nombre] === hash) continue; // sin cambios

    await client.execute({
      sql: `INSERT INTO respaldo_sqlite (nombre, datos, tamano_original, actualizado_en)
            VALUES (?, ?, ?, datetime('now'))
            ON CONFLICT(nombre) DO UPDATE SET
              datos = excluded.datos,
              tamano_original = excluded.tamano_original,
              actualizado_en = excluded.actualizado_en`,
      args: [archivo.nombre, zlib.gzipSync(datos), datos.length],
    });
    ultimoHashSubido[archivo.nombre] = hash;
    console.log(`💾 "${archivo.nombre}" respaldado en Turso (${(datos.length / 1024 / 1024).toFixed(2)} MB).`);
  }
}

/**
 * Sube una copia (solo de lo que haya cambiado). Las llamadas se encadenan
 * para que nunca haya dos subidas a la vez. Lanza error si falla.
 */
function respaldar(opciones) {
  const tarea = respaldoEnCurso.then(() => subirAhora(opciones));
  respaldoEnCurso = tarea.catch(() => {});
  return tarea;
}

/** Programa un respaldo para dentro de unos segundos (agrupa ráfagas de cambios). */
function programarRespaldo() {
  if (!habilitado()) return;
  const ahora = Date.now();
  if (!primerCambioPendiente) primerCambioPendiente = ahora;
  clearTimeout(temporizadorDebounce);
  const espera = Math.max(0, Math.min(DEBOUNCE_MS, primerCambioPendiente + MAX_ESPERA_MS - ahora));
  temporizadorDebounce = setTimeout(() => {
    primerCambioPendiente = null;
    respaldar().catch((err) => console.error('⚠️  Respaldo tras cambio fallido:', err.message));
  }, espera);
}

/** Middleware Express: tras cada petición que modifica datos, programa un respaldo. */
function middlewareRespaldo(req, res, next) {
  if (habilitado() && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    res.on('finish', programarRespaldo);
  }
  next();
}

/** Respaldo periódico + copia final al apagar (SIGTERM/SIGINT). */
function iniciarRespaldoPeriodico({ intervaloMs = 2 * 60 * 1000 } = {}) {
  if (!habilitado()) return;

  const temporizador = setInterval(() => {
    respaldar().catch((err) => console.error('⚠️  Respaldo periódico fallido:', err.message));
  }, intervaloMs);

  let apagando = false;
  const respaldoFinal = async (senal) => {
    if (apagando) return;
    apagando = true;
    console.log(`\n🛑 ${senal} recibido: copia de seguridad final antes de apagar...`);
    clearInterval(temporizador);
    clearTimeout(temporizadorDebounce);
    try {
      await respaldar();
    } catch (err) {
      console.error('⚠️  Copia final fallida:', err.message);
    }
    process.exit(0);
  };

  process.on('SIGTERM', () => respaldoFinal('SIGTERM'));
  process.on('SIGINT', () => respaldoFinal('SIGINT'));
}

module.exports = {
  habilitado,
  restaurarSiExiste,
  respaldar,
  programarRespaldo,
  middlewareRespaldo,
  iniciarRespaldoPeriodico,
  resolverRutaSesiones,
};
