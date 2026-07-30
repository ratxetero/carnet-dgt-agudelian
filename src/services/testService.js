// src/services/testService.js
// Lógica de negocio de los tests: creación de las distintas modalidades,
// registro de respuestas y cálculo de resultados.

const db = require('../db/connection');

const MAX_PREGUNTAS_TEST_ESTANDAR = 30;
// Regla DGT: máximo 3 fallos en un test de 30 preguntas para aprobar.
// Se generaliza proporcionalmente para tests de otro tamaño (p.ej. por tema).
function calcularFallosPermitidos(numPreguntas) {
  if (numPreguntas <= 0) return 0;
  return Math.max(1, Math.round((3 / MAX_PREGUNTAS_TEST_ESTANDAR) * numPreguntas));
}

function barajar(array) {
  const copia = [...array];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const crearTestStmt = db.prepare(`
  INSERT INTO tests (usuario_id, tipo, tema_id, examen_id, carnet, num_preguntas)
  VALUES (@usuario_id, @tipo, @tema_id, @examen_id, @carnet, @num_preguntas)
`);
const insertTestPreguntaStmt = db.prepare(`
  INSERT INTO test_preguntas (test_id, pregunta_id, orden) VALUES (?, ?, ?)
`);

function crearTestConPreguntas({ usuario_id, tipo, tema_id = null, examen_id = null, carnet = 'B', preguntaIds }) {
  if (!preguntaIds.length) {
    throw new Error('No hay preguntas disponibles para crear este test.');
  }
  const crear = db.transaction(() => {
    const result = crearTestStmt.run({
      usuario_id,
      tipo,
      tema_id,
      examen_id,
      carnet,
      num_preguntas: preguntaIds.length,
    });
    const testId = result.lastInsertRowid;
    preguntaIds.forEach((pid, idx) => insertTestPreguntaStmt.run(testId, pid, idx + 1));
    return testId;
  });
  return crear();
}

/** Test aleatorio: N preguntas al azar de todo el banco de un carnet. */
function crearTestAleatorio(usuario_id, carnet = 'B', n = MAX_PREGUNTAS_TEST_ESTANDAR) {
  const todas = db.prepare('SELECT id FROM preguntas WHERE carnet = ?').all(carnet).map((r) => r.id);
  const elegidas = barajar(todas).slice(0, n);
  return crearTestConPreguntas({ usuario_id, tipo: 'aleatorio', carnet, preguntaIds: elegidas });
}

/** Test por tema: hasta N preguntas al azar de un tema concreto. */
function crearTestPorTema(usuario_id, tema_id, carnet = 'B', n = MAX_PREGUNTAS_TEST_ESTANDAR) {
  const delTema = db.prepare('SELECT id FROM preguntas WHERE tema_id = ? AND carnet = ?').all(tema_id, carnet).map((r) => r.id);
  const elegidas = barajar(delTema).slice(0, n);
  return crearTestConPreguntas({ usuario_id, tipo: 'tema', tema_id, carnet, preguntaIds: elegidas });
}

/**
 * Crea un test a partir de un "bloque" ya generado (fila de examenes_oficiales):
 * puede ser un simulacro oficial mixto (tema_id NULL) o un bloque de un tema
 * concreto (tema_id relleno) — ambos comparten la misma estructura de datos.
 */
function crearTestOficial(usuario_id, examen_id) {
  const examen = db.prepare('SELECT * FROM examenes_oficiales WHERE id = ?').get(examen_id);
  if (!examen) throw new Error('Simulacro/bloque no encontrado.');
  const preguntas = db
    .prepare('SELECT pregunta_id FROM examen_preguntas WHERE examen_id = ? ORDER BY orden ASC')
    .all(examen_id)
    .map((r) => r.pregunta_id);
  const tipo = examen.tema_id ? 'tema' : 'oficial';
  return crearTestConPreguntas({
    usuario_id,
    tipo,
    tema_id: examen.tema_id || null,
    examen_id,
    carnet: examen.carnet,
    preguntaIds: preguntas,
  });
}

/**
 * Reanuda el test en curso de un usuario para un bloque/simulacro concreto si
 * existe uno sin finalizar; si no, crea uno nuevo. Así, si el usuario
 * abandona un simulacro a medias, al volver a entrar continúa donde lo dejó
 * en vez de perder el progreso.
 */
function iniciarOReanudarBloque(usuario_id, examen_id) {
  const enCurso = db
    .prepare(
      `SELECT id FROM tests WHERE usuario_id = ? AND examen_id = ? AND finalizado_en IS NULL ORDER BY iniciado_en DESC LIMIT 1`
    )
    .get(usuario_id, examen_id);
  if (enCurso) return enCurso.id;
  return crearTestOficial(usuario_id, examen_id);
}

/**
 * Estado de un bloque/simulacro concreto para un usuario: si tiene un
 * intento en curso (con su % de progreso), el último resultado si ya lo
 * completó alguna vez, o que todavía no lo ha empezado.
 */
function progresoDeBloque(usuario_id, examen_id) {
  const ultimo = db
    .prepare('SELECT * FROM tests WHERE usuario_id = ? AND examen_id = ? ORDER BY iniciado_en DESC LIMIT 1')
    .get(usuario_id, examen_id);

  if (!ultimo) return { estado: 'nuevo' };

  if (!ultimo.finalizado_en) {
    const respondidas = db
      .prepare('SELECT COUNT(*) n FROM test_preguntas WHERE test_id = ? AND opcion_elegida_id IS NOT NULL')
      .get(ultimo.id).n;
    const porcentaje = ultimo.num_preguntas > 0 ? Math.round((respondidas / ultimo.num_preguntas) * 100) : 0;
    return { estado: 'en_progreso', testId: ultimo.id, respondidas, total: ultimo.num_preguntas, porcentaje };
  }

  return {
    estado: 'completado',
    testId: ultimo.id,
    aciertos: ultimo.aciertos,
    total: ultimo.num_preguntas,
    aprobado: !!ultimo.aprobado,
  };
}

/** Lista los bloques de test por tema (id, nombre, nº de preguntas) agrupados por tema_id. */
function listarBloquesPorTema(carnet = 'B') {
  const filas = db
    .prepare(
      `SELECT e.id, e.nombre, e.tema_id, COUNT(ep.id) AS num_preguntas
       FROM examenes_oficiales e
       JOIN examen_preguntas ep ON ep.examen_id = e.id
       WHERE e.carnet = ? AND e.tema_id IS NOT NULL
       GROUP BY e.id
       ORDER BY e.id ASC`
    )
    .all(carnet);

  const porTema = {};
  for (const fila of filas) {
    if (!porTema[fila.tema_id]) porTema[fila.tema_id] = [];
    porTema[fila.tema_id].push({ id: fila.id, nombre: fila.nombre, numPreguntas: fila.num_preguntas });
  }
  return porTema;
}

/** Lista los simulacros oficiales mixtos (tema_id NULL). */
function listarSimulacros(carnet = 'B') {
  const filas = db
    .prepare(
      `SELECT e.id, e.nombre, COUNT(ep.id) AS num_preguntas
       FROM examenes_oficiales e
       JOIN examen_preguntas ep ON ep.examen_id = e.id
       WHERE e.carnet = ? AND e.tema_id IS NULL
       GROUP BY e.id
       ORDER BY e.id ASC`
    )
    .all(carnet);
  // Normalizamos aquí el nombre de la columna SQL (num_preguntas) al formato
  // camelCase que consume la vista (numPreguntas). Este era exactamente el
  // origen del bug "undefined preguntas": listarBloquesPorTema sí lo hacía,
  // esta función no.
  return filas.map((f) => ({ id: f.id, nombre: f.nombre, numPreguntas: f.num_preguntas }));
}

/** Nº de preguntas falladas alguna vez por el usuario, agrupado por tema (para las tarjetas de repaso). */
function fallosPorTema(usuario_id, carnet = 'B') {
  const filas = db
    .prepare(
      `SELECT p.tema_id, COUNT(DISTINCT p.id) AS n
       FROM test_preguntas tp
       JOIN tests t ON t.id = tp.test_id
       JOIN preguntas p ON p.id = tp.pregunta_id
       WHERE t.usuario_id = ? AND tp.es_correcta = 0 AND p.carnet = ?
       GROUP BY p.tema_id`
    )
    .all(usuario_id, carnet);

  const porTema = {};
  let total = 0;
  for (const fila of filas) {
    porTema[fila.tema_id || 'sin_tema'] = fila.n;
    total += fila.n;
  }
  return { porTema, total };
}

/** Test de repaso: preguntas falladas anteriormente por el usuario, opcionalmente filtradas por tema. */
function crearTestRepaso(usuario_id, carnet = 'B', tema_id = null) {
  let query = `
    SELECT DISTINCT p.id
    FROM test_preguntas tp
    JOIN tests t ON t.id = tp.test_id
    JOIN preguntas p ON p.id = tp.pregunta_id
    WHERE t.usuario_id = ? AND tp.es_correcta = 0 AND p.carnet = ?
  `;
  const params = [usuario_id, carnet];
  if (tema_id) {
    query += ' AND p.tema_id = ?';
    params.push(tema_id);
  }
  const preguntas = db.prepare(query).all(...params).map((r) => r.id);
  const elegidas = barajar(preguntas);
  return crearTestConPreguntas({ usuario_id, tipo: 'repaso', tema_id, carnet, preguntaIds: elegidas });
}

/** Devuelve el test (si pertenece al usuario) junto con sus preguntas y opciones, SIN indicar cuál es correcta. */
function obtenerTestParaJugar(testId, usuario_id) {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND usuario_id = ?').get(testId, usuario_id);
  if (!test) return null;

  const preguntas = db
    .prepare(
      `SELECT tp.orden, tp.opcion_elegida_id, tp.es_correcta, p.id AS pregunta_id, p.enunciado, p.imagen
       FROM test_preguntas tp
       JOIN preguntas p ON p.id = tp.pregunta_id
       WHERE tp.test_id = ?
       ORDER BY tp.orden ASC`
    )
    .all(testId);

  const opcionesStmt = db.prepare('SELECT id, texto, orden FROM opciones WHERE pregunta_id = ? ORDER BY orden ASC');

  const preguntasConOpciones = preguntas.map((p) => ({
    orden: p.orden,
    preguntaId: p.pregunta_id,
    enunciado: p.enunciado,
    imagen: p.imagen,
    yaRespondida: p.opcion_elegida_id !== null,
    opcionElegidaId: p.opcion_elegida_id,
    esCorrecta: p.es_correcta,
    opciones: opcionesStmt.all(p.pregunta_id),
  }));

  return { test, preguntas: preguntasConOpciones };
}

/** Registra la respuesta del usuario a una pregunta concreta del test. */
function responderPregunta(testId, usuario_id, preguntaId, opcionId) {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND usuario_id = ?').get(testId, usuario_id);
  if (!test) throw new Error('Test no encontrado.');
  if (test.finalizado_en) throw new Error('Este test ya ha finalizado.');

  const perteneceAlTest = db
    .prepare('SELECT id FROM test_preguntas WHERE test_id = ? AND pregunta_id = ?')
    .get(testId, preguntaId);
  if (!perteneceAlTest) throw new Error('La pregunta no pertenece a este test.');

  const opcion = db.prepare('SELECT * FROM opciones WHERE id = ? AND pregunta_id = ?').get(opcionId, preguntaId);
  if (!opcion) throw new Error('Opción de respuesta no válida.');

  const esCorrecta = opcion.es_correcta === 1 ? 1 : 0;

  db.prepare(
    `UPDATE test_preguntas
     SET opcion_elegida_id = ?, es_correcta = ?, respondida_en = datetime('now')
     WHERE test_id = ? AND pregunta_id = ?`
  ).run(opcionId, esCorrecta, testId, preguntaId);

  const opcionCorrecta = db
    .prepare('SELECT id, explicacion FROM opciones WHERE pregunta_id = ? AND es_correcta = 1')
    .get(preguntaId);

  return {
    esCorrecta: !!esCorrecta,
    opcionElegidaExplicacion: opcion.explicacion,
    opcionCorrectaId: opcionCorrecta ? opcionCorrecta.id : null,
    opcionCorrectaExplicacion: opcionCorrecta ? opcionCorrecta.explicacion : '',
  };
}

/** Finaliza el test: calcula aciertos/fallos/en blanco, nota, aprobado y desglose por tema. */
function finalizarTest(testId, usuario_id, tiempoSegundos = null) {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND usuario_id = ?').get(testId, usuario_id);
  if (!test) throw new Error('Test no encontrado.');

  const filas = db
    .prepare(
      `SELECT tp.es_correcta, p.tema_id, t.nombre AS tema_nombre, t.numero AS tema_numero
       FROM test_preguntas tp
       JOIN preguntas p ON p.id = tp.pregunta_id
       LEFT JOIN temas t ON t.id = p.tema_id
       WHERE tp.test_id = ?`
    )
    .all(testId);

  let aciertos = 0;
  let fallos = 0;
  let enBlanco = 0;
  const desglosePorTema = new Map();

  for (const fila of filas) {
    const key = fila.tema_id || 'sin-tema';
    if (!desglosePorTema.has(key)) {
      desglosePorTema.set(key, {
        tema_id: fila.tema_id,
        tema_numero: fila.tema_numero,
        tema_nombre: fila.tema_nombre || 'Sin tema asignado',
        aciertos: 0,
        fallos: 0,
        en_blanco: 0,
      });
    }
    const bucket = desglosePorTema.get(key);

    if (fila.es_correcta === null || fila.es_correcta === undefined) {
      enBlanco++;
      bucket.en_blanco++;
    } else if (fila.es_correcta === 1) {
      aciertos++;
      bucket.aciertos++;
    } else {
      fallos++;
      bucket.fallos++;
    }
  }

  const fallosPermitidos = calcularFallosPermitidos(test.num_preguntas);
  // Las preguntas en blanco cuentan como fallo a efectos de aprobar el examen.
  const aprobado = (fallos + enBlanco) <= fallosPermitidos ? 1 : 0;

  db.prepare(
    `UPDATE tests
     SET aciertos = ?, fallos = ?, en_blanco = ?, aprobado = ?, tiempo_segundos = ?, finalizado_en = datetime('now')
     WHERE id = ?`
  ).run(aciertos, fallos, enBlanco, aprobado, tiempoSegundos, testId);

  return {
    testId,
    numPreguntas: test.num_preguntas,
    aciertos,
    fallos,
    enBlanco,
    fallosPermitidos,
    aprobado: !!aprobado,
    desglosePorTema: [...desglosePorTema.values()],
  };
}

/** Devuelve el resultado ya guardado de un test finalizado (para la pantalla de resultados). */
function obtenerResultados(testId, usuario_id) {
  const test = db.prepare('SELECT * FROM tests WHERE id = ? AND usuario_id = ?').get(testId, usuario_id);
  if (!test) return null;

  const filas = db
    .prepare(
      `SELECT tp.orden, tp.es_correcta, tp.opcion_elegida_id, p.id AS pregunta_id, p.enunciado, p.imagen, p.explicacion,
              t.id AS tema_id, t.nombre AS tema_nombre, t.numero AS tema_numero
       FROM test_preguntas tp
       JOIN preguntas p ON p.id = tp.pregunta_id
       LEFT JOIN temas t ON t.id = p.tema_id
       WHERE tp.test_id = ?
       ORDER BY tp.orden ASC`
    )
    .all(testId);

  const opcionesStmt = db.prepare('SELECT id, texto, es_correcta, explicacion, orden FROM opciones WHERE pregunta_id = ? ORDER BY orden ASC');

  const desglosePorTema = new Map();
  const detalle = filas.map((f) => {
    const key = f.tema_id || 'sin-tema';
    if (!desglosePorTema.has(key)) {
      desglosePorTema.set(key, {
        tema_id: f.tema_id,
        tema_numero: f.tema_numero,
        tema_nombre: f.tema_nombre || 'Sin tema asignado',
        aciertos: 0,
        fallos: 0,
        en_blanco: 0,
      });
    }
    const bucket = desglosePorTema.get(key);
    if (f.es_correcta === null) bucket.en_blanco++;
    else if (f.es_correcta === 1) bucket.aciertos++;
    else bucket.fallos++;

    return {
      orden: f.orden,
      preguntaId: f.pregunta_id,
      enunciado: f.enunciado,
      imagen: f.imagen,
      explicacion: f.explicacion,
      esCorrecta: f.es_correcta,
      opcionElegidaId: f.opcion_elegida_id,
      temaNombre: f.tema_nombre,
      opciones: opcionesStmt.all(f.pregunta_id),
    };
  });

  return {
    test,
    detalle,
    desglosePorTema: [...desglosePorTema.values()],
  };
}

module.exports = {
  MAX_PREGUNTAS_TEST_ESTANDAR,
  calcularFallosPermitidos,
  crearTestAleatorio,
  crearTestPorTema,
  crearTestOficial,
  iniciarOReanudarBloque,
  progresoDeBloque,
  listarBloquesPorTema,
  listarSimulacros,
  fallosPorTema,
  crearTestRepaso,
  obtenerTestParaJugar,
  responderPregunta,
  finalizarTest,
  obtenerResultados,
};
