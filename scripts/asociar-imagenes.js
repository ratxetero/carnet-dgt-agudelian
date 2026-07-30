#!/usr/bin/env node
/**
 * scripts/asociar-imagenes.js
 * ---------------------------------------------------------------------------
 * Asocia un banco de imágenes ya descargado a mano (el .zip que distribuye
 * anki-carnet-conducir aparte, vía Proton Drive) con las preguntas que ya
 * tienes importadas en la base de datos.
 *
 * Por qué existe este script: cuando se importa el banco completo con
 * `npm run import:completo`, las preguntas se guardan SIN imagen (el JSON de
 * origen es público, pero las imágenes no). Si más adelante descargas ese
 * .zip de imágenes a mano y lo descomprimes, este script:
 *   1. Vuelve a descargar (o usa la copia en caché) el JSON de origen, que es
 *      el único sitio donde consta qué imagen corresponde a cada pregunta.
 *   2. Para cada pregunta con imagen en el JSON, busca en tu base de datos la
 *      pregunta con el mismo enunciado (y mismo carnet/origen).
 *   3. Si la encuentra y el archivo de imagen existe en la carpeta indicada,
 *      copia la imagen a public/images/preguntas/<carnet>/ y actualiza la
 *      columna `imagen` de esa pregunta.
 *
 * USO:
 *   node scripts/asociar-imagenes.js --images /ruta/a/B --carnet B
 *   node scripts/asociar-imagenes.js --images /ruta/a/B --carnet B --dry-run
 *
 * La carpeta pasada en --images debe contener directamente los archivos de
 * imagen (p.ej. 6288.jpg, B_426.jpg...), o bien una subcarpeta con el nombre
 * del carnet (B, A1 o D) que los contenga — el script prueba ambas rutas.
 */

const fs = require('fs');
const path = require('path');
const db = require('../src/db/connection');

const URLS = {
  B: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_B.json',
  A1: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_A1.json',
  D: 'https://raw.githubusercontent.com/donmerendolo/anki-carnet-conducir/master/data/data_D.json',
};

