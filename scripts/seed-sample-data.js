// scripts/seed-sample-data.js
// Carga el pequeño dataset de ejemplo (data/sample-questions.json) para poder
// probar la aplicación sin depender de la importación de datos externos.
// También genera las imágenes placeholder y crea un "examen oficial" de
// demostración agrupando las preguntas de ejemplo en un orden fijo.

const fs = require('fs');
const path = require('path');
const db = require('../src/db/connection');
const { insertQuestion } = require('../src/services/questionService');

// 1) Generar imágenes placeholder si no existen
require('./generate-placeholder-images');

// 2) Evitar duplicar si ya se sembraron datos de ejemplo antes
const existing = db.prepare("SELECT COUNT(*) AS n FROM preguntas WHERE origen = 'ejemplo-demo'").get();
if (existing.n > 0) {
  console.log(`ℹ️  Ya existen ${existing.n} preguntas de ejemplo en la base de datos. No se insertan de nuevo.`);
  console.log('   Si quieres reiniciar todo desde cero, ejecuta: npm run db:reset');
  process.exit(0);
}

const dataPath = path.join(__dirname, '..', 'data', 'sample-questions.json');
const preguntas = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const idsInsertados = [];
for (const p of preguntas) {
  const id = insertQuestion({
    tema_numero: p.tema_numero,
    carnet: 'B',
    enunciado: p.enunciado,
    imagen: p.imagen,
    opciones: p.opciones,
    explicacion: p.explicacion,
    origen: p.origen || 'ejemplo-demo',
  });
  idsInsertados.push(id);
}

console.log(`✅ ${idsInsertados.length} preguntas de ejemplo insertadas.`);

// 3) Crear un examen oficial de demostración con las primeras 30 preguntas
//    (o todas si hay menos de 30), en el orden en que aparecen en el JSON.
if (idsInsertados.length >= 10) {
  const numPreguntasExamen = Math.min(30, idsInsertados.length);
  const insertExamen = db.prepare(`
    INSERT INTO examenes_oficiales (nombre, carnet, fecha, descripcion)
    VALUES (?, 'B', date('now'), ?)
  `);
  const insertExamenPregunta = db.prepare(`
    INSERT INTO examen_preguntas (examen_id, pregunta_id, orden) VALUES (?, ?, ?)
  `);

  const crearExamen = db.transaction(() => {
    const result = insertExamen.run(
      'Examen de demostración #1',
      'Examen de ejemplo generado automáticamente a partir del dataset de demo, para probar el modo "Examen oficial".'
    );
    const examenId = result.lastInsertRowid;
    for (let i = 0; i < numPreguntasExamen; i++) {
      insertExamenPregunta.run(examenId, idsInsertados[i], i + 1);
    }
    return examenId;
  });

  const examenId = crearExamen();
  console.log(`✅ Examen oficial de demostración creado (id ${examenId}) con ${numPreguntasExamen} preguntas.`);
} else {
  console.log('ℹ️  No hay suficientes preguntas para crear un examen oficial de demostración.');
}

console.log('\n🎉 Dataset de ejemplo listo. Ya puedes arrancar la aplicación con: npm start');
