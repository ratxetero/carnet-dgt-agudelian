#!/usr/bin/env node
/**
 * scripts/descargar-banco-completo.js
 * ---------------------------------------------------------------------------
 * Descarga el banco de preguntas COMPLETO directamente desde el repositorio
 * público donmerendolo/anki-carnet-conducir (GitHub) y lo importa a la base
 * de datos, todo con UN SOLO COMANDO, sin tener que clonar nada a mano:
 *
 *   npm run import:completo
 *   npm run import:completo -- --carnet A1
 *   npm run import:completo -- --carnet todos
 *
 * Son ~2900 preguntas para el carnet B (~900 para A1, ~165 para D).
 *
 * ⚠️ LIMITACIÓN IMPORTANTE SOBRE LAS IMÁGENES:
 * El JSON de preguntas es de acceso público y gratuito en GitHub, así que se
 * puede descargar automáticamente (es lo que hace este script). Pero las
 * IMÁGENES de las preguntas NO están en GitHub: el propio proyecto de origen
 * las distribuye aparte, en un archivo .zip alojado en Proton Drive (ver su
 * README), que no se puede descargar mediante un comando/URL directa de
 * forma automática ni fiable. Por tanto:
 *   - Este script importa TODO el texto, las 3 opciones, cuál es la correcta
 *     y la explicación de cada pregunta.
 *   - Las preguntas quedan SIN IMAGEN (la mayoría del examen no depende
 *     críticamente de la imagen para poder practicar la teoría).
 *   - Si más adelante quieres añadir las imágenes, descarga tú ese .zip,
 *     descomprímelo, y vuelve a importar usando en su lugar:
 *       node scripts/import-from-anki-json.js --input <json> --images <carpeta> --carnet B
 *     (ver el README, sección "Alimentar el banco de preguntas").
 *
 * Parámetros:
 *   --carnet B|A1|D|todos   (por defecto B)
 *   --clasificar-temas      clasificación heurística opcional por tema (ver README)
 *   --limite N              importar solo las primeras N preguntas de cada carnet (para probar)
 *   --dry-run               no escribe nada en la base de datos, solo informa
 *   --force                 permite re-importar aunque ya existan preguntas de este origen/carnet
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/db/connection');
const { insertQuestion } = require('../src/services/questionService');
const { adaptarItemAnki } = require('../src/services/ankiAdapter');

const URLS = {
  B: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_B.json',
  A1: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_A1.json',
  D: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_D.json',
};

function parseArgs(argv) {
  const args = { carnet: 'B' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--carnet') args.carnet = argv[++i].toUpperCase();
    else if (a === '--limite') args.limite = parseInt(argv[++i], 10);
    else if (a === '--clasificar-temas') args.clasificarTemas = true;
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--force') args.force = true;
  }
  return args;
}

function cargarKeywordsMap() {
  const p = path.join(__dirname, '..', 'data', 'tema-keywords.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  delete raw._comentario;
  const map = {};
  for (const [temaNumero, palabras] of Object.entries(raw)) map[temaNumero] = palabras.map((w) => w.toLowerCase());
  return map;
}

function clasificarPorPalabrasClave(texto, keywordsMap) {
  const t = texto.toLowerCase();
  for (const [temaNumero, palabras] of Object.entries(keywordsMap)) {
    if (palabras.some((kw) => t.includes(kw))) return parseInt(temaNumero, 10);
  }
  return null;
}

async function descargarJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`No se pudo descargar ${url} (HTTP ${res.status})`);
  return res.json();
}

async function procesarCarnet(carnet, args, keywordsMap) {
  console.log(`\n📥 Descargando banco de preguntas para el carnet ${carnet}...`);
  const url = URLS[carnet];
  const data = await descargarJson(url);
  console.log(`   ${data.length} preguntas encontradas en el origen.`);

  // Guardamos una copia local por si se quiere inspeccionar o reutilizar sin red.
  const cacheDir = path.join(__dirname, '..', 'data', 'descargas');
  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, `data_${carnet}.json`), JSON.stringify(data, null, 2), 'utf-8');

  const yaExisten = db
    .prepare("SELECT COUNT(*) AS n FROM preguntas WHERE origen = 'anki-carnet-conducir' AND carnet = ?")
    .get(carnet).n;
  if (yaExisten > 0 && !args.force) {
    console.log(`⚠️  Ya hay ${yaExisten} preguntas importadas de este origen para el carnet ${carnet}.`);
    console.log('   No se importa de nuevo para evitar duplicados. Usa --force si quieres re-importar igualmente.');
    return { ok: 0, fallidas: 0, sinTema: 0, saltado: true };
  }

  const items = typeof args.limite === 'number' ? data.slice(0, args.limite) : data;

  let ok = 0, fallidas = 0, sinTema = 0;
  for (const item of items) {
    try {
      const { enunciado, opciones, explicacionGeneral } = adaptarItemAnki(item);
      let temaNumero = null;
      if (keywordsMap) {
        temaNumero = clasificarPorPalabrasClave(enunciado, keywordsMap);
        if (!temaNumero) sinTema++;
      }
      if (!args.dryRun) {
        insertQuestion({
          tema_numero: temaNumero,
          carnet,
          enunciado,
          imagen: null, // ver limitación de imágenes explicada arriba
          opciones,
          explicacion: explicacionGeneral,
          origen: 'anki-carnet-conducir',
        });
      }
      ok++;
    } catch (e) {
      fallidas++;
    }
  }

  console.log(`✅ Carnet ${carnet}: ${ok} preguntas importadas, ${fallidas} omitidas por datos incompletos.`);
  if (keywordsMap) console.log(`   Sin tema asignado (heurística sin coincidencia): ${sinTema}`);
  return { ok, fallidas, sinTema, saltado: false };
}

async function main() {
  const args = parseArgs(process.argv);
  const carnets = args.carnet === 'TODOS' ? ['B', 'A1', 'D'] : [args.carnet];

  for (const c of carnets) {
    if (!URLS[c]) {
      console.error(`❌ Carnet no soportado: ${c}. Usa B, A1, D o todos.`);
      process.exit(1);
    }
  }

  const keywordsMap = args.clasificarTemas ? cargarKeywordsMap() : null;

  console.log('🚀 Importación automática del banco de preguntas de anki-carnet-conducir');
  if (args.dryRun) console.log('🧪 Modo simulación: no se escribirá nada en la base de datos.');

  for (const carnet of carnets) {
    await procesarCarnet(carnet, args, keywordsMap);
  }

  console.log('\n🎉 Listo. Recuerda: las preguntas se han importado SIN IMAGEN (ver la explicación al principio de este script/README).');
}

main().catch((err) => {
  console.error('❌ Error durante la descarga/importación:', err.message);
  process.exit(1);
});
