// src/routes/auth.routes.js

const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db/connection');
const { redirectIfAuth } = require('../middleware/auth');
const { validarRegistro, validarLogin } = require('../utils/validators');

const router = express.Router();

const SALT_ROUNDS = 12;

router.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', { errores: [], valores: {} });
});

router.post('/login', redirectIfAuth, (req, res) => {
  const { errores, valores } = validarLogin(req.body);
  if (errores.length) {
    return res.status(400).render('login', { errores, valores });
  }

  const identificador = valores.username.toLowerCase();
  const usuario = db
    .prepare('SELECT * FROM usuarios WHERE lower(username) = ? OR lower(email) = ?')
    .get(identificador, identificador);

  if (!usuario || !bcrypt.compareSync(req.body.password, usuario.password_hash)) {
    return res.status(401).render('login', {
      errores: ['Usuario/email o contraseña incorrectos.'],
      valores,
    });
  }

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('login', { errores: ['Error interno al iniciar sesión.'], valores });
    }
    req.session.user = { id: usuario.id, username: usuario.username, email: usuario.email };
    const destino = req.session.returnTo || '/';
    delete req.session.returnTo;
    res.redirect(destino);
  });
});

router.get('/register', redirectIfAuth, (req, res) => {
  res.render('register', { errores: [], valores: {} });
});

router.post('/register', redirectIfAuth, (req, res) => {
  const { errores, valores } = validarRegistro(req.body);
  if (errores.length) {
    return res.status(400).render('register', { errores, valores });
  }

  const existente = db
    .prepare('SELECT id FROM usuarios WHERE lower(username) = ? OR lower(email) = ?')
    .get(valores.username.toLowerCase(), valores.email.toLowerCase());
  if (existente) {
    return res.status(409).render('register', {
      errores: ['Ya existe una cuenta con ese usuario o email.'],
      valores,
    });
  }

  const password_hash = bcrypt.hashSync(req.body.password, SALT_ROUNDS);
  const result = db
    .prepare('INSERT INTO usuarios (username, email, password_hash) VALUES (?, ?, ?)')
    .run(valores.username, valores.email, password_hash);

  req.session.regenerate((err) => {
    if (err) {
      return res.status(500).render('register', { errores: ['Error interno al crear la cuenta.'], valores });
    }
    req.session.user = { id: result.lastInsertRowid, username: valores.username, email: valores.email };
    res.redirect('/');
  });
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
