// src/services/ankiAdapter.js
// Adapta un elemento del formato JSON de donmerendolo/anki-carnet-conducir
// (data_B.json / data_A1.json / data_D.json) al formato interno que espera
// questionService.insertQuestion. Se usa tanto desde el importador manual
// (scripts/import-from-anki-json.js) como desde el descargador automático
// (scripts/descargar-banco-completo.js), para no duplicar esta lógica.
//
// Formato de origen verificado contra el repositorio real:
//   {
//     "img": "6288.jpg",
//     "question": "...",
//     "a.": "...", "b.": "...", "c.": "...",
//     "explanation": "...",
//     "correct": "0 0 1"
//   }

/**
 * @param {Object} item - un elemento del array JSON de origen
 * @returns {{enunciado:string, opciones:Array, explicacionGeneral:string, imgNombre:string|null}}
 * @throws {Error} si el elemento no tiene datos suficientes para importarse
 */
function adaptarItemAnki(item) {
  const enunciado = item.question;
  const opcionesTexto = [item['a.'], item['b.'], item['c.']].filter((v) => v !== undefined && v !== null && v !== '');

  if (!enunciado || opcionesTexto.length !== 3) {
    throw new Error('Pregunta sin enunciado o sin exactamente 3 opciones, se omite.');
  }

  const flags = String(item.correct || '')
    .trim()
    .split(/\s+/)
    .map((v) => v === '1');

  const opciones = opcionesTexto.map((texto, i) => ({ texto, correcta: !!flags[i] }));

  if (opciones.filter((o) => o.correcta).length !== 1) {
    throw new Error('No se pudo determinar una única opción correcta, se omite.');
  }

  return {
    enunciado,
    opciones,
    explicacionGeneral: item.explanation || '',
    imgNombre: item.img ? String(item.img).trim() : null,
  };
}

module.exports = { adaptarItemAnki };
