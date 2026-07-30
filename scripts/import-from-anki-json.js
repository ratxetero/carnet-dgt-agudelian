#!/usr/bin/env node
/**
 * scripts/import-from-anki-json.js
 * ---------------------------------------------------------------------------
 * Importa preguntas desde un archivo JSON YA DESCARGADO en tu disco, en el
 * formato usado por donmerendolo/anki-carnet-conducir.
 *
 * Si lo que quieres es descargar e importar el banco completo con un único
 * comando (sin tener que clonar el repositorio a mano), usa en su lugar:
 *   npm run import:completo
 * (ver scripts/descargar-banco-completo.js)
 *
 * Este script (import-from-anki-json.js) sigue siendo útil si:
 *   - ya tienes el JSON descargado localmente y no quieres volver a bajarlo,
 *   - quieres importar desde un archivo propio con el mismo formato,
 *   - quieres aportar también las imágenes (con --images), que el
 *     descargador automático no puede obtener (ver README).
 *
 * USO:
 *   node scripts/import-from-anki-json.js \
 *     --input /ruta/a/data_B.json \
 *     --images /ruta/a/images/B \
 *     --carnet B \
 *     [--clasificar-temas] \
 *     [--limite 100] \
 *     [--dry-run]
 */

const fs = require('fs');
const path = require('path');
const { insertQuestion } = require('../src/services/questionService');
const { adaptarItemAnki } = require('../src/services/ankiAdapter');

function parseArgs(argv) {
  const args = { carnet: 'B' };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--input') args.input = argv[++i];
    else if (arg === '--images') args.images = argv[++i];
    else if (arg === '--carnet') args.carnet = argv[++i];
    else if (arg === '--limite') args.limite = parseInt(argv[++i], 10);
    else if (arg === '--clasificar-temas') args.clasificarTemas = true;
    else if (arg === '--dry-run') args.dryRun = true;
  }
  return args;
}

function cargarKeywordsMap() {
  const p = path.join(__dirname, '..', 'data', 'tema-keywords.json');
  const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
  delete raw._comentario;
  const map = {};
  for (const [temaNumero, palabras] of Object.entries(raw)) {
    map[temaNumero] = palabras.map((w) => w.toLowerCase());
  }
  return map;
}

function clasificarPorPalabrasClave(texto, keywordsMap) {
  const t = texto.toLowerCase();
  for (const [temaNumero, palabras] of Object.entries(keywordsMap)) {
    if (palabras.some((kw) => t.includes(kw))) return parseInt(temaNumero, 10);
  }
  return null;
}

function main() {
  const args = parseArgs(process.argv);

  if (!args.input) {
    console.error('❌ Falta el parámetro --input <ruta-al-json>');
    console.error('   Ejemplo: node scripts/import-from-anki-json.js --input ./data_B.json --images ./images/B --carnet B');
    console.error('   ¿Prefieres no descargar nada a mano? Usa: npm run import:completo');
    process.exit(1);
  }
  if (!fs.existsSync(args.input)) {
    console.error(`❌ No se encuentra el archivo: ${args.input}`);
    process.exit(1);
  }
  if (!['B', 'A1', 'D'].includes(args.carnet)) {
    console.error('❌ --carnet debe ser B, A1 o D');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(args.input, 'utf-8'));
  if (!Array.isArray(data)) {
    console.error('❌ Se esperaba un array de preguntas en el JSON de entrada.');
    process.exit(1);
  }

  const items = typeof args.limite === 'number' ? data.slice(0, args.limite) : data;
  const keywordsMap = args.clasificarTemas ? cargarKeywordsMap() : null;

  let imagesDestDir = null;
  if (args.images) {
    if (!fs.existsSync(args.images)) {
      console.error(`❌ No se encuentra la carpeta de imágenes: ${args.images}`);
      process.exit(1);
    }
    imagesDestDir = path.join(__dirname, '..', 'public', 'images', 'preguntas', args.carnet.toLowerCase());
    fs.mkdirSync(imagesDestDir, { recursive: true });
  }

  let ok = 0, fallidas = 0, sinTema = 0;
  const errores = [];

  for (const [index, item] of items.entries()) {
    try {
      const { enunciado, opciones, explicacionGeneral, imgNombre } = adaptarItemAnki(item);

      let imagenFinal = null;
      if (imgNombre && imagesDestDir) {
        const nombreOrigen = path.basename(imgNombre);
        const origenPath = path.join(args.images, nombreOrigen);
        if (fs.existsSync(origenPath)) {
          if (!args.dryRun) fs.copyFileSync(origenPath, path.join(imagesDestDir, nombreOrigen));
          imagenFinal = `${args.carnet.toLowerCase()}/${nombreOrigen}`;
        }
      }

      let temaNumero = null;
      if (keywordsMap) {
        temaNumero = clasificarPorPalabrasClave(enunciado, keywordsMap);
        if (!temaNumero) sinTema++;
      }

      if (!args.dryRun) {
        insertQuestion({
          tema_numero: temaNumero,
          carnet: args.carnet,
          enunciado,
          imagen: imagenFinal,
          opciones,
          explicacion: explicacionGeneral,
          origen: 'anki-carnet-conducir',
        });
      }
      ok++;
    } catch (e) {
      fallidas++;
      errores.push(`  [${index}] ${e.message}`);
    }
  }

  console.log(`\n${args.dryRun ? '🧪 SIMULACIÓN (dry-run), no se ha escrito nada en la base de datos' : '✅ Importación completada'}`);
  console.log(`   Preguntas procesadas: ${items.length}`);
  console.log(`   Insertadas correctamente: ${ok}`);
  console.log(`   Omitidas por error: ${fallidas}`);
  if (keywordsMap) console.log(`   Sin tema asignado (clasificación heurística sin coincidencia): ${sinTema}`);
  if (errores.length) {
    console.log('\nDetalle de errores (máx. 20):');
    console.log(errores.slice(0, 20).join('\n'));
  }
}

main();
