// src/routes/pages.routes.js

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const statsService = require('../services/statsService');
const testService = require('../services/testService');
const backupService = require('../services/backupService');

const router = express.Router();

router.get('/', requireAuth, (req, res) => {
  const resumen = statsService.resumenGlobal(req.session.user.id);
  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');
  const examenes = db.prepare('SELECT * FROM examenes_oficiales WHERE tema_id IS NULL ORDER BY id ASC').all();
  const { total: totalFallos } = testService.fallosPorTema(req.session.user.id, 'B');
  res.render('dashboard', { resumen, temas, examenes, totalFallos });
});

router.get('/test/nuevo', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');

  // Nº de preguntas clasificadas por tema (para no ofrecer temas vacíos)
  const numPreguntasPorTema = {};
  db.prepare(`SELECT tema_id, COUNT(*) n FROM preguntas WHERE carnet = 'B' AND tema_id IS NOT NULL GROUP BY tema_id`)
    .all()
    .forEach((r) => { numPreguntasPorTema[r.tema_id] = r.n; });

  // Bloques ("Test 1", "Test 2"...) de cada tema, con el progreso del usuario en cada uno
  const bloquesPorTemaRaw = testService.listarBloquesPorTema('B');
  const bloquesPorTema = {};
  for (const [temaId, bloques] of Object.entries(bloquesPorTemaRaw)) {
    bloquesPorTema[temaId] = bloques.map((b) => ({ ...b, progreso: testService.progresoDeBloque(usuarioId, b.id) }));
  }

  // Simulacros oficiales mixtos, con el progreso del usuario en cada uno.
  // Defensivo: forzamos numPreguntas a un número válido (nunca undefined),
  // que fue exactamente el origen del bug "undefined preguntas" corregido.
  const simulacros = testService.listarSimulacros('B').map((s) => ({
    id: s.id,
    nombre: s.nombre,
    numPreguntas: Number.isFinite(Number(s.numPreguntas)) ? Number(s.numPreguntas) : 0,
    progreso: testService.progresoDeBloque(usuarioId, s.id),
  }));

  // Fallos por tema, para las tarjetas de repaso
  const { porTema: fallosPorTema, total: totalFallos } = testService.fallosPorTema(usuarioId, 'B');

  const temasParaVista = temas.map((t) => ({
    id: t.id,
    numero: t.numero,
    nombre: t.nombre,
    numPreguntas: numPreguntasPorTema[t.id] || 0,
    numBloques: (bloquesPorTema[t.id] || []).length,
    numFallos: fallosPorTema[t.id] || 0,
  }));

  res.render('test-nuevo', {
    temas: temasParaVista,
    bloquesPorTema,
    simulacros,
    totalFallos,
    error: req.query.error || null,
  });
});

router.get('/stats', requireAuth, (req, res) => {
  res.render('stats');
});

// El token CSRF se lee una vez al cargar la página y se guarda en el JS del
// cliente. Si una sesión de test se alarga mucho, ese token en caché puede
// quedar desincronizado de la sesión real. Este endpoint permite al cliente
// pedir el token vigente en cualquier momento y reintentar la petición que
// falló, en vez de dejar al usuario atrapado con un error irrecuperable.
router.get('/api/csrf-token', requireAuth, (req, res) => {
  res.json({ csrfToken: res.locals.csrfToken });
});

// Fuerza una copia de seguridad inmediata en Turso. Pensada para visitarla
// tú mismo, logueado, justo ANTES de hacer un `git push` — así te asegura
// que Turso tiene la última versión antes de que Render mate el proceso
// viejo, en vez de depender de que el respaldo automático al apagarse
// tenga tiempo de completarse.
router.get('/respaldar-ahora', requireAuth, async (req, res) => {
  if (!backupService.habilitado()) {
    return res.status(400).send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif; max-width:480px; margin:60px auto; text-align:center; color:#b3453a;">
        <h1>⚠️ Turso no está configurado</h1>
        <p>No hay TURSO_DATABASE_URL / TURSO_AUTH_TOKEN en las variables de entorno, así que no hay nada que respaldar.</p>
      </body></html>
    `);
  }
  try {
    await backupService.respaldar({ forzar: true });
    res.send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif; max-width:480px; margin:60px auto; text-align:center;">
        <h1 style="color:#4a7a52;">✅ Copia de seguridad completada</h1>
        <p>Turso ya tiene la última versión de la base de datos y las sesiones.</p>
        <p><strong>Ya puedes hacer git push con tranquilidad.</strong></p>
        <p><a href="/">Volver al inicio</a></p>
      </body></html>
    `);
  } catch (err) {
    res.status(500).send(`
      <!DOCTYPE html><html><body style="font-family:sans-serif; max-width:480px; margin:60px auto; text-align:center; color:#b3453a;">
        <h1>❌ Error al respaldar</h1>
        <p>${err.message}</p>
        <p>No pushees todavía: reintenta esta página hasta que salga la confirmación en verde.</p>
      </body></html>
    `);
  }
});

module.exports = router;
