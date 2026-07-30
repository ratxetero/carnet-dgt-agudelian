// src/services/expertChatService.js
// Llama a un proveedor de IA para la funcionalidad "Consulta a un experto".
// Por defecto usa OpenRouter (https://openrouter.ai) con su modelo gratuito
// "openrouter/free" (un enrutador automático que elige un modelo :free
// disponible en cada momento — el catálogo de modelos gratuitos de OpenRouter
// rota con frecuencia, así que fijar un modelo concreto se queda desactualizado
// rápido; "openrouter/free" evita ese problema). Se puede sobrescribir con
// OPENROUTER_MODEL en .env si prefieres fijar un modelo :free concreto.
//
// El diseño es deliberadamente desacoplado (un único punto de entrada,
// `preguntarAlExperto`) para poder cambiar de proveedor en el futuro sin
// tocar las rutas ni el frontend.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const SYSTEM_PROMPT_BASE = `Eres un profesor experto en el examen teórico de la DGT (carnet B, España).
Te voy a dar el enunciado de una pregunta de test, sus 3 opciones, cuál es la
opción correcta y, si existe, la explicación oficial disponible.

Tu tarea:
- Explica con claridad por qué la opción correcta lo es.
- Explica también, brevemente, por qué las otras dos opciones NO son correctas.
- Si el alumno hace preguntas de seguimiento sobre esta misma pregunta, respóndelas
  con el mismo rigor.
- Si no tienes certeza sobre una norma o dato concreto (por ejemplo una cifra exacta
  de la normativa de tráfico española), dilo explícitamente en vez de inventarlo.
- Responde siempre en español, con un tono cercano pero riguroso.
- Sé conciso: como máximo unos 150-180 palabras, salvo que el alumno pida explícitamente más detalle.
- No repitas literalmente el enunciado ni las opciones, el alumno ya las tiene delante.`;

function construirContextoPregunta({ enunciado, opciones, explicacionGeneral }) {
  const listaOpciones = opciones
    .map((o) => `- ${o.correcta ? '[CORRECTA] ' : ''}${o.texto}`)
    .join('\n');
  let contexto = `Pregunta: ${enunciado}\n\nOpciones:\n${listaOpciones}`;
  if (explicacionGeneral && explicacionGeneral.trim()) {
    contexto += `\n\nExplicación disponible en la fuente original: ${explicacionGeneral.trim()}`;
  } else {
    contexto += `\n\n(No hay explicación adicional disponible en la fuente original para esta pregunta; básate en tu conocimiento de la normativa de tráfico española.)`;
  }
  return contexto;
}

/**
 * @param {Object} params
 * @param {Object} params.pregunta - { enunciado, opciones: [{texto, correcta, explicacion}], explicacionGeneral }
 * @param {Array<{role:'user'|'assistant', content:string}>} params.historial - turnos previos de ESTA pregunta (solo en memoria del cliente)
 * @param {string} params.mensaje - último mensaje del usuario
 * @returns {Promise<string>} respuesta del asistente
 */
async function preguntarAlExperto({ pregunta, historial = [], mensaje }) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      'La consulta al experto no está configurada todavía: falta OPENROUTER_API_KEY en el archivo .env (ver README).'
    );
  }

  const modelo = process.env.OPENROUTER_MODEL || 'openrouter/free';
  const systemPrompt = `${SYSTEM_PROMPT_BASE}\n\n${construirContextoPregunta(pregunta)}`;

  const messages = [
    { role: 'system', content: systemPrompt },
    ...historial.slice(-10), // limitamos el historial para no disparar el tamaño del prompt
    { role: 'user', content: mensaje },
  ];

  let respuesta;
  try {
    respuesta = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': process.env.APP_URL || 'http://localhost:3000',
        'X-Title': 'Carnet DGT Agudelian',
      },
      body: JSON.stringify({
        model: modelo,
        messages,
        temperature: 0.4,
        max_tokens: 500,
      }),
    });
  } catch (e) {
    throw new Error('No se ha podido contactar con el servicio de IA (problema de red). Inténtalo de nuevo en un momento.');
  }

  if (!respuesta.ok) {
    const detalle = await respuesta.text().catch(() => '');
    if (respuesta.status === 401) {
      throw new Error('La clave de API de OpenRouter no es válida. Revisa OPENROUTER_API_KEY en tu .env.');
    }
    if (respuesta.status === 429) {
      throw new Error('El modelo gratuito de OpenRouter está saturado en este momento. Espera un minuto y vuelve a intentarlo.');
    }
    throw new Error(`El servicio de IA respondió con un error (${respuesta.status}). ${detalle.slice(0, 200)}`);
  }

  const data = await respuesta.json();
  const texto = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  if (!texto) {
    throw new Error('El servicio de IA no ha devuelto una respuesta válida. Inténtalo de nuevo.');
  }
  return texto.trim();
}

module.exports = { preguntarAlExperto };
