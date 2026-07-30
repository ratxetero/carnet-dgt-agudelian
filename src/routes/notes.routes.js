// src/routes/notes.routes.js

const express = require('express');
const db = require('../db/connection');
const { requireAuth } = require('../middleware/auth');
const noteService = require('../services/noteService');

const router = express.Router();

// ---------------------------------------------------------------------------
// Página: listado del cuaderno con filtros y orden
// ---------------------------------------------------------------------------
router.get('/cuaderno', requireAuth, (req, res) => {
  const usuarioId = req.session.user.id;
  const filtros = {
    tema_id: req.query.tema ? Number(req.query.tema) : null,
    categoria: req.query.categoria || null,
    etiqueta: req.query.etiqueta || null,
    origen: req.query.origen || null,
    orden: req.query.orden || 'recientes',
  };

  const notas = noteService.listarNotas(usuarioId, filtros);
  const { categorias, etiquetas } = noteService.opcionesFiltro(usuarioId);
  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');

  res.render('cuaderno', { notas, categorias, etiquetas, temas, filtros, qs: req.query });
});

// ---------------------------------------------------------------------------
// Página: nueva nota manual (suelta o vinculada a una pregunta/tema)
// ---------------------------------------------------------------------------
router.get('/cuaderno/nueva', requireAuth, (req, res) => {
  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');
  let pregunta = null;
  if (req.query.pregunta_id) {
    pregunta = db.prepare('SELECT id, enunciado FROM preguntas WHERE id = ?').get(Number(req.query.pregunta_id));
  }
  res.render('nota-form', { nota: null, temas, pregunta, error: null });
});

router.post('/cuaderno/nueva', requireAuth, (req, res) => {
  try {
    const nota = noteService.crearNota(req.session.user.id, {
      pregunta_id: req.body.pregunta_id ? Number(req.body.pregunta_id) : null,
      tema_id: req.body.tema_id ? Number(req.body.tema_id) : null,
      titulo: req.body.titulo,
      contenido: req.body.contenido,
      origen: 'manual',
      categoria: req.body.categoria,
      etiquetas: req.body.etiquetas,
    });
    res.redirect(`/cuaderno/${nota.id}`);
  } catch (e) {
    const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');
    res.status(400).render('nota-form', { nota: null, temas, pregunta: null, error: e.message });
  }
});

// ---------------------------------------------------------------------------
// Página: ver / editar una nota concreta
// ---------------------------------------------------------------------------
router.get('/cuaderno/:id', requireAuth, (req, res) => {
  const nota = noteService.obtenerNota(req.session.user.id, req.params.id);
  if (!nota) return res.status(404).render('error', { titulo: 'Nota no encontrada', mensaje: 'Esta nota no existe o no te pertenece.' });
  res.render('nota-detalle', { nota });
});

router.get('/cuaderno/:id/editar', requireAuth, (req, res) => {
  const nota = noteService.obtenerNota(req.session.user.id, req.params.id);
  if (!nota) return res.status(404).render('error', { titulo: 'Nota no encontrada', mensaje: 'Esta nota no existe o no te pertenece.' });
  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all('B');
  res.render('nota-form', { nota, temas, pregunta: null, error: null });
});

router.post('/cuaderno/:id/editar', requireAuth, (req, res) => {
  try {
    noteService.actualizarNota(req.session.user.id, req.params.id, {
      titulo: req.body.titulo,
      contenido: req.body.contenido,
      categoria: req.body.categoria,
      etiquetas: req.body.etiquetas,
      tema_id: req.body.tema_id ? Number(req.body.tema_id) : null,
    });
    res.redirect(`/cuaderno/${req.params.id}`);
  } catch (e) {
    res.status(400).render('error', { titulo: 'No se pudo guardar', mensaje: e.message });
  }
});

router.post('/cuaderno/:id/eliminar', requireAuth, (req, res) => {
  try {
    noteService.eliminarNota(req.session.user.id, req.params.id);
    res.redirect('/cuaderno');
  } catch (e) {
    res.status(400).render('error', { titulo: 'No se pudo eliminar', mensaje: e.message });
  }
});

// ---------------------------------------------------------------------------
// API: crear nota rápida por AJAX (desde el chat del experto o desde la
// pantalla de pregunta con "Guardar en notas")
// ---------------------------------------------------------------------------
router.post('/api/notas', requireAuth, (req, res) => {
  try {
    const nota = noteService.crearNota(req.session.user.id, {
      pregunta_id: req.body.preguntaId ? Number(req.body.preguntaId) : null,
      tema_id: req.body.temaId ? Number(req.body.temaId) : null,
      titulo: req.body.titulo || '',
      contenido: req.body.contenido,
      origen: req.body.origen || 'manual',
      categoria: req.body.categoria || null,
      etiquetas: req.body.etiquetas || null,
    });
    res.json({ ok: true, nota });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

module.exports = router;
