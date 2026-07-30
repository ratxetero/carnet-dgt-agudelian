// public/js/test-nuevo.js
// Renderiza dinámicamente las tarjetas de: temas, bloques por tema,
// simulacros oficiales y temas para repaso — sin ningún <select>.

(function () {
  const TEMAS = window.__TEMAS__ || [];
  const BLOQUES_POR_TEMA = window.__BLOQUES_POR_TEMA__ || {};
  const SIMULACROS = window.__SIMULACROS__ || [];

  const inputTipo = document.getElementById('input-tipo');
  const inputBloqueId = document.getElementById('input-bloque-id');
  const inputTemaId = document.getElementById('input-tema-id');
  const btnEmpezar = document.getElementById('btn-empezar');

  const paneles = {
    tema: document.getElementById('panel-tema'),
    oficial: document.getElementById('panel-oficial'),
    repaso: document.getElementById('panel-repaso'),
  };

  function numPreguntasSeguro(valor) {
    return Number.isFinite(Number(valor)) ? Number(valor) : 0;
  }

  function limpiarSeleccionInterna() {
    inputBloqueId.value = '';
    inputTemaId.value = '';
    btnEmpezar.disabled = true;
    btnEmpezar.textContent = 'Selecciona una opción para empezar';
  }

  function miniProgreso(porcentaje) {
    return `<div class="progreso-bar" style="height:8px; margin:8px 0 0;">
      <div class="relleno" style="width:${porcentaje}%;"></div>
    </div><div class="text-muted" style="font-size:0.78rem;">${porcentaje}% completado</div>`;
  }

  function estadoBloqueHtml(progreso) {
    if (!progreso || progreso.estado === 'nuevo') return '';
    if (progreso.estado === 'en_progreso') return miniProgreso(progreso.porcentaje);
    if (progreso.estado === 'completado') {
      const badge = progreso.aprobado ? 'ok' : 'fail';
      const texto = progreso.aprobado ? 'Apto' : 'No apto';
      return `<div class="mt-1"><span class="badge ${badge}">${texto} · ${progreso.aciertos}/${progreso.total}</span></div>`;
    }
    return '';
  }

  // ---------------------------------------------------------------------
  // Tarjeta genérica reutilizable
  // ---------------------------------------------------------------------
  function tarjeta({ dataset, iconoHtml, titulo, subtitulo, extraHtml, deshabilitada, colorClase }) {
    const div = document.createElement('div');
    div.className = 'modo-card' + (deshabilitada ? ' disabled' : '') + (colorClase ? ' ' + colorClase : '');
    Object.entries(dataset || {}).forEach(([k, v]) => { div.dataset[k] = v; });
    div.innerHTML = `<h3>${iconoHtml || ''}${titulo}</h3><p>${subtitulo}</p>${extraHtml || ''}`;
    return div;
  }

  // ---------------------------------------------------------------------
  // Paso 1: elegir tipo de test (tarjetas superiores)
  // ---------------------------------------------------------------------
  document.querySelectorAll('#form-nuevo-test > .modo-selector > .modo-card').forEach((card) => {
    card.addEventListener('click', () => {
      document.querySelectorAll('#form-nuevo-test > .modo-selector > .modo-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      const tipo = card.dataset.tipo;
      inputTipo.value = tipo;
      limpiarSeleccionInterna();

      Object.values(paneles).forEach((p) => { p.style.display = 'none'; });
      document.getElementById('paso-bloques').style.display = 'none';

      if (tipo === 'aleatorio') {
        btnEmpezar.disabled = false;
        btnEmpezar.textContent = 'Empezar test aleatorio';
        return;
      }
      if (paneles[tipo]) paneles[tipo].style.display = 'block';
      if (tipo === 'tema') renderGridTemas();
      if (tipo === 'oficial') renderGridSimulacros();
      if (tipo === 'repaso') renderGridRepaso();
    });
  });

  // ---------------------------------------------------------------------
  // Test por tema — paso 1: elegir tema
  // ---------------------------------------------------------------------
  function renderGridTemas() {
    const grid = document.getElementById('grid-temas');
    grid.innerHTML = '';
    TEMAS.forEach((t) => {
      const sinBloques = t.numBloques === 0;
      const card = tarjeta({
        dataset: { temaId: t.id },
        iconoHtml: t.numero === 0 ? '<i data-lucide="layers" class="icon icon-sm" style="margin-right:6px;"></i>' : '',
        titulo: t.numero === 0 ? 'Sin categorizar' : `Tema ${t.numero}`,
        subtitulo: t.numero === 0 ? 'Preguntas que no encajan en ningún tema del manual' : t.nombre,
        extraHtml: `<div class="text-muted mt-1" style="font-size:0.8rem;">${numPreguntasSeguro(t.numPreguntas)} preguntas · ${t.numBloques} test${t.numBloques === 1 ? '' : 's'}</div>`,
        deshabilitada: sinBloques,
      });
      if (!sinBloques) {
        card.addEventListener('click', () => {
          grid.querySelectorAll('.modo-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          renderGridBloques(t.id, t.numero);
        });
      }
      grid.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
  }

  // ---------------------------------------------------------------------
  // Test por tema — paso 2: elegir bloque (Test 1, Test 2...)
  // ---------------------------------------------------------------------
  function renderGridBloques(temaId, temaNumero) {
    const pasoBloques = document.getElementById('paso-bloques');
    const grid = document.getElementById('grid-bloques');
    grid.innerHTML = '';
    const bloques = BLOQUES_POR_TEMA[temaId] || [];

    bloques.forEach((b, idx) => {
      const card = tarjeta({
        dataset: { bloqueId: b.id },
        titulo: `Test ${idx + 1}`,
        subtitulo: `${numPreguntasSeguro(b.numPreguntas)} preguntas`,
        extraHtml: estadoBloqueHtml(b.progreso),
      });
      card.addEventListener('click', () => {
        grid.querySelectorAll('.modo-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        inputBloqueId.value = b.id;
        btnEmpezar.disabled = false;
        btnEmpezar.textContent = b.progreso && b.progreso.estado === 'en_progreso'
          ? `Continuar Tema ${temaNumero} · Test ${idx + 1}`
          : `Empezar Tema ${temaNumero} · Test ${idx + 1}`;
      });
      grid.appendChild(card);
    });

    pasoBloques.style.display = 'block';
    if (window.lucide) lucide.createIcons();
  }

  // ---------------------------------------------------------------------
  // Simulacro oficial
  // ---------------------------------------------------------------------
  function renderGridSimulacros() {
    const grid = document.getElementById('grid-simulacros');
    grid.innerHTML = '';
    SIMULACROS.forEach((s, idx) => {
      const card = tarjeta({
        dataset: { bloqueId: s.id },
        titulo: `Simulacro #${idx + 1}`,
        subtitulo: `${numPreguntasSeguro(s.numPreguntas)} preguntas`,
        extraHtml: estadoBloqueHtml(s.progreso),
      });
      card.addEventListener('click', () => {
        grid.querySelectorAll('.modo-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        inputBloqueId.value = s.id;
        btnEmpezar.disabled = false;
        btnEmpezar.textContent = s.progreso && s.progreso.estado === 'en_progreso'
          ? `Continuar Simulacro #${idx + 1}`
          : `Empezar Simulacro #${idx + 1}`;
      });
      grid.appendChild(card);
    });
    if (!SIMULACROS.length) {
      grid.innerHTML = '<p class="text-muted">No hay simulacros generados todavía. Ejecuta <code>npm run generar:simulacros</code>.</p>';
    }
    if (window.lucide) lucide.createIcons();
  }

  // ---------------------------------------------------------------------
  // Repaso de fallos
  // ---------------------------------------------------------------------
  function renderGridRepaso() {
    const grid = document.getElementById('grid-repaso');
    grid.innerHTML = '';

    const totalFallos = window.__TOTAL_FALLOS__ || 0;
    const cardTodos = tarjeta({
      dataset: { temaId: '' },
      titulo: 'Todos los temas',
      subtitulo: `${totalFallos} pregunta${totalFallos === 1 ? '' : 's'} fallada${totalFallos === 1 ? '' : 's'} en total`,
      deshabilitada: totalFallos === 0,
      colorClase: totalFallos > 0 ? 'card-fallo' : '',
    });
    if (totalFallos > 0) {
      cardTodos.addEventListener('click', () => {
        grid.querySelectorAll('.modo-card').forEach((c) => c.classList.remove('selected'));
        cardTodos.classList.add('selected');
        inputTemaId.value = '';
        btnEmpezar.disabled = false;
        btnEmpezar.textContent = 'Repasar todos los fallos';
      });
    }
    grid.appendChild(cardTodos);

    TEMAS.forEach((t) => {
      const n = t.numFallos || 0;
      const card = tarjeta({
        dataset: { temaId: t.id },
        iconoHtml: t.numero === 0 ? '<i data-lucide="layers" class="icon icon-sm" style="margin-right:6px;"></i>' : '',
        titulo: t.numero === 0 ? 'Sin categorizar' : `Tema ${t.numero}`,
        subtitulo: t.numero === 0 ? 'Preguntas que no encajan en ningún tema del manual' : t.nombre,
        extraHtml: `<div class="mt-1"><span class="badge ${n > 0 ? 'fail' : 'neutro'}">${n} fallo${n === 1 ? '' : 's'}</span></div>`,
        deshabilitada: n === 0,
      });
      if (n > 0) {
        card.addEventListener('click', () => {
          grid.querySelectorAll('.modo-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          inputTemaId.value = t.id;
          btnEmpezar.disabled = false;
          btnEmpezar.textContent = t.numero === 0 ? 'Repasar fallos sin categorizar' : `Repasar fallos del tema ${t.numero}`;
        });
      }
      grid.appendChild(card);
    });
    if (window.lucide) lucide.createIcons();
  }
})();
