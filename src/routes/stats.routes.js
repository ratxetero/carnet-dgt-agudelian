// src/routes/stats.routes.js

const express = require('express');
const { requireAuth } = require('../middleware/auth');
const statsService = require('../services/statsService');

const router = express.Router();

router.get('/api/stats/resumen', requireAuth, (req, res) => {
  res.json(statsService.resumenGlobal(req.session.user.id));
});

router.get('/api/stats/temas', requireAuth, (req, res) => {
  res.json(statsService.statsPorTema(req.session.user.id, 'B'));
});

router.get('/api/stats/oficiales', requireAuth, (req, res) => {
  res.json(statsService.statsPorExamenOficial(req.session.user.id));
});

module.exports = router;
