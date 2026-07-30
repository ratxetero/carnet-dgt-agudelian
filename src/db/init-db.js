// src/db/init-db.js
// Crea la base de datos y las tablas a partir de schema.sql.
// Uso:
//   node src/db/init-db.js           -> crea las tablas si no existen
//   node src/db/init-db.js --force   -> BORRA el archivo de base de datos y lo recrea desde cero

const fs = require('fs');
const path = require('path');

const force = process.argv.includes('--force');

if (force) {
  require('dotenv').config();
  const dbPath = process.env.DB_PATH
    ? path.resolve(process.cwd(), process.env.DB_PATH)
    : path.resolve(process.cwd(), 'database/carnet.db');
  for (const suffix of ['', '-wal', '-shm', '-journal']) {
    const p = dbPath + suffix;
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  console.log('🗑️  Base de datos anterior eliminada.');
}

const db = require('./connection');

const schemaPath = path.join(__dirname, 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

db.exec(schema);

console.log('✅ Base de datos inicializada correctamente en', db.DB_PATH);
console.log('   Ejecuta ahora: npm run db:seed:temas  &&  npm run db:seed:sample');
