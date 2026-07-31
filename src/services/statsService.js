// src/services/statsService.js
// Consultas agregadas para las pantallas de progreso/estadísticas del usuario.

const db = require('../db/connection');

function resumenGlobal(usuario_id) {
  const totales = db
    .prepare(
      `SELECT
         COUNT(*) AS total_tests,
         COALESCE(SUM(aciertos), 0) AS total_aciertos,
         COALESCE(SUM(fallos), 0) AS total_fallos,
         COALESCE(SUM(en_blanco), 0) AS total_en_blanco,
         COALESCE(SUM(aprobado), 0) AS total_aprobados
       FROM tests
       WHERE usuario_id = ? AND finalizado_en IS NOT NULL`
    )
    .get(usuario_id);

  const totalPreguntas = totales.total_aciertos + totales.total_fallos + totales.total_en_blanco;
  const porcentajeAcierto = totalPreguntas > 0 ? Math.round((totales.total_aciertos / totalPreguntas) * 1000) / 10 : 0;

  const ultimos = db
    .prepare(
      `SELECT id, tipo, carnet, num_preguntas, aciertos, fallos, en_blanco, aprobado, finalizado_en
       FROM tests
       WHERE usuario_id = ? AND finalizado_en IS NOT NULL
       ORDER BY finalizado_en DESC
       LIMIT 10`
    )
    .all(usuario_id);

  return {
    totalTests: totales.total_tests,
    totalAprobados: totales.total_aprobados,
    totalSuspensos: totales.total_tests - totales.total_aprobados,
    totalAciertos: totales.total_aciertos,
    totalFallos: totales.total_fallos,
    totalEnBlanco: totales.total_en_blanco,
    porcentajeAcierto,
    ultimos,
  };
}

function statsPorTema(usuario_id, carnet = 'B') {
  return db
    .prepare(
      `SELECT
         t.id AS tema_id,
         t.numero AS tema_numero,
         t.nombre AS tema_nombre,
         COALESCE(SUM(CASE WHEN tp.es_correcta = 1 THEN 1 ELSE 0 END), 0) AS aciertos,
         COALESCE(SUM(CASE WHEN tp.es_correcta = 0 THEN 1 ELSE 0 END), 0) AS fallos,
         COUNT(tp.id) AS respondidas
       FROM temas t
       LEFT JOIN preguntas p ON p.tema_id = t.id AND p.carnet = t.carnet
       LEFT JOIN test_preguntas tp ON tp.pregunta_id = p.id
         AND tp.opcion_elegida_id IS NOT NULL
         AND tp.test_id IN (SELECT id FROM tests WHERE usuario_id = ?)
       WHERE t.carnet = ?
       GROUP BY t.id
       ORDER BY t.numero ASC`
    )
    .all(usuario_id, carnet);
}

function statsPorExamenOficial(usuario_id) {
  return db
    .prepare(
      `SELECT
         e.id AS examen_id,
         e.nombre AS examen_nombre,
         COUNT(t.id) AS intentos,
         MAX(CASE WHEN t.aprobado = 1 THEN 1 ELSE 0 END) AS aprobado_alguna_vez,
         MAX(t.aciertos) AS mejor_resultado
       FROM examenes_oficiales e
       LEFT JOIN tests t ON t.examen_id = e.id AND t.usuario_id = ? AND t.finalizado_en IS NOT NULL
       WHERE e.tema_id IS NULL
       GROUP BY e.id
       ORDER BY e.id ASC`
    )
    .all(usuario_id);
}

module.exports = { resumenGlobal, statsPorTema, statsPorExamenOficial };
