// src/routes/pages.routes.js

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const statsService = require('../services/statsService');
const testService = require('../services/testService');

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

module.exports = router;
