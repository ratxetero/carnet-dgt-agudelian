#!/usr/bin/env node
/**
 * scripts/generar-bloques-tema.js
 * ---------------------------------------------------------------------------
 * Divide las preguntas de cada tema en bloques ("tests") de hasta 30
 * preguntas cada uno, para que "Test por tema" funcione siempre con
 * contenido real y de forma predecible (Tema 1 - Test 1, Test 2, ...), en
 * vez de tomar una muestra aleatoria distinta cada vez.
 *
 * Reutiliza la misma tabla `examenes_oficiales` que los simulacros de examen
 * oficial, distinguiéndose por tener `tema_id` relleno (los simulacros
 * oficiales tienen tema_id NULL, porque mezclan preguntas de todos los
 * temas). Esto permite reutilizar toda la lógica de creación/reanudación de
 * tests ya existente para exámenes oficiales.
 *
 * USO:
 *   node scripts/generar-bloques-tema.js --carnet B
 *   node scripts/generar-bloques-tema.js --carnet B --force   (regenera todo)
 */

const db = require('../src/db/connection');

function parseArgs(argv) {
  const args = { carnet: 'B' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--carnet') args.carnet = argv[++i].toUpperCase();
    else if (a === '--force') args.force = true;
  }
  return args;
}

const TAMANO_BLOQUE = 30;

function main() {
  const args = parseArgs(process.argv);

  const yaExisten = db
    .prepare('SELECT COUNT(*) n FROM examenes_oficiales WHERE carnet = ? AND tema_id IS NOT NULL')
    .get(args.carnet).n;

  if (yaExisten > 0 && !args.force) {
    console.log(`⚠️  Ya hay ${yaExisten} bloques de tema generados para el carnet ${args.carnet}.`);
    console.log('   No se regeneran para evitar duplicados. Usa --force para regenerarlos desde cero.');
    return;
  }

  if (args.force) {
    const borrar = db.transaction(() => {
      const ids = db.prepare('SELECT id FROM examenes_oficiales WHERE carnet = ? AND tema_id IS NOT NULL').all(args.carnet).map((r) => r.id);
      for (const id of ids) {
        db.prepare('DELETE FROM examen_preguntas WHERE examen_id = ?').run(id);
      }
      db.prepare('DELETE FROM examenes_oficiales WHERE carnet = ? AND tema_id IS NOT NULL').run(args.carnet);
    });
    borrar();
    console.log('🗑️  Bloques de tema anteriores eliminados.');
  }

  const temas = db.prepare('SELECT * FROM temas WHERE carnet = ? ORDER BY numero ASC').all(args.carnet);

  const insertExamen = db.prepare(`
    INSERT INTO examenes_oficiales (nombre, carnet, fecha, descripcion, tema_id)
    VALUES (?, ?, date('now'), ?, ?)
  `);
  const insertExamenPregunta = db.prepare(`
    INSERT INTO examen_preguntas (examen_id, pregunta_id, orden) VALUES (?, ?, ?)
  `);

  let totalBloques = 0;
  let temasSinPreguntas = 0;

  const generarTodo = db.transaction(() => {
    for (const tema of temas) {
      const preguntaIds = db
        .prepare('SELECT id FROM preguntas WHERE tema_id = ? AND carnet = ? ORDER BY id ASC')
        .all(tema.id, args.carnet)
        .map((r) => r.id);

      if (!preguntaIds.length) {
        temasSinPreguntas++;
        continue;
      }

      const numBloques = Math.ceil(preguntaIds.length / TAMANO_BLOQUE);
      for (let i = 0; i < numBloques; i++) {
        const trozo = preguntaIds.slice(i * TAMANO_BLOQUE, (i + 1) * TAMANO_BLOQUE);
        const result = insertExamen.run(
          `Tema ${tema.numero} — Test ${i + 1}`,
          args.carnet,
          `Bloque ${i + 1} de ${numBloques} del tema ${tema.numero} (${tema.nombre}).`,
          tema.id
        );
        const examenId = result.lastInsertRowid;
        trozo.forEach((preguntaId, idx) => insertExamenPregunta.run(examenId, preguntaId, idx + 1));
        totalBloques++;
      }
    }
  });

  generarTodo();

  console.log(`✅ ${totalBloques} bloques de test generados para ${temas.length - temasSinPreguntas} temas.`);
  if (temasSinPreguntas) console.log(`   ${temasSinPreguntas} temas no tenían ninguna pregunta clasificada (sin bloques).`);
}

main();
