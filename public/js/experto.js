// public/js/experto.js
// Modal de chat "Consulta a un experto" (IA contextual por pregunta) y modal
// de nota rápida. Se expone como window.ExpertoChat y window.NotaRapida para
// que test.js los abra/cierre al navegar entre preguntas.

(function () {
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

  // ---------------------------------------------------------------------
  // Chat con el experto
  // ---------------------------------------------------------------------
  const modalExperto = document.getElementById('modal-experto');
  const mensajesEl = document.getElementById('mensajes-experto');
  const formExperto = document.getElementById('form-experto');
  const inputExperto = document.getElementById('input-experto');
  const btnCerrarExperto = document.getElementById('btn-cerrar-experto');
  const btnEnviarExperto = document.getElementById('btn-enviar-experto');

  let preguntaActualId = null;
  let historialLocal = []; // [{role, content}] de la pregunta actual, se reinicia al cambiar de pregunta

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  // Interpreta un subconjunto seguro de markdown (negrita, cursiva, código
  // en línea) que suele usar el modelo de IA en sus respuestas. Escapamos el
  // HTML primero, así que las sustituciones solo añaden etiquetas seguras
  // alrededor de texto ya neutralizado: no abre ninguna vía de inyección.
  function formatearTexto(texto) {
    let html = escapeHtml(texto);
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/(?<!\*)\*([^*]+?)\*(?!\*)/g, '<em>$1</em>');
    html = html.replace(/`([^`]+?)`/g, '<code>$1</code>');
    html = html.replace(/\n/g, '<br>');
    return html;
  }

  function pintarMensaje({ rol, texto, permitirGuardar }) {
    const div = document.createElement('div');
    div.className = `mensaje-chat ${rol}`;
    div.innerHTML = `<div class="contenido">${formatearTexto(texto)}</div>`;
    if (permitirGuardar) {
      const acciones = document.createElement('div');
      acciones.className = 'acciones-mensaje';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.innerHTML = '<i data-lucide="sticky-note" class="icon-sm"></i> Guardar en notas';
      btn.addEventListener('click', () => guardarComoNota(texto, btn));
      acciones.appendChild(btn);
      div.appendChild(acciones);
    }
    mensajesEl.appendChild(div);
    mensajesEl.scrollTop = mensajesEl.scrollHeight;
    if (window.lucide) lucide.createIcons();
    return div;
  }

  async function guardarComoNota(contenido, btn) {
    btn.disabled = true;
    btn.textContent = 'Guardando...';
    try {
      const res = await fetch('/api/notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ preguntaId: preguntaActualId, contenido, origen: 'ia' }),
      });
      if (!res.ok) throw new Error();
      btn.innerHTML = '<i data-lucide="check" class="icon-sm"></i> Guardada';
      if (window.lucide) lucide.createIcons();
    } catch {
      btn.textContent = 'Error al guardar';
      btn.disabled = false;
    }
  }

  async function enviarMensaje(texto) {
    pintarMensaje({ rol: 'usuario', texto });
    const loading = pintarMensaje({ rol: 'asistente', texto: 'Escribiendo...' });

    try {
      const res = await fetch('/api/expert-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ preguntaId: preguntaActualId, mensaje: texto, historial: historialLocal }),
      });
      const data = await res.json();
      loading.remove();

      if (!res.ok) {
        pintarMensaje({ rol: 'sistema', texto: data.error || 'No se ha podido consultar al experto.' });
        return;
      }

      pintarMensaje({ rol: 'asistente', texto: data.respuesta, permitirGuardar: true });
      historialLocal.push({ role: 'user', content: texto });
      historialLocal.push({ role: 'assistant', content: data.respuesta });
    } catch (e) {
      loading.remove();
      pintarMensaje({ rol: 'sistema', texto: 'Error de conexión. Comprueba tu red e inténtalo de nuevo.' });
    }
  }

  formExperto.addEventListener('submit', (e) => {
    e.preventDefault();
    const texto = inputExperto.value.trim();
    if (!texto) return;
    inputExperto.value = '';
    enviarMensaje(texto);
  });

  inputExperto.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      formExperto.requestSubmit();
    }
  });

  btnCerrarExperto.addEventListener('click', () => window.ExpertoChat.cerrar());
  modalExperto.addEventListener('click', (e) => { if (e.target === modalExperto) window.ExpertoChat.cerrar(); });

  window.ExpertoChat = {
    abrir(preguntaId) {
      // Si cambiamos de pregunta, reiniciamos la conversación (nunca se mezclan preguntas distintas)
      if (preguntaActualId !== preguntaId) {
        preguntaActualId = preguntaId;
        historialLocal = [];
        mensajesEl.innerHTML = '<div class="mensaje-chat sistema">Pregúntale lo que quieras sobre esta pregunta. La conversación se reinicia al cambiar de pregunta.</div>';
      }
      modalExperto.classList.add('abierto');
      inputExperto.focus();
    },
    cerrar() {
      modalExperto.classList.remove('abierto');
    },
    resetear() {
      preguntaActualId = null;
      historialLocal = [];
    },
  };

  // ---------------------------------------------------------------------
  // Nota rápida
  // ---------------------------------------------------------------------
  const modalNota = document.getElementById('modal-nota-rapida');
  const inputNota = document.getElementById('input-nota-rapida');
  const btnCerrarNota = document.getElementById('btn-cerrar-nota');
  const btnGuardarNota = document.getElementById('btn-guardar-nota-rapida');
  const estadoNota = document.getElementById('estado-nota-rapida');
  let notaPreguntaId = null;

  btnCerrarNota.addEventListener('click', () => window.NotaRapida.cerrar());
  modalNota.addEventListener('click', (e) => { if (e.target === modalNota) window.NotaRapida.cerrar(); });

  btnGuardarNota.addEventListener('click', async () => {
    const contenido = inputNota.value.trim();
    if (!contenido) { estadoNota.textContent = 'Escribe algo antes de guardar.'; return; }
    btnGuardarNota.disabled = true;
    estadoNota.textContent = 'Guardando...';
    try {
      const res = await fetch('/api/notas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ preguntaId: notaPreguntaId, contenido, origen: 'manual' }),
      });
      if (!res.ok) throw new Error();
      estadoNota.textContent = 'Nota guardada';
      inputNota.value = '';
      setTimeout(() => window.NotaRapida.cerrar(), 700);
    } catch {
      estadoNota.textContent = 'No se ha podido guardar. Inténtalo de nuevo.';
      btnGuardarNota.disabled = false;
    }
  });

  window.NotaRapida = {
    abrir(preguntaId) {
      notaPreguntaId = preguntaId;
      inputNota.value = '';
      estadoNota.textContent = '';
      btnGuardarNota.disabled = false;
      modalNota.classList.add('abierto');
      inputNota.focus();
    },
    cerrar() {
      modalNota.classList.remove('abierto');
    },
  };
})();
