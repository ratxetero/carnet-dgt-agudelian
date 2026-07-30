// scripts/seed-temas.js
// Inserta (o actualiza) los temas oficiales del temario y sus subtemas.
// Fuente: data/temas.json (11 temas principales según el manual real, cada
// uno con sus subtemas para una clasificación más fina).

const fs = require('fs');
const path = require('path');
const db = require('../src/db/connection');

const temasPath = path.join(__dirname, '..', 'data', 'temas.json');
const temas = JSON.parse(fs.readFileSync(temasPath, 'utf-8'));

const upsertTema = db.prepare(`
  INSERT INTO temas (numero, nombre, descripcion, carnet)
  VALUES (@numero, @nombre, @descripcion, @carnet)
  ON CONFLICT(numero, carnet) DO UPDATE SET
    nombre = excluded.nombre,
    descripcion = excluded.descripcion
`);
const obtenerTemaId = db.prepare('SELECT id FROM temas WHERE numero = ? AND carnet = ?');
const upsertSubtema = db.prepare(`
  INSERT INTO subtemas (tema_id, numero, nombre)
  VALUES (@tema_id, @numero, @nombre)
  ON CONFLICT(tema_id, numero) DO UPDATE SET nombre = excluded.nombre
`);

const insertarTodo = db.transaction((rows) => {
  let totalSubtemas = 0;
  for (const row of rows) {
    upsertTema.run({ numero: row.numero, nombre: row.nombre, descripcion: row.descripcion, carnet: row.carnet });
    const temaId = obtenerTemaId.get(row.numero, row.carnet).id;
    for (const sub of row.subtemas || []) {
      upsertSubtema.run({ tema_id: temaId, numero: sub.numero, nombre: sub.nombre });
      totalSubtemas++;
    }
  }
  return totalSubtemas;
});

const totalSubtemas = insertarTodo(temas);

console.log(`✅ ${temas.length} temas principales y ${totalSubtemas} subtemas insertados/actualizados.`);
