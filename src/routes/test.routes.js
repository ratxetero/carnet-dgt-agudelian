// src/routes/test.routes.js

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const testService = require('../services/testService');

const router = express.Router();

const CARNET_ACTIVO = 'B'; // De momento la app opera sobre el carnet B; el esquema ya soporta A1/D.

// ---------------------------------------------------------------------------
// Creación de un nuevo test (formulario de /test/nuevo)
// ---------------------------------------------------------------------------
router.post('/test/iniciar', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const { tipo, tema_id, examen_id } = req.body;

  try {
    let testId;
    switch (tipo) {
      case 'aleatorio':
        testId = testService.crearTestAleatorio(usuarioId, CARNET_ACTIVO);
        break;
      case 'tema':
        if (!req.body.bloque_id) return res.redirect('/test/nuevo?error=Selecciona+un+bloque+de+tema');
        testId = testService.iniciarOReanudarBloque(usuarioId, Number(req.body.bloque_id));
        break;
      case 'oficial':
        if (!req.body.bloque_id) return res.redirect('/test/nuevo?error=Selecciona+un+simulacro');
        testId = testService.iniciarOReanudarBloque(usuarioId, Number(req.body.bloque_id));
        break;
      case 'repaso':
        testId = testService.crearTestRepaso(usuarioId, CARNET_ACTIVO, tema_id ? Number(tema_id) : null);
        break;
      default:
        return res.redirect('/test/nuevo?error=Modo+de+test+no+válido');
    }
    res.redirect(`/test/${testId}`);
  } catch (e) {
    res.redirect(`/test/nuevo?error=${encodeURIComponent(e.message)}`);
  }
});

// ---------------------------------------------------------------------------
// Página de juego de un test
// ---------------------------------------------------------------------------
router.get('/test/:id', requireAuth, (req, res) => {
  const data = testService.obtenerTestParaJugar(req.params.id, req.session.user.id);
  if (!data) return res.status(404).render('error', { titulo: 'Test no encontrado', mensaje: 'Este test no existe o no te pertenece.' });

  if (data.test.finalizado_en) {
    return res.redirect(`/test/${req.params.id}/resultados`);
  }

  res.render('test', {
    test: data.test,
    preguntasJson: JSON.stringify(data.preguntas),
  });
});

// ---------------------------------------------------------------------------
// Página de resultados
// ---------------------------------------------------------------------------
router.get('/test/:id/resultados', requireAuth, (req, res) => {
  const resultados = testService.obtenerResultados(req.params.id, req.session.user.id);
  if (!resultados || !resultados.test.finalizado_en) {
    return res.status(404).render('error', { titulo: 'Resultados no disponibles', mensaje: 'Este test no existe, no te pertenece o todavía no se ha finalizado.' });
  }
  res.render('resultados', resultados);
});

// ---------------------------------------------------------------------------
// API: responder una pregunta
// ---------------------------------------------------------------------------
router.post('/api/test/:id/responder', requireAuth, (req, res) => {
  try {
    const { preguntaId, opcionId } = req.body;
    const resultado = testService.responderPregunta(
      req.params.id,
      req.session.user.id,
      Number(preguntaId),
      Number(opcionId)
    );
    res.json(resultado);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------------------------------------------------------------------------
// API: finalizar el test
// ---------------------------------------------------------------------------
router.post('/api/test/:id/finalizar', requireAuth, (req, res) => {
  try {
    const tiempoSegundos = Number.isFinite(Number(req.body.tiempoSegundos)) ? Number(req.body.tiempoSegundos) : null;
    const resumen = testService.finalizarTest(req.params.id, req.session.user.id, tiempoSegundos);
    res.json({ ...resumen, redirectTo: `/test/${req.params.id}/resultados` });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
