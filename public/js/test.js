// public/js/test.js
// Lógica de la pantalla de realización de un test. Sin frameworks: JS plano.

(function () {
  const TEST_ID = window.__TEST_ID__;
  const preguntas = window.__PREGUNTAS__; // ver estructura devuelta por testService.obtenerTestParaJugar
  const csrfToken = document.querySelector('meta[name="csrf-token"]').content;
  const inicio = Date.now();

  let indiceActual = 0;
  // Mapa local con el resultado de las preguntas ya respondidas en esta sesión de juego
  const respuestasLocal = new Map();
  preguntas.forEach((p) => {
    if (p.yaRespondida) {
      respuestasLocal.set(p.preguntaId, {
        opcionElegidaId: p.opcionElegidaId,
        esCorrecta: !!p.esCorrecta,
        opcionCorrectaId: null, // se desconoce hasta que se vuelva a consultar; no es crítico para el repintado
        opcionElegidaExplicacion: null,
        opcionCorrectaExplicacion: null,
      });
    }
  });

  const zonaPregunta = document.getElementById('zona-pregunta');
  const contador = document.getElementById('contador-preguntas');
  const barra = document.getElementById('barra-progreso');
  const btnAnterior = document.getElementById('btn-anterior');
  const btnSiguiente = document.getElementById('btn-siguiente');
  const tituloTest = document.getElementById('titulo-test');

  const titulos = { aleatorio: 'Test aleatorio', tema: 'Test por tema', oficial: 'Simulacro oficial', repaso: 'Repaso de fallos' };

  function render() {
    const p = preguntas[indiceActual];
    contador.textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
    barra.style.width = `${((indiceActual + 1) / preguntas.length) * 100}%`;
    btnAnterior.disabled = indiceActual === 0;
    const esUltima = indiceActual === preguntas.length - 1;
    btnSiguiente.innerHTML = esUltima
      ? '<i data-lucide="check-circle-2" class="icon"></i> Finalizar test'
      : 'Siguiente <i data-lucide="arrow-right" class="icon"></i>';
    if (window.lucide) lucide.createIcons();

    const respuesta = respuestasLocal.get(p.preguntaId);

    let html = '';
    if (p.imagen) {
      html += `<img class="pregunta-imagen" src="/images/preguntas/${p.imagen}" alt="Imagen de la pregunta" />`;
    }
    html += `<h3>${escapeHtml(p.enunciado)}</h3>`;
    html += '<div class="opciones">';
    p.opciones.forEach((op) => {
      let clase = 'opcion';
      if (respuesta) {
        if (op.id === respuesta.opcionElegidaId && respuesta.esCorrecta) clase += ' correcta';
        else if (op.id === respuesta.opcionElegidaId && !respuesta.esCorrecta) clase += ' incorrecta';
        else if (respuesta.opcionCorrectaId && op.id === respuesta.opcionCorrectaId) clase += ' correcta';
      }
      html += `<button type="button" class="${clase}" data-opcion-id="${op.id}" ${respuesta ? 'disabled' : ''}>${escapeHtml(op.texto)}</button>`;
    });
    html += '</div>';

    if (respuesta) {
      html += `<div class="feedback ${respuesta.esCorrecta ? 'correcta' : 'incorrecta'}"><i data-lucide="${respuesta.esCorrecta ? 'check-circle-2' : 'x-circle'}" class="icon"></i> ${respuesta.esCorrecta ? '¡Correcto!' : 'Incorrecto'}</div>`;
    }
    html += `<div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">`;
    html += `<button type="button" class="btn secundario" id="btn-guardar-nota"><i data-lucide="sticky-note" class="icon"></i> Guardar en notas</button>`;
    if (respuesta) {
      html += `<button type="button" class="btn btn-experto" id="btn-consultar-experto"><i data-lucide="message-circle" class="icon"></i> Consulta a un experto</button>`;
    }
    html += `</div>`;

    zonaPregunta.innerHTML = html;
    if (window.lucide) lucide.createIcons();

    zonaPregunta.querySelectorAll('.opcion').forEach((btn) => {
      btn.addEventListener('click', () => responder(p, Number(btn.dataset.opcionId)));
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
      const confirmar = sinResponder > 0
        ? confirm(`Tienes ${sinResponder} pregunta(s) sin responder. ¿Seguro que quieres finalizar el test?`)
        : true;
      if (confirmar) finalizar();
    }
  });

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  if (preguntas.length) {
    tituloTest.textContent = titulos[preguntas.tipo] || 'Test';
    render();
  } else {
    zonaPregunta.innerHTML = '<p>No hay preguntas disponibles para este test.</p>';
    btnSiguiente.disabled = true;
  }
})();
