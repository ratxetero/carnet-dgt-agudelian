// src/services/questionService.js
// Utilidades compartidas por los scripts de siembra/importación para insertar
// preguntas y sus opciones de respuesta de forma consistente.
//
// Regla del proyecto: SIEMPRE 3 opciones por pregunta (a, b, c), igual que en
// el examen oficial real de la DGT, y cada opción tiene su propia explicación.

const db = require('../db/connection');

const NUM_OPCIONES = 3;

const findTemaStmt = db.prepare('SELECT id FROM temas WHERE numero = ? AND carnet = ?');
const insertPreguntaStmt = db.prepare(`
  INSERT INTO preguntas (tema_id, carnet, enunciado, imagen, explicacion, origen)
  VALUES (@tema_id, @carnet, @enunciado, @imagen, @explicacion, @origen)
`);
const insertOpcionStmt = db.prepare(`
  INSERT INTO opciones (pregunta_id, texto, es_correcta, explicacion, orden)
  VALUES (@pregunta_id, @texto, @es_correcta, @explicacion, @orden)
`);

/**
 * Busca el id interno de un tema a partir de su número oficial (1-24) y carnet.
 * Devuelve null si no existe (la pregunta se insertará sin tema asignado).
 */
function findTemaId(numero, carnet = 'B') {
  if (!numero) return null;
  const row = findTemaStmt.get(numero, carnet);
  return row ? row.id : null;
}

/**
 * Genera una explicación por defecto para una opción cuando la fuente de
 * datos no trae una explicación específica por respuesta (es el caso, por
 * ejemplo, del dataset anki-carnet-conducir, que solo trae una explicación
 * general de la pregunta). Se reutiliza esa explicación general como
 * explicación de la opción correcta, y se genera un texto de contraste breve
 * para las opciones incorrectas señalando cuál es la respuesta correcta.
 */
function generarExplicacionOpcion({ esCorrecta, textoOpcionCorrecta, explicacionGeneral }) {
  const general = (explicacionGeneral || '').trim();
  const sinDatos = 'La fuente original de esta pregunta no incluye una explicación adicional.';
  if (esCorrecta) {
    return general || `Respuesta correcta. ${sinDatos}`;
  }
  const base = `Esta opción no es correcta. La respuesta correcta es: "${textoOpcionCorrecta}".`;
  return general ? `${base} ${general}` : `${base} ${sinDatos}`;
}

/**
 * Inserta una pregunta junto con sus 3 opciones de respuesta.
 * @param {Object} data
 * @param {number|null} data.tema_numero - número oficial del tema (1-24) o null
 * @param {string} data.carnet - 'B', 'A1' o 'D'
 * @param {string} data.enunciado
 * @param {string|null} data.imagen - nombre de archivo dentro de public/images/preguntas, o null
 * @param {Array<{texto:string, correcta:boolean, explicacion?:string}>} data.opciones - EXACTAMENTE 3 opciones
 * @param {string} data.explicacion - explicación general de la pregunta (se usa además como base/fallback por opción)
 * @param {string} data.origen - identificador de la fuente de la pregunta
 * @returns {number} id de la pregunta insertada
 */
function insertQuestion(data) {
  const {
    tema_numero = null,
    carnet = 'B',
    enunciado,
    imagen = null,
    opciones = [],
    explicacion = '',
    origen = 'desconocido',
  } = data;

  if (!enunciado || !enunciado.trim()) {
    throw new Error('La pregunta no tiene enunciado.');
  }
  if (!Array.isArray(opciones) || opciones.length !== NUM_OPCIONES) {
    throw new Error(`La pregunta "${enunciado.slice(0, 40)}..." debe tener exactamente ${NUM_OPCIONES} opciones (tiene ${opciones.length}).`);
  }
  const correctas = opciones.filter((o) => o.correcta);
  if (correctas.length !== 1) {
    throw new Error(`La pregunta "${enunciado.slice(0, 40)}..." debe tener exactamente 1 opción correcta.`);
  }

  const tema_id = findTemaId(tema_numero, carnet);
  const textoOpcionCorrecta = correctas[0].texto.trim();

  const insertAll = db.transaction(() => {
    const result = insertPreguntaStmt.run({
      tema_id,
      carnet,
      enunciado: enunciado.trim(),
      imagen,
      explicacion: (explicacion || '').trim(),
      origen,
    });
    const preguntaId = result.lastInsertRowid;

    opciones.forEach((op, idx) => {
      const explicacionOpcion = (op.explicacion && op.explicacion.trim())
        ? op.explicacion.trim()
        : generarExplicacionOpcion({
            esCorrecta: !!op.correcta,
            textoOpcionCorrecta,
            explicacionGeneral: explicacion,
          });

      insertOpcionStmt.run({
        pregunta_id: preguntaId,
        texto: op.texto.trim(),
        es_correcta: op.correcta ? 1 : 0,
        explicacion: explicacionOpcion,
        orden: idx,
      });
    });

    return preguntaId;
  });

  return insertAll();
}

module.exports = { insertQuestion, findTemaId, NUM_OPCIONES };
