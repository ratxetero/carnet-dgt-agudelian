// src/db/connection.js
// Punto único de conexión a SQLite (better-sqlite3 es síncrono, lo que
// simplifica mucho el código de rutas y servicios en un proyecto local).

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.cwd(), process.env.DB_PATH)
  : path.resolve(process.cwd(), 'database/carnet.db');

// Aseguramos que la carpeta de la base de datos existe
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = db;
module.exports.DB_PATH = DB_PATH;
