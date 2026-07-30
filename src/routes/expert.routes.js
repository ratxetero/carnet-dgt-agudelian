// src/routes/expert.routes.js

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { preguntarAlExperto } = require('../services/expertChatService');

const router = express.Router();

const limitarConsultas = rateLimit({ maxPeticiones: 12, ventanaMs: 60 * 1000 });

router.post('/api/expert-chat', requireAuth, limitarConsultas, async (req, res) => {
  try {
    const { preguntaId, mensaje, historial } = req.body;

    if (!preguntaId || !mensaje || !mensaje.trim()) {
      return res.status(400).json({ error: 'Faltan datos: preguntaId y mensaje son obligatorios.' });
    }
    if (mensaje.length > 1000) {
      return res.status(400).json({ error: 'El mensaje es demasiado largo (máximo 1000 caracteres).' });
    }

    const preguntaRow = db.prepare('SELECT id, enunciado, explicacion FROM preguntas WHERE id = ?').get(Number(preguntaId));
    if (!preguntaRow) {
      return res.status(404).json({ error: 'Pregunta no encontrada.' });
    }
    const opciones = db
      .prepare('SELECT texto, es_correcta FROM opciones WHERE pregunta_id = ? ORDER BY orden ASC')
      .all(preguntaRow.id)
      .map((o) => ({ texto: o.texto, correcta: !!o.es_correcta }));

    // Saneamos el historial recibido: solo role/content, máximo 10 turnos, ya limitado también en el servicio.
    const historialLimpio = Array.isArray(historial)
      ? historial
          .filter((h) => h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string')
          .slice(-10)
          .map((h) => ({ role: h.role, content: h.content.slice(0, 2000) }))
      : [];

    const respuesta = await preguntarAlExperto({
      pregunta: {
        enunciado: preguntaRow.enunciado,
        opciones,
        explicacionGeneral: preguntaRow.explicacion,
      },
      historial: historialLimpio,
      mensaje: mensaje.trim().slice(0, 1000),
    });

    res.json({ respuesta });
  } catch (e) {
    res.status(502).json({ error: e.message || 'No se ha podido consultar al experto. Inténtalo de nuevo.' });
  }
});

module.exports = router;