function parseArgs(argv) {
  const args = { carnet: 'B' };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--images') args.images = argv[++i];
    else if (a === '--carnet') args.carnet = argv[++i].toUpperCase();
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function obtenerDatosOrigen(carnet) {
  const cachePath = path.join(__dirname, '..', 'data', 'descargas', `data_${carnet}.json`);
  if (fs.existsSync(cachePath)) {
    console.log(`ℹ️  Usando copia en caché: ${cachePath}`);
    return JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
  }
  console.log(`📥 Descargando ${URLS[carnet]} ...`);
  const res = await fetch(URLS[carnet]);
  if (!res.ok) throw new Error(`No se pudo descargar el JSON de origen (HTTP ${res.status})`);
  const data = await res.json();
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

function localizarArchivoImagen(carpetaBase, carnet, nombreArchivo) {
  const candidatos = [
    path.join(carpetaBase, nombreArchivo),
    path.join(carpetaBase, carnet, nombreArchivo),
    path.join(carpetaBase, carnet.toLowerCase(), nombreArchivo),
  ];
  return candidatos.find((p) => fs.existsSync(p)) || null;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.images) {
    console.error('❌ Falta --images <carpeta con las imágenes descomprimidas>');
    process.exit(1);
  }
  if (!fs.existsSync(args.images)) {
    console.error(`❌ No existe la carpeta: ${args.images}`);
    process.exit(1);
  }
  if (!URLS[args.carnet]) {
    console.error('❌ --carnet debe ser B, A1 o D');
    process.exit(1);
  }

  const data = await obtenerDatosOrigen(args.carnet);
  console.log(`   ${data.length} preguntas en el JSON de origen.`);

  const destDir = path.join(__dirname, '..', 'public', 'images', 'preguntas', args.carnet.toLowerCase());
  fs.mkdirSync(destDir, { recursive: true });

  const buscarPregunta = db.prepare(
    `SELECT id, imagen FROM preguntas WHERE enunciado = ? AND carnet = ? AND origen = 'anki-carnet-conducir'`
  );
  const obtenerOpciones = db.prepare('SELECT texto FROM opciones WHERE pregunta_id = ? ORDER BY orden ASC');
  const actualizarImagen = db.prepare('UPDATE preguntas SET imagen = ? WHERE id = ?');

  function normalizar(texto) {
    return String(texto || '').trim().toLowerCase();
  }

  /**
   * Cuando varias preguntas comparten enunciado (ocurre bastante en este
   * banco: el mismo texto de pregunta con distinta señal/imagen y distintas
   * opciones), desambiguamos comparando también el conjunto de las 3
   * opciones de respuesta. Solo asociamos si encontramos una coincidencia
   * exacta y única; si sigue siendo ambiguo, se omite (mejor sin imagen que
   * con la imagen equivocada).
   */
  function elegirPreguntaCandidata(candidatos, item) {
    if (candidatos.length === 1) return candidatos[0];

    const opcionesItem = new Set([item['a.'], item['b.'], item['c.']].map(normalizar));
    const exactas = candidatos.filter((c) => {
      const opcionesBD = new Set(obtenerOpciones.all(c.id).map((o) => normalizar(o.texto)));
      if (opcionesBD.size !== opcionesItem.size) return false;
      for (const op of opcionesBD) if (!opcionesItem.has(op)) return false;
      return true;
    });
    return exactas.length === 1 ? exactas[0] : null;
  }

  let asociadas = 0;
  let yaTenianImagen = 0;
  let sinImagenEnJson = 0;
  let imagenNoEncontradaEnCarpeta = 0;
  let preguntaNoEncontradaEnBD = 0;
  let ambiguasSinResolver = 0;

  const actualizarTransaccion = db.transaction((items) => {
    for (const { preguntaId, rutaRelativa } of items) {
      actualizarImagen.run(rutaRelativa, preguntaId);
    }
  });

  const pendientes = [];
  const yaAsignadasEnEstaEjecucion = new Set();

  for (const item of data) {
    if (!item.img) {
      sinImagenEnJson++;
      continue;
    }
    const nombreArchivo = path.basename(String(item.img).trim());
    const candidatos = buscarPregunta.all(item.question, args.carnet);

    if (!candidatos.length) {
      preguntaNoEncontradaEnBD++;
      continue;
    }

    const pregunta = elegirPreguntaCandidata(candidatos, item);
    if (!pregunta) {
      ambiguasSinResolver++;
      continue;
    }
    if (pregunta.imagen || yaAsignadasEnEstaEjecucion.has(pregunta.id)) {
      yaTenianImagen++;
      continue;
    }

    const origenPath = localizarArchivoImagen(args.images, args.carnet, nombreArchivo);
    if (!origenPath) {
      imagenNoEncontradaEnCarpeta++;
      continue;
    }

    const rutaRelativa = `${args.carnet.toLowerCase()}/${nombreArchivo}`;
    if (!args.dryRun) {
      fs.copyFileSync(origenPath, path.join(destDir, nombreArchivo));
    }
    pendientes.push({ preguntaId: pregunta.id, rutaRelativa });
    yaAsignadasEnEstaEjecucion.add(pregunta.id);
    asociadas++;
  }

  if (!args.dryRun && pendientes.length) {
    actualizarTransaccion(pendientes);
  }

  console.log(`\n${args.dryRun ? '🧪 SIMULACIÓN (dry-run)' : '✅ Asociación completada'}`);
  console.log(`   Imágenes asociadas y copiadas: ${asociadas}`);
  console.log(`   Preguntas que ya tenían imagen o repetidas en esta ejecución: ${yaTenianImagen}`);
  console.log(`   Preguntas del JSON sin imagen: ${sinImagenEnJson}`);
  console.log(`   Imagen referenciada pero no encontrada en la carpeta: ${imagenNoEncontradaEnCarpeta}`);
  console.log(`   Pregunta del JSON sin coincidencia en tu base de datos: ${preguntaNoEncontradaEnBD}`);
  console.log(`   Ambiguas (mismo enunciado, opciones no coinciden de forma única) sin resolver: ${ambiguasSinResolver}`);
}

main().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
