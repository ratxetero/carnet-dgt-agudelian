// app.js
// Define la aplicación Express (middlewares, rutas). No arranca el
// servidor: eso lo hace server.js, que primero restaura la copia de
// seguridad (si aplica) antes de que este archivo abra la base de datos.
require('dotenv').config();

const path = require('path');
const express = require('express');
const session = require('express-session');

const { attachUser } = require('./src/middleware/auth');
const { ensureCsrfToken, verifyCsrfToken } = require('./src/middleware/csrf');

const authRoutes = require('./src/routes/auth.routes');
const pagesRoutes = require('./src/routes/pages.routes');
const testRoutes = require('./src/routes/test.routes');
const statsRoutes = require('./src/routes/stats.routes');
const notesRoutes = require('./src/routes/notes.routes');
const expertRoutes = require('./src/routes/expert.routes');
const manualRoutes = require('./src/routes/manual.routes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  Define SESSION_SECRET en tu .env antes de desplegar en producción.');
}

app.use(
  session({
    name: 'carnet.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-cambia-en-produccion',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      // secure: true, // Actívalo si sirves la app por HTTPS
      maxAge: 1000 * 60 * 60 * 8, // 8 horas
    },
  })
);

app.use(attachUser);
app.use((req, res, next) => { res.locals.rutaActual = req.path; next(); });
app.use(ensureCsrfToken);
app.use(verifyCsrfToken);

app.use('/', authRoutes);
app.use('/', pagesRoutes);
app.use('/', testRoutes);
app.use('/', statsRoutes);
app.use('/', notesRoutes);
app.use('/', expertRoutes);
app.use('/', manualRoutes);

app.use((req, res) => {
  res.status(404).render('error', { titulo: 'Página no encontrada', mensaje: 'La página que buscas no existe.' });
});

// Manejador de errores genérico
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', { titulo: 'Error inesperado', mensaje: 'Ha ocurrido un error en el servidor.' });
});

module.exports = app;
