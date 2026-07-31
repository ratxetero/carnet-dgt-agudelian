// app.js
// Define la aplicación Express (middlewares, rutas). No arranca el
// servidor: eso lo hace server.js, que primero restaura la copia de
// seguridad (si aplica) antes de que este archivo abra la base de datos.
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const session = require('express-session');
const SqliteSessionStore = require('better-sqlite3-session-store')(session);
const Database = require('better-sqlite3');
const backupService = require('./src/services/backupService');

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

// Detrás de un proxy inverso (Render, etc.) para que Express detecte bien
// HTTPS y las direcciones IP reales.
app.set('trust proxy', 1);

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
  console.warn('⚠️  Define SESSION_SECRET en tu .env antes de desplegar en producción.');
}

// Las sesiones se guardan en un archivo SQLite propio (no en memoria): así
// un reinicio del proceso no desconecta a todo el mundo ni invalida los
// tokens CSRF que tuvieran guardados — esto es justo lo que causaba el
// error "token de seguridad inválido o caducado" apareciendo constantemente.
// Este archivo de sesiones también se incluye en las copias de seguridad de
// Turso (src/services/backupService.js).
const rutaSesiones = backupService.resolverRutaSesiones();
fs.mkdirSync(path.dirname(rutaSesiones), { recursive: true });
const dbSesiones = new Database(rutaSesiones);
dbSesiones.pragma('journal_mode = WAL');

app.use(
  session({
    name: 'carnet.sid',
    secret: process.env.SESSION_SECRET || 'dev-secret-cambia-en-produccion',
    store: new SqliteSessionStore({ client: dbSesiones, expired: { clear: true, intervalMs: 15 * 60 * 1000 } }),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
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
