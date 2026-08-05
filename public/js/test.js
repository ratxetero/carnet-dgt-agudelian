// public/js/test.js
// Lógica de la pantalla de realización de un test. Sin frameworks: JS plano.
//
// Layout sin scroll: el HUD (contador, cronómetro, acciones) y las acciones de
// navegación son estáticos y viven fuera de la zona que se repinta. Aquí solo
// se rellenan la imagen, el enunciado, las respuestas y la explicación.

(function () {
  const TEST_ID = window.__TEST_ID__;
  const preguntas = window.__PREGUNTAS__;
  const inicio = Date.now();
  const CLAVE_MARCADAS = `marcadas-test-${TEST_ID}`;

  let indiceActual = 0;
  const LETRAS = ['A', 'B', 'C', 'D', 'E'];

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

  let marcadas = new Set();
  try {
    marcadas = new Set(JSON.parse(localStorage.getItem(CLAVE_MARCADAS) || '[]'));
  } catch (e) { /* empezamos sin marcadas */ }

  const zonaImagen = document.getElementById('zona-imagen');
  const imgPregunta = document.getElementById('img-pregunta');
  const zonaEnunciado = document.getElementById('zona-enunciado');
  const zonaOpciones = document.getElementById('zona-opciones');
  const btnSalir = document.getElementById('btn-salir-test');
  const contador = document.getElementById('contador-preguntas');
  const barra = document.getElementById('barra-progreso');
  const btnAnterior = document.getElementById('btn-anterior');
  const btnSiguiente = document.getElementById('btn-siguiente');
  const btnMarcar = document.getElementById('btn-marcar-revisar');
  const btnNota = document.getElementById('btn-guardar-nota');
  const btnExperto = document.getElementById('btn-consultar-experto');
  const cronometroEl = document.getElementById('cronometro');
  const comboHud = document.getElementById('combo-hud');

  let temporizadorCombo = null;
  let rachaAciertos = 0;
  let rachaFallos = 0;

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

  function actualizarCombo(esCorrecta) {
    if (esCorrecta) { rachaAciertos++; rachaFallos = 0; }
    else { rachaFallos++; rachaAciertos = 0; }
    if (rachaAciertos >= 2) mostrarCombo(rachaAciertos, true);
    else if (rachaFallos >= 2) mostrarCombo(rachaFallos, false);
  }

  function mostrarCombo(n, esPositivo) {
    if (!comboHud) return;
    let etiqueta;
    if (esPositivo) etiqueta = n >= 5 ? 'PERFECT RUN' : n >= 4 ? 'ON FIRE' : 'HIT COMBO';
    else etiqueta = n >= 4 ? 'CADENA DE FALLOS' : 'FALLO x2';
    comboHud.textContent = `${n} ${etiqueta}`;
    comboHud.className = 'combo-hud ' + (esPositivo ? 'positivo' : 'negativo');
    void comboHud.offsetWidth;
    comboHud.classList.add('visible', 'pop');
    clearTimeout(temporizadorCombo);
    temporizadorCombo = setTimeout(() => { comboHud.classList.remove('visible'); }, 2000);
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

  function preguntaActual() { return preguntas[indiceActual]; }

  function render() {
    const p = preguntaActual();
    const respuesta = respuestasLocal.get(p.preguntaId);

    contador.textContent = `Pregunta ${indiceActual + 1} de ${preguntas.length}`;
    barra.style.width = `${((indiceActual + 1) / preguntas.length) * 100}%`;
    btnAnterior.disabled = indiceActual === 0;
    const esUltima = indiceActual === preguntas.length - 1;
    btnSiguiente.innerHTML = esUltima
      ? '<i data-lucide="check-circle-2" class="icon"></i> Finalizar'
      : 'Siguiente <i data-lucide="arrow-right" class="icon"></i>';

    if (p.imagen) {
      imgPregunta.src = `/images/preguntas/${p.imagen}`;
      zonaImagen.classList.add('visible');
    } else {
      imgPregunta.removeAttribute('src');
      zonaImagen.classList.remove('visible');
    }

    zonaEnunciado.textContent = p.enunciado || '';
    btnMarcar.classList.toggle('activo', marcadas.has(p.preguntaId));
    btnExperto.disabled = !respuesta;

    let html = '';
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
    zonaOpciones.innerHTML = html;

    zonaOpciones.querySelectorAll('.opcion').forEach((btn) => {
      btn.addEventListener('click', () => responder(p, Number(btn.dataset.opcionId)));
    });

    if (window.lucide) lucide.createIcons();
    if (window.ExpertoChat) window.ExpertoChat.cerrar();
  }

  async function responder(pregunta, opcionId) {
    try {
      const res = await window.fetchConCsrf(`/api/test/${TEST_ID}/responder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      actualizarCombo(data.esCorrecta);
      render();
    } catch (e) {
      alert(e.message);
    }
  }

  async function finalizar() {
    const tiempoSegundos = Math.round((Date.now() - inicio) / 1000);
    try {
      const res = await window.fetchConCsrf(`/api/test/${TEST_ID}/finalizar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  btnMarcar.addEventListener('click', () => {
    const p = preguntaActual();
    if (marcadas.has(p.preguntaId)) marcadas.delete(p.preguntaId);
    else marcadas.add(p.preguntaId);
    guardarMarcadas();
    btnMarcar.classList.toggle('activo', marcadas.has(p.preguntaId));
  });

  btnNota.addEventListener('click', () => {
    if (window.NotaRapida) window.NotaRapida.abrir(preguntaActual().preguntaId);
  });

  btnExperto.addEventListener('click', () => {
    if (window.ExpertoChat) window.ExpertoChat.abrir(preguntaActual().preguntaId);
  });

  if (btnSalir) {
    btnSalir.addEventListener('click', (e) => {
      const respondidas = respuestasLocal.size;
      const aviso = respondidas > 0
        ? `Saliendo ahora, el test queda sin finalizar (llevas ${respondidas} de ${preguntas.length} respondidas). Podrás continuarlo más tarde. ¿Salir?`
        : '¿Salir del test?';
      if (!confirm(aviso)) e.preventDefault();
    });
  }

  btnAnterior.addEventListener('click', () => {
    if (indiceActual > 0) { indiceActual--; render(); }
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

  // Teclado: 1-5 responden, flechas navegan.
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const n = Number(e.key);
    if (n >= 1 && n <= 5) {
      const btn = zonaOpciones.querySelectorAll('.opcion')[n - 1];
      if (btn && !btn.disabled) btn.click();
    } else if (e.key === 'ArrowRight') btnSiguiente.click();
    else if (e.key === 'ArrowLeft' && !btnAnterior.disabled) btnAnterior.click();
  });

  if (preguntas.length) {
    actualizarContadorMarcadas();
    render();
  } else {
    zonaEnunciado.textContent = 'No hay preguntas disponibles para este test.';
    btnSiguiente.disabled = true;
  }
})();
