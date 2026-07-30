// src/services/noteService.js
// Lógica de negocio del "Cuaderno": crear, listar (con filtros y orden),
// obtener, actualizar y eliminar notas del usuario.

const db = require('../db/connection');

/**
 * Genera un título por defecto cuando el usuario no escribe uno manualmente:
 * - Si la nota está vinculada a una pregunta, usa su enunciado (truncado de
 *   forma limpia, cortando por palabra completa, nunca a mitad de palabra).
 * - Si no está vinculada a ninguna pregunta, usa "Nota rápida".
 * Nunca devuelve un título vacío ni genérico tipo "Explicación del experto".
 */
function generarTituloPorDefecto(pregunta_id) {
  if (!pregunta_id) return 'Nota rápida';
  const pregunta = db.prepare('SELECT enunciado FROM preguntas WHERE id = ?').get(pregunta_id);
  if (!pregunta || !pregunta.enunciado) return 'Nota rápida';

  const MAX = 70;
  const texto = pregunta.enunciado.trim();
  if (texto.length <= MAX) return texto;

  const cortado = texto.slice(0, MAX);
  const ultimoEspacio = cortado.lastIndexOf(' ');
  const limpio = ultimoEspacio > 30 ? cortado.slice(0, ultimoEspacio) : cortado;
  return `${limpio}…`;
}

const ORDENES_VALIDOS = {
  recientes: 'n.actualizado_en DESC',
  antiguas: 'n.actualizado_en ASC',
  alfabetico: 'n.titulo COLLATE NOCASE ASC',
  tema: 't.numero ASC, n.actualizado_en DESC',
  categoria: 'n.categoria COLLATE NOCASE ASC, n.actualizado_en DESC',
};

function crearNota(usuario_id, data) {
  const {
    pregunta_id = null,
    tema_id = null,
    examen_id = null,
    titulo = '',
    contenido,
    origen = 'manual',
    categoria = null,
    etiquetas = null,
  } = data;

  if (!contenido || !contenido.trim()) {
    throw new Error('La nota no puede estar vacía.');
  }
  if (!['manual', 'ia', 'mixta'].includes(origen)) {
    throw new Error('Origen de nota no válido.');
  }

  const result = db
    .prepare(
      `INSERT INTO notas (usuario_id, pregunta_id, tema_id, examen_id, titulo, contenido, origen, categoria, etiquetas)
       VALUES (@usuario_id, @pregunta_id, @tema_id, @examen_id, @titulo, @contenido, @origen, @categoria, @etiquetas)`
    )
    .run({
      usuario_id,
      pregunta_id,
      tema_id,
      examen_id,
      titulo: (titulo && titulo.trim()) ? titulo.trim() : generarTituloPorDefecto(pregunta_id),
      contenido: contenido.trim(),
      origen,
      categoria: categoria ? categoria.trim() : null,
      etiquetas: etiquetas ? etiquetas.trim() : null,
    });

  return obtenerNota(usuario_id, result.lastInsertRowid);
}

function obtenerNota(usuario_id, id) {
  return db
    .prepare(
      `SELECT n.*, p.enunciado AS pregunta_enunciado, p.imagen AS pregunta_imagen, t.numero AS tema_numero, t.nombre AS tema_nombre, e.nombre AS examen_nombre
       FROM notas n
       LEFT JOIN preguntas p ON p.id = n.pregunta_id
       LEFT JOIN temas t ON t.id = n.tema_id
       LEFT JOIN examenes_oficiales e ON e.id = n.examen_id
       WHERE n.id = ? AND n.usuario_id = ?`
    )
    .get(id, usuario_id);
}

function listarNotas(usuario_id, filtros = {}) {
  const { tema_id, categoria, etiqueta, pregunta_id, origen, orden = 'recientes' } = filtros;

  const condiciones = ['n.usuario_id = ?'];
  const params = [usuario_id];

  if (tema_id) { condiciones.push('n.tema_id = ?'); params.push(tema_id); }
  if (categoria) { condiciones.push('n.categoria = ?'); params.push(categoria); }
  if (pregunta_id) { condiciones.push('n.pregunta_id = ?'); params.push(pregunta_id); }
  if (origen) { condiciones.push('n.origen = ?'); params.push(origen); }
  if (etiqueta) { condiciones.push("(',' || n.etiquetas || ',') LIKE ?"); params.push(`%,${etiqueta},%`); }

  const ordenSql = ORDENES_VALIDOS[orden] || ORDENES_VALIDOS.recientes;

  return db
    .prepare(
      `SELECT n.*, p.enunciado AS pregunta_enunciado, p.imagen AS pregunta_imagen, t.numero AS tema_numero, t.nombre AS tema_nombre
       FROM notas n
       LEFT JOIN preguntas p ON p.id = n.pregunta_id
       LEFT JOIN temas t ON t.id = n.tema_id
       WHERE ${condiciones.join(' AND ')}
       ORDER BY ${ordenSql}`
    )
    .all(...params);
}

function actualizarNota(usuario_id, id, data) {
  const existente = obtenerNota(usuario_id, id);
  if (!existente) throw new Error('Nota no encontrada.');

  const { titulo, contenido, categoria, etiquetas, tema_id } = data;
  if (!contenido || !contenido.trim()) throw new Error('La nota no puede estar vacía.');

  db.prepare(
    `UPDATE notas SET titulo = ?, contenido = ?, categoria = ?, etiquetas = ?, tema_id = ?, actualizado_en = datetime('now')
     WHERE id = ? AND usuario_id = ?`
  ).run(
    (titulo && titulo.trim()) ? titulo.trim() : generarTituloPorDefecto(existente.pregunta_id),
    contenido.trim(),
    categoria ? categoria.trim() : null,
    etiquetas ? etiquetas.trim() : null,
    tema_id || null,
    id,
    usuario_id
  );

  return obtenerNota(usuario_id, id);
}

function eliminarNota(usuario_id, id) {
  const result = db.prepare('DELETE FROM notas WHERE id = ? AND usuario_id = ?').run(id, usuario_id);
  if (result.changes === 0) throw new Error('Nota no encontrada.');
}

/** Listas de valores usados para poblar los filtros del cuaderno. */
function opcionesFiltro(usuario_id) {
  const categorias = db.prepare(`SELECT DISTINCT categoria FROM notas WHERE usuario_id = ? AND categoria IS NOT NULL AND categoria != '' ORDER BY categoria`).all(usuario_id).map((r) => r.categoria);
  const etiquetasRaw = db.prepare(`SELECT etiquetas FROM notas WHERE usuario_id = ? AND etiquetas IS NOT NULL AND etiquetas != ''`).all(usuario_id);
  const etiquetasSet = new Set();
  etiquetasRaw.forEach((r) => r.etiquetas.split(',').map((t) => t.trim()).filter(Boolean).forEach((t) => etiquetasSet.add(t)));
  return { categorias, etiquetas: [...etiquetasSet].sort() };
}

module.exports = { crearNota, obtenerNota, listarNotas, actualizarNota, eliminarNota, opcionesFiltro };
