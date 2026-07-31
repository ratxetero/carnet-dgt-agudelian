// server.js
// Punto de entrada real del proceso. El orden aquí es crítico:
//   1. Restaurar la última copia de seguridad desde Turso (si está
//      configurado) ANTES de tocar la base de datos local.
//   2. Solo entonces, requerir ./app.js (que abre la conexión a
//      better-sqlite3 y monta todas las rutas).
//   3. Arrancar el servidor HTTP.
//   4. Programar copias de seguridad periódicas y una última copia al
//      recibir la señal de apagado (Render la envía antes de cada
//      redeploy/reinicio, así que esto es lo que evita perder datos).
//
// Si no tienes Turso configurado (TURSO_DATABASE_URL/TURSO_AUTH_TOKEN en
// tu .env), todo esto es un no-op silencioso: la app arranca exactamente
// igual que siempre, con la base de datos local tal cual esté.

require('dotenv').config();

const backupService = require('./src/services/backupService');

async function iniciar() {
  await backupService.restaurarSiExiste();

  const app = require('./app');
  const PORT = process.env.PORT || 3000;

  const servidor = app.listen(PORT, () => {
    console.log(`🚗 Carnet DGT Agudelian escuchando en http://localhost:${PORT}`);
    if (backupService.habilitado()) {
      console.log('💾 Copias de seguridad automáticas en Turso: activadas.');
    } else {
      console.log('ℹ️  Copias de seguridad automáticas en Turso: no configuradas (ver .env.example).');
    }
  });

  backupService.iniciarRespaldoPeriodico({ intervaloMs: Number(process.env.BACKUP_INTERVALO_MS) || 5 * 60 * 1000 });

  return servidor;
}

iniciar().catch((err) => {
  console.error('❌ Error fatal al arrancar el servidor:', err);
  process.exit(1);
});
