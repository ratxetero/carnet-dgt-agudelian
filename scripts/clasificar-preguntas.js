#!/usr/bin/env node
/**
 * scripts/clasificar-preguntas.js
 * ---------------------------------------------------------------------------
 * Clasifica por tema las preguntas ya importadas (típicamente desde
 * anki-carnet-conducir, que no trae esta información). Usa un sistema de
 * puntuación por palabras clave (data/tema-keywords.json): cada coincidencia
 * suma puntos proporcionales al número de palabras de la frase clave (para
 * que "señal de peligro" pese más que "señal"), y se asigna el tema con más
 * puntos. Es una aproximación heurística, no una fuente oficial — puedes
 * reclasificar preguntas concretas a mano con SQL si te importa la precisión.
 *
 * USO:
 *   node scripts/clasificar-preguntas.js --carnet B
 *   node scripts/clasificar-preguntas.js --carnet B --solo-sin-tema
 *   node scripts/clasificar-preguntas.js --carnet B --dry-run
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/db/connection');

function parseArgs(argv) {
  const args = { carnet: 'B' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--carnet') args.carnet = argv[++i].toUpperCase();
    else if (a === '--solo-sin-tema') args.soloSinTema = true;
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

function cargarKeywordsMap() {
  const p = path.join(__dirname, '..', 'data', 'tema-keywords.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  delete raw._comentario;
  const map = {};
  for (const [temaNumero, frases] of Object.entries(raw)) {
    map[temaNumero] = frases.map((f) => f.toLowerCase());
  }

  // Además de las palabras clave manuales, usamos los nombres reales de los
  // subtemas del manual como señales adicionales de su tema principal (p.ej.
  // "Distancia de seguridad entre vehículos" refuerza el Tema 2). Esto combina
  // clasificación por tema principal y por subtema sin tener que mantener un
  // segundo diccionario a mano.
  const subtemas = db
    .prepare('SELECT s.nombre, t.numero AS tema_numero FROM subtemas s JOIN temas t ON t.id = s.tema_id')
    .all();
  for (const s of subtemas) {
    const key = String(s.tema_numero);
    if (!map[key]) map[key] = [];
    map[key].push(s.nombre.toLowerCase());
  }

  return map;
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ''); // quita acentos para comparar con más tolerancia
}

/** Cuenta cuántas veces aparece `frase` dentro de `texto` (ambos ya normalizados). */
function contarOcurrencias(texto, frase) {
  if (!frase) return 0;
  let count = 0;
  let idx = texto.indexOf(frase);
  while (idx !== -1) {
    count++;
    idx = texto.indexOf(frase, idx + frase.length);
  }
  return count;
}

function elegirTema(textoNormalizado, keywordsMap) {
  let mejorTema = null;
  let mejorPuntuacion = 0;
  for (const [temaNumero, frases] of Object.entries(keywordsMap)) {
    let puntuacion = 0;
    for (const frase of frases) {
      const fraseNorm = normalizar(frase);
      const ocurrencias = contarOcurrencias(textoNormalizado, fraseNorm);
      if (ocurrencias > 0) {
        const peso = fraseNorm.split(/\s+/).length; // frases de más palabras puntúan más (más específicas)
        puntuacion += ocurrencias * peso;
      }
    }
    if (puntuacion > mejorPuntuacion) {
      mejorPuntuacion = puntuacion;
      mejorTema = parseInt(temaNumero, 10);
    }
  }
  return mejorTema;
}

function main() {
  const args = parseArgs(process.argv);
  const keywordsMap = cargarKeywordsMap();

  const findTemaIdStmt = db.prepare('SELECT id FROM temas WHERE numero = ? AND carnet = ?');
  const actualizarStmt = db.prepare('UPDATE preguntas SET tema_id = ? WHERE id = ?');

  let query = `
    SELECT p.id, p.enunciado, p.explicacion,
           GROUP_CONCAT(o.texto, ' ') AS opciones_texto
    FROM preguntas p
    LEFT JOIN opciones o ON o.pregunta_id = p.id
    WHERE p.carnet = ?
  `;
  if (args.soloSinTema) query += ' AND p.tema_id IS NULL';
  query += ' GROUP BY p.id';

  const preguntas = db.prepare(query).all(args.carnet);
  console.log(`Procesando ${preguntas.length} preguntas del carnet ${args.carnet}...`);

  const contadorPorTema = {};
  let clasificadas = 0;
  let sinClasificar = 0;

  const actualizarTransaccion = db.transaction((cambios) => {
    for (const { preguntaId, temaId } of cambios) {
      actualizarStmt.run(temaId, preguntaId);
    }
  });

  const cambios = [];
  let asignadasSinCategorizar = 0;

  for (const p of preguntas) {
    const textoCompleto = normalizar(`${p.enunciado} ${p.opciones_texto || ''} ${p.explicacion || ''}`);
    const temaDetectado = elegirTema(textoCompleto, keywordsMap);
    // Si no hay ninguna coincidencia clara, la pregunta va al tema especial
    // "Sin categorizar" (numero 0) en vez de quedar huérfana: así el usuario
    // puede seguir haciendo test de ella con normalidad.
    const temaNumero = temaDetectado || 0;

    const temaRow = findTemaIdStmt.get(temaNumero, args.carnet);
    if (temaRow) {
      cambios.push({ preguntaId: p.id, temaId: temaRow.id });
      contadorPorTema[temaNumero] = (contadorPorTema[temaNumero] || 0) + 1;
      clasificadas++;
      if (!temaDetectado) asignadasSinCategorizar++;
      continue;
    }
    sinClasificar++;
  }

  if (!args.dryRun && cambios.length) {
    actualizarTransaccion(cambios);
  }

  console.log(`\n${args.dryRun ? '🧪 SIMULACIÓN (dry-run)' : '✅ Clasificación aplicada'}`);
  console.log(`   Clasificadas: ${clasificadas}`);
  console.log(`   De ellas, asignadas a "Sin categorizar" (sin coincidencia clara): ${asignadasSinCategorizar}`);
  console.log(`   Sin clasificar de verdad (ni siquiera existe el tema "Sin categorizar" — revisa que esté sembrado): ${sinClasificar}`);
  console.log('\nDistribución por tema:');
  Object.entries(contadorPorTema)
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .forEach(([tema, n]) => console.log(`   Tema ${tema}: ${n} preguntas`));
}

main();
