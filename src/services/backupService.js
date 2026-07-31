// src/services/backupService.js
// ---------------------------------------------------------------------------
// Copia de seguridad automática de archivos SQLite en Turso
// (https://turso.tech — capa gratuita real: 5 GB, sin tarjeta, no caduca).
//
// Respalda DOS archivos:
//   - la base de datos principal (preguntas, usuarios, notas, tests...)
//   - la base de datos de sesiones de login (para que un reinicio del
//     proceso no desconecte a todo el mundo ni invalide sus tokens CSRF,
//     que es justo lo que causaba el error "token de seguridad inválido")
//
// Si no configuras TURSO_DATABASE_URL/TURSO_AUTH_TOKEN, este servicio no
// hace nada (ni falla): todo funciona exactamente igual que sin él.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

let libsqlClient = null;

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

/** Lista de archivos que se respaldan: nombre lógico + ruta en disco. */
function archivosARespaldar() {
  return [
    { nombre: 'carnet', ruta: resolverRutaDb() },
    { nombre: 'sessions', ruta: resolverRutaSesiones() },
  ];
}

async function asegurarTabla(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS respaldo_sqlite (
      nombre TEXT PRIMARY KEY,
      datos BLOB NOT NULL,
      tamano_original INTEGER NOT NULL,
      actualizado_en TEXT NOT NULL
    )
  `);
}

/**
 * Restaura todos los archivos que tengan copia guardada en Turso, escribiendo
 * cada uno en su ruta local. Debe llamarse ANTES de que cualquier otro
 * módulo abra esos archivos (better-sqlite3, connect-sqlite3...).
 * Segura de llamar aunque Turso no esté configurado o falle: no interrumpe
 * el arranque de la app en ningún caso.
 */
async function restaurarSiExiste() {
  if (!habilitado()) {
    console.log('ℹ️  Copia de seguridad (Turso) no configurada — usando los archivos locales tal cual.');
    return;
  }
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
      const comprimido = Buffer.from(fila.datos);
      const datosOriginales = zlib.gunzipSync(comprimido);

      fs.mkdirSync(path.dirname(archivo.ruta), { recursive: true });
      fs.writeFileSync(archivo.ruta, datosOriginales);
      console.log(`✅ "${archivo.nombre}" restaurado desde Turso (copia del ${fila.actualizado_en}, ${(datosOriginales.length / 1024 / 1024).toFixed(2)} MB).`);
      algunaRestaurada = true;
    }

    if (!algunaRestaurada) {
      console.log('ℹ️  No hay ninguna copia de seguridad en Turso todavía (primer arranque). Se usarán los archivos locales del despliegue.');
    }
  } catch (err) {
    console.error('⚠️  No se pudo restaurar la copia de seguridad desde Turso. Se continúa con los archivos locales tal cual.', err.message);
  }
}

/**
 * Sube a Turso todos los archivos configurados que existan actualmente en
 * disco, comprimidos. Segura de llamar en cualquier momento.
 */
async function respaldar() {
  if (!habilitado()) return;
  try {
    const client = obtenerCliente();
    await asegurarTabla(client);

    for (const archivo of archivosARespaldar()) {
      if (!fs.existsSync(archivo.ruta)) continue;

      const datosOriginales = fs.readFileSync(archivo.ruta);
      const comprimido = zlib.gzipSync(datosOriginales);

      await client.execute({
        sql: `INSERT INTO respaldo_sqlite (nombre, datos, tamano_original, actualizado_en)
              VALUES (?, ?, ?, datetime('now'))
              ON CONFLICT(nombre) DO UPDATE SET
                datos = excluded.datos,
                tamano_original = excluded.tamano_original,
                actualizado_en = excluded.actualizado_en`,
        args: [archivo.nombre, comprimido, datosOriginales.length],
      });

      console.log(`💾 "${archivo.nombre}" respaldado en Turso (${(datosOriginales.length / 1024 / 1024).toFixed(2)} MB).`);
    }
  } catch (err) {
    console.error('⚠️  No se pudo subir la copia de seguridad a Turso.', err.message);
  }
}

/**
 * Arranca el respaldo periódico (cada `intervaloMs`) y garantiza una última
 * copia al recibir señales de apagado (SIGTERM/SIGINT), que es exactamente
 * lo que envía Render antes de reiniciar/redeployar el servicio.
 */
function iniciarRespaldoPeriodico({ intervaloMs = 5 * 60 * 1000 } = {}) {
  if (!habilitado()) return;

  const temporizador = setInterval(() => {
    respaldar().catch(() => {});
  }, intervaloMs);

  const respaldoFinal = async (señal) => {
    console.log(`\n🛑 Señal ${señal} recibida, haciendo copia de seguridad final antes de apagar...`);
    clearInterval(temporizador);
    await respaldar();
    process.exit(0);
  };

  process.on('SIGTERM', () => respaldoFinal('SIGTERM'));
  process.on('SIGINT', () => respaldoFinal('SIGINT'));
}

module.exports = {
  habilitado,
  restaurarSiExiste,
  respaldar,
  iniciarRespaldoPeriodico,
  resolverRutaSesiones,
};
