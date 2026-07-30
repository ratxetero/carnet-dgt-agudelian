// src/routes/manual.routes.js
// Apartado "Manual": visor de PDF embebido + descarga.
//
// El PDF se sirve como archivo estático desde public/manual/manual.pdf.
// Para sustituirlo por otro manual en el futuro, basta con reemplazar ese
// archivo por otro PDF (manteniendo el mismo nombre "manual.pdf"), o cambiar
// el nombre configurado en MANUAL_PDF_FILENAME más abajo.

const express = require('express');
const fs = require('fs');
const path = require('path');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const MANUAL_PDF_FILENAME = 'manual.pdf';
const MANUAL_PDF_PATH = path.join(__dirname, '..', '..', 'public', 'pdf', MANUAL_PDF_FILENAME);
const MANUAL_NOMBRE_DESCARGA = 'Manual-Teorico-DGT.pdf';

router.get('/manual', requireAuth, (req, res) => {
  const existe = fs.existsSync(MANUAL_PDF_PATH);
  let tamanoMB = null;
  if (existe) {
    tamanoMB = Math.round((fs.statSync(MANUAL_PDF_PATH).size / (1024 * 1024)) * 10) / 10;
  }
  res.render('manual', { existe, tamanoMB, urlPdf: `/pdf/${MANUAL_PDF_FILENAME}` });
});

router.get('/manual/descargar', requireAuth, (req, res) => {
  if (!fs.existsSync(MANUAL_PDF_PATH)) {
    return res.status(404).render('error', { titulo: 'Manual no disponible', mensaje: 'Todavía no se ha subido ningún manual PDF a este proyecto.' });
  }
  res.download(MANUAL_PDF_PATH, MANUAL_NOMBRE_DESCARGA);
});

module.exports = router;
