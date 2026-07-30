#!/usr/bin/env node
/**
 * scripts/generar-examenes-oficiales.js
 * ---------------------------------------------------------------------------
 * Agrupa el banco de preguntas ya importado (real, del carnet indicado) en
 * simulacros de examen de 30 preguntas, imitando el formato del examen
 * oficial DGT (30 preguntas, máx. 3 fallos para aprobar).
 *
 * IMPORTANTE — por qué este script existe en vez de descargar los exámenes
 * oficiales literales de sede.dgt.gob.es:
 *   La DGT cambió su web y ya no expone (ni siquiera de forma no oficial)
 *   una manera gratuita y automatizable de descargar sus simulacros
 *   concretos. El único proyecto que lo hacía por ingeniería inversa
 *   (donmerendolo... perdón, alvarolozano/dgt-test-downloader) está
 *   descontinuado desde 2025 precisamente por ese cambio, y su autor solo
 *   mantiene ahora una API de pago (Apify / RapidAPI). No hay ninguna fuente
 *   gratuita y fiable de exámenes oficiales literales que se pueda
 *   automatizar con un comando.
 *
 *   Como alternativa honesta y funcional, este script construye simulacros
 *   con el MISMO FORMATO que el examen real (30 preguntas, mismas reglas de
 *   aprobado) usando el banco de preguntas real ya importado. No son actas
 *   de examen histórico literales, pero sí preguntas reales agrupadas en el
 *   formato oficial — la app los etiqueta como "Simulacro estilo examen
 *   oficial" para no inducir a error.
 *
 * USO:
 *   node scripts/generar-examenes-oficiales.js --carnet B --cantidad 40
 *   node scripts/generar-examenes-oficiales.js --carnet B --cantidad 40 --force
 */

const db = require('../src/db/connection');

function parseArgs(argv) {
  const args = { carnet: 'B', cantidad: 40 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--carnet') args.carnet = argv[++i].toUpperCase();
    else if (a === '--cantidad') args.cantidad = parseInt(argv[++i], 10);
    else if (a === '--force') args.force = true;
  }
  return args;
}

function barajar(array, semillaAleatoria) {
  // Fisher-Yates. Usamos Math.random (no necesitamos reproducibilidad exacta).
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

function main() {
  const args = parseArgs(process.argv);
  const PREGUNTAS_POR_EXAMEN = 30;

  const yaExisten = db.prepare('SELECT COUNT(*) n FROM examenes_oficiales WHERE carnet = ?').get(args.carnet).n;
  if (yaExisten > 0 && !args.force) {
    console.log(`⚠️  Ya hay ${yaExisten} simulacros generados para el carnet ${args.carnet}.`);
    console.log('   No se generan más para evitar duplicados. Usa --force para añadir más de todas formas.');
    return;
  }

  const todas = db.prepare('SELECT id FROM preguntas WHERE carnet = ?').all(args.carnet).map((r) => r.id);
  const barajadas = barajar(todas);

  const numExamenesPosibles = Math.floor(barajadas.length / PREGUNTAS_POR_EXAMEN);
  const numExamenes = Math.min(args.cantidad, numExamenesPosibles);

  if (numExamenes === 0) {
    console.log('❌ No hay preguntas suficientes para generar ni un simulacro de 30 preguntas.');
    return;
  }

  const insertExamen = db.prepare(`
    INSERT INTO examenes_oficiales (nombre, carnet, fecha, descripcion)
    VALUES (?, ?, date('now'), ?)
  `);
  const insertExamenPregunta = db.prepare(`
    INSERT INTO examen_preguntas (examen_id, pregunta_id, orden) VALUES (?, ?, ?)
  `);

  const contarExistentes = db.prepare('SELECT COUNT(*) n FROM examenes_oficiales WHERE carnet = ?').get(args.carnet).n;

  const generarTodo = db.transaction(() => {
    for (let i = 0; i < numExamenes; i++) {
      const numero = contarExistentes + i + 1;
      const preguntasExamen = barajadas.slice(i * PREGUNTAS_POR_EXAMEN, (i + 1) * PREGUNTAS_POR_EXAMEN);
      const result = insertExamen.run(
        `Simulacro estilo examen oficial #${numero}`,
        args.carnet,
        'Simulacro de 30 preguntas reales del banco importado, agrupadas en formato de examen oficial DGT (no es un acta de examen histórico literal; ver README).'
      );
      const examenId = result.lastInsertRowid;
      preguntasExamen.forEach((preguntaId, idx) => {
        insertExamenPregunta.run(examenId, preguntaId, idx + 1);
      });
    }
  });

  generarTodo();

  console.log(`✅ ${numExamenes} simulacros de ${PREGUNTAS_POR_EXAMEN} preguntas generados para el carnet ${args.carnet}.`);
  console.log(`   (usando ${numExamenes * PREGUNTAS_POR_EXAMEN} de las ${barajadas.length} preguntas disponibles)`);
}

main();
