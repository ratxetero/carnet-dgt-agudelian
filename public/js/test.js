// public/js/test.js
// Lógica de la pantalla de realización de un test. Sin frameworks: JS plano.

(function () {
  const TEST_ID = window.__TEST_ID__;
  const preguntas = window.__PREGUNTAS__; // ver estructura devuelta por testService.obtenerTestParaJugar
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const inicio = Date.now();
  const CLAVE_MARCADAS = `marcadas-test-${TEST_ID}`;

  let indiceActual = 0;
  const LETRAS = ['A', 'B', 'C', 'D', 'E'];

  // Mapa local con el resultado de las preguntas ya respondidas en esta sesión de juego
  const respuestasLocal = new Map();
  preguntas.forEach((p) => {
    if (p.yaRespondida) {
      respuestasLocal.set(p.preguntaId, {
        opcionElegidaId: p.opcionElegidaId,
        esCorrecta: !!p.esCorrecta,
        opcionCorrectaId: null,
        opcionElegidaExplicacion: null,
        opcionCorrectaExplicacion: null,
      });
    }
  });

  // "Marcar para revisar": se guarda en localStorage (por dispositivo/navegador),
  // así sobrevive a recargas de la página dentro del mismo test.
  let marcadas = new Set();
  try {
    const guardado = JSON.parse(localStorage.getItem(CLAVE_MARCADAS) || '[]');
    marcadas = new Set(guardado);
  } catch (e) { /* si falla, simplemente empezamos sin marcadas */ }

  function guardarMarcadas() {
    try { localStorage.setItem(CLAVE_MARCADAS, JSON.stringify([...marcadas])); } catch (e) {}
    actualizarContadorMarcadas();
  }

  function actualizarContadorMarcadas() {
    const meta = document.getElementById('meta-marcadas');
    const span = document.getElementById('contador-marcadas');
    if (marcadas.size > 0) {
      meta.style.display = 'inline-flex';
      span.textContent = marcadas.size;
    } else {
      meta.style.display = 'none';
    }
  }

  const zonaPregunta = document.getElementById('zona-pregunta');
  const contador = document.getElementById('contador-preguntas');
  const barra = document.getElementById('barra-progreso');
  const btnAnterior = document.getElementById('btn-anterior');
  const btnSiguiente = document.getElementById('btn-siguiente');
  const cronometroEl = document.getElementById('cronometro');
  const toastFeedback = document.getElementById('toast-feedback');
  let temporizadorToast = null;

  function mostrarToastFeedback(esCorrecta) {
    clearTimeout(temporizadorToast);
    toastFeedback.className = 'toast-feedback visible ' + (esCorrecta ? 'correcta' : 'incorrecta');
    toastFeedback.innerHTML = `<i data-lucide="${esCorrecta ? 'check-circle-2' : 'x-circle'}" class="icon"></i> ${esCorrecta ? '¡Correcto!' : 'Incorrecto'}`;
    if (window.lucide) lucide.createIcons();
    temporizadorToast = setTimeout(() => { toastFeedback.classList.remove('visible'); }, 2600);
  }
  function ocultarToastFeedback() {
    clearTimeout(temporizadorToast);
    toastFeedback.classList.remove('visible');
  }

  function actualizarCronometro() {
    const segundos = Math.floor((Date.now() - inicio) / 1000);
    const m = Math.floor(segundos / 60).toString().padStart(2, '0');
    const s = (segundos % 60).toString().padStart(2, '0');
    cronometroEl.textContent = `${m}:${s}`;
  }
  actualizarCronometro();
  setInterval(actualizarCronometro, 1000);

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function render() {
    const p = preguntas[indiceActual];
    contador.textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
    barra.style.width = `${((indiceActual + 1) / preguntas.length) * 100}%`;
    btnAnterior.disabled = indiceActual === 0;
    const esUltima = indiceActual === preguntas.length - 1;
    btnSiguiente.innerHTML = esUltima
      ? '<i data-lucide="check-circle-2" class="icon"></i> Finalizar test'
      : 'Siguiente <i data-lucide="arrow-right" class="icon"></i>';

    const respuesta = respuestasLocal.get(p.preguntaId);
    const marcada = marcadas.has(p.preguntaId);

    let html = '';
    if (p.imagen) {
      html += `<img class="pregunta-imagen" src="/images/preguntas/${p.imagen}" alt="Imagen de la pregunta" />`;
    }
    html += `<div class="flex-between" style="align-items:flex-start;">`;
    html += `<h3 style="font-size:1.02rem; max-width:88%;">${escapeHtml(p.enunciado)}</h3>`;
    html += `<button type="button" class="btn-marcar ${marcada ? 'activo' : ''}" id="btn-marcar-revisar" title="Marcar para revisar"><i data-lucide="bookmark" class="icon-sm"></i></button>`;
    html += `</div>`;

    html += '<div class="opciones">';
    p.opciones.forEach((op, idx) => {
      let clase = 'opcion';
      if (respuesta) {
        if (op.id === respuesta.opcionElegidaId && respuesta.esCorrecta) clase += ' correcta';
        else if (op.id === respuesta.opcionElegidaId && !respuesta.esCorrecta) clase += ' incorrecta';
        else if (respuesta.opcionCorrectaId && op.id === respuesta.opcionCorrectaId) clase += ' correcta';
      }
      html += `<button type="button" class="${clase}" data-opcion-id="${op.id}" ${respuesta ? 'disabled' : ''}>`;
      html += `<span class="letra-opcion">${LETRAS[idx] || ''}</span>`;
      html += `<span>${escapeHtml(op.texto)}</span>`;
      html += `</button>`;
    });
    html += '</div>';

    html += `<div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:8px;">`;
    html += `<button type="button" class="btn secundario" id="btn-guardar-nota"><i data-lucide="sticky-note" class="icon"></i> Guardar en notas</button>`;
    if (respuesta) {
      html += `<button type="button" class="btn btn-experto" id="btn-consultar-experto"><i data-lucide="message-circle" class="icon"></i> Consulta a un experto</button>`;
    }
    html += `</div>`;

    zonaPregunta.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    if (respuesta) mostrarToastFeedback(respuesta.esCorrecta);
    else ocultarToastFeedback();

    zonaPregunta.querySelectorAll('.opcion').forEach((btn) => {
      btn.addEventListener('click', () => responder(p, Number(btn.dataset.opcionId)));
    });

    document.getElementById('btn-marcar-revisar').addEventListener('click', () => {
      if (marcadas.has(p.preguntaId)) marcadas.delete(p.preguntaId);
      else marcadas.add(p.preguntaId);
      guardarMarcadas();
      render();
    });

    document.getElementById('btn-guardar-nota').addEventListener('click', () => {
      window.NotaRapida.abrir(p.preguntaId);
    });

    const btnExperto = document.getElementById('btn-consultar-experto');
    if (btnExperto) {
      btnExperto.addEventListener('click', () => {
        window.ExpertoChat.abrir(p.preguntaId);
      });
    }

    // Si el modal del experto estaba abierto de la pregunta anterior, lo cerramos:
    // la conversación nunca debe mezclarse entre preguntas distintas.
    if (window.ExpertoChat) window.ExpertoChat.cerrar();
  }

  async function responder(pregunta, opcionId) {
    try {
      const res = await fetch(`/api/test/${TEST_ID}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ preguntaId: pregunta.preguntaId, opcionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al enviar la respuesta');

      respuestasLocal.set(pregunta.preguntaId, {
        opcionElegidaId: opcionId,
        esCorrecta: data.esCorrecta,
        opcionCorrectaId: data.opcionCorrectaId,
        opcionElegidaExplicacion: data.opcionElegidaExplicacion,
        opcionCorrectaExplicacion: data.opcionCorrectaExplicacion,
      });
      render();
    } catch (e) {
      alert(e.message);
    }
  }

  async function finalizar() {
    const tiempoSegundos = Math.round((Date.now() - inicio) / 1000);
    try {
      const res = await fetch(`/api/test/${TEST_ID}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
        body: JSON.stringify({ tiempoSegundos }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error al finalizar el test');
      try { localStorage.removeItem(CLAVE_MARCADAS); } catch (e) {}
      window.location.href = data.redirectTo;
    } catch (e) {
      alert(e.message);
    }
  }

  btnAnterior.addEventListener('click', () => {
    if (indiceActual > 0) {
      indiceActual--;
      render();
    }
  });

  btnSiguiente.addEventListener('click', () => {
    if (indiceActual < preguntas.length - 1) {
      indiceActual++;
      render();
    } else {
      const sinResponder = preguntas.length - respuestasLocal.size;
      const avisos = [];
      if (sinResponder > 0) avisos.push(`${sinResponder} pregunta(s) sin responder`);
      if (marcadas.size > 0) avisos.push(`${marcadas.size} pregunta(s) marcada(s) para revisar`);
      const confirmar = avisos.length > 0
        ? confirm(`Tienes ${avisos.join(' y ')}. ¿Seguro que quieres finalizar el test?`)
        : true;
      if (confirmar) finalizar();
    }
  });

  if (preguntas.length) {
    actualizarContadorMarcadas();
    render();
  } else {
    zonaPregunta.innerHTML = '<p>No hay preguntas disponibles para este test.</p>';
    btnSiguiente.disabled = true;
  }
})();
