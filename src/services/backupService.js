// src/services/backupService.js
// ---------------------------------------------------------------------------
// Copia de seguridad automática de la base de datos SQLite en Turso
// (https://turso.tech — capa gratuita real: 5 GB, sin tarjeta, no caduca).
//
// POR QUÉ EXISTE ESTO
// En hostings gratuitos como Render, el disco NO es persistente: cada
// redeploy (incluso solo cambiar una variable de entorno) borra el archivo
// de base de datos local y lo sustituye por el que está en el repositorio
// de git. Reescribir toda la app para usar Turso como base de datos "en
// vivo" habría significado convertir TODO el acceso a datos de síncrono
// (better-sqlite3) a asíncrono (libSQL), tocando prácticamente cada
// servicio y ruta — mucho riesgo de romper algo que ya funciona.
//
// En su lugar, este servicio usa Turso solo como "almacén" del archivo de
// base de datos completo (en un BLOB), sin cambiar ni una línea del resto
// de la aplicación:
//   - Al arrancar el servidor: si hay una copia en Turso, la descarga y la
//     escribe en el disco local ANTES de que better-sqlite3 abra el archivo.
//   - Mientras la app corre: sube una copia nueva cada pocos minutos.
//   - Al recibir la señal de apagado (Render la envía antes de cada
//     redeploy/reinicio): hace una última copia de seguridad justo a
//     tiempo, para no perder nada.
//
// Si no configuras TURSO_DATABASE_URL/TURSO_AUTH_TOKEN, este servicio no
// hace nada (ni falla): la app funciona exactamente igual que antes.

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

async function asegurarTabla(client) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS respaldo_sqlite (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      datos BLOB NOT NULL,
      tamano_original INTEGER NOT NULL,
      actualizado_en TEXT NOT NULL
    )
  `);
}

/**
 * Si existe una copia de seguridad en Turso, la descarga y sobrescribe el
 * archivo local de base de datos con ella. Debe llamarse ANTES de que
 * cualquier otro módulo abra la conexión a better-sqlite3.
 * Es totalmente segura de llamar aunque Turso no esté configurado: no hace
 * nada y no lanza error.
 */
async function restaurarSiExiste() {
  if (!habilitado()) {
    console.log('ℹ️  Copia de seguridad (Turso) no configurada — usando la base de datos local tal cual.');
    return;
  }
  try {
    const client = obtenerCliente();
    await asegurarTabla(client);
    const resultado = await client.execute('SELECT datos, tamano_original, actualizado_en FROM respaldo_sqlite WHERE id = 1');

    if (!resultado.rows.length) {
      console.log('ℹ️  No hay ninguna copia de seguridad en Turso todavía (primer arranque). Se usará la base de datos local del despliegue.');
      return;
    }

    const fila = resultado.rows[0];
    const comprimido = Buffer.from(fila.datos);
    const datosOriginales = zlib.gunzipSync(comprimido);

    const rutaDb = resolverRutaDb();
    fs.mkdirSync(path.dirname(rutaDb), { recursive: true });
    fs.writeFileSync(rutaDb, datosOriginales);

    console.log(`✅ Base de datos restaurada desde Turso (copia del ${fila.actualizado_en}, ${(datosOriginales.length / 1024 / 1024).toFixed(2)} MB).`);
  } catch (err) {
    console.error('⚠️  No se pudo restaurar la copia de seguridad desde Turso. Se continúa con la base de datos local tal cual.', err.message);
  }
}

/**
 * Sube el archivo local de base de datos actual a Turso, comprimido.
 * Segura de llamar en cualquier momento; si falla, solo lo registra en el
 * log y no interrumpe la aplicación.
 */
async function respaldar() {
  if (!habilitado()) return;
  try {
    const rutaDb = resolverRutaDb();
    if (!fs.existsSync(rutaDb)) return;

    const client = obtenerCliente();
    await asegurarTabla(client);

    const datosOriginales = fs.readFileSync(rutaDb);
    const comprimido = zlib.gzipSync(datosOriginales);

    await client.execute({
      sql: `INSERT INTO respaldo_sqlite (id, datos, tamano_original, actualizado_en)
            VALUES (1, ?, ?, datetime('now'))
            ON CONFLICT(id) DO UPDATE SET
              datos = excluded.datos,
              tamano_original = excluded.tamano_original,
              actualizado_en = excluded.actualizado_en`,
      args: [comprimido, datosOriginales.length],
    });

    console.log(`💾 Copia de seguridad subida a Turso (${(datosOriginales.length / 1024 / 1024).toFixed(2)} MB).`);
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

module.exports = { habilitado, restaurarSiExiste, respaldar, iniciarRespaldoPeriodico };
