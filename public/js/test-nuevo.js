// public/js/test-nuevo.js
// Elección del test como flujo por pasos: una decisión por pantalla, con
// cabecera ("Paso 2 de 3"), botón atrás y un único botón de acción abajo.
// No cambia el contrato con el servidor: se rellenan los mismos hidden inputs
// (tipo, bloque_id, tema_id) del mismo formulario POST /test/iniciar.

(function () {
  const TEMAS = window.__TEMAS__ || [];
  const BLOQUES_POR_TEMA = window.__BLOQUES_POR_TEMA__ || {};
  const SIMULACROS = window.__SIMULACROS__ || [];
  const TOTAL_FALLOS = window.__TOTAL_FALLOS__ || 0;

  const inputTipo = document.getElementById('input-tipo');
  const inputBloqueId = document.getElementById('input-bloque-id');
  const inputTemaId = document.getElementById('input-tema-id');
  const btnEmpezar = document.getElementById('btn-empezar');
  const btnAtras = document.getElementById('btn-paso-atras');
  const cuerpo = document.getElementById('paso-cuerpo');
  const elContador = document.getElementById('paso-contador');
  const elTitulo = document.getElementById('paso-titulo');
  const elProgreso = document.getElementById('paso-progreso');

  const TIPOS = {
    aleatorio: { titulo: 'Test aleatorio', sub: '30 preguntas de todo el temario, formato del examen oficial.', icono: 'shuffle', pasos: 2 },
    tema: { titulo: 'Test por tema', sub: 'Elige un tema y uno de sus tests.', icono: 'book-open', pasos: 3 },
    oficial: { titulo: 'Simulacro oficial', sub: '30 preguntas reales agrupadas como en el examen DGT.', icono: 'clipboard-check', pasos: 2 },
    repaso: { titulo: 'Repaso de fallos', sub: `Repite lo que has fallado (${TOTAL_FALLOS} en total).`, icono: 'rotate-ccw', pasos: 2 },
  };

  // Estado del flujo
  let paso = 1;
  let tipo = null;
  let temaElegido = null;

  function num(v) { return Number.isFinite(Number(v)) ? Number(v) : 0; }
  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function totalPasos() { return tipo ? TIPOS[tipo].pasos : 2; }

  function pintarProgreso() {
    const total = totalPasos();
    let html = '';
    for (let i = 1; i <= total; i++) {
      html += `<span class="${i < paso ? 'hecho' : i === paso ? 'activo' : ''}"></span>`;
    }
    elProgreso.innerHTML = html;
    elContador.textContent = `Paso ${paso} de ${total}`;
    btnAtras.disabled = paso === 1;
    btnAtras.style.visibility = paso === 1 ? 'hidden' : 'visible';
  }

  function accion(texto, activo) {
    btnEmpezar.disabled = !activo;
    btnEmpezar.textContent = texto;
  }

  function fila({ titulo, sub, marca, extra, disabled, seleccionada, onClick }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'fila-opcion' + (seleccionada ? ' selected' : '');
    b.disabled = !!disabled;
    b.innerHTML =
      `<span class="marca">${marca || ''}</span>` +
      `<span class="texto"><strong>${titulo}</strong><span>${sub || ''}</span>${extra || ''}</span>` +
      `<i data-lucide="chevron-right" class="icon chevron"></i>`;
    if (!disabled && onClick) b.addEventListener('click', onClick);
    return b;
  }

  function barraMini(porcentaje) {
    return `<span class="mini-barra barra-energia" style="display:block;">
      <span class="pista" style="display:block;"><span class="carga" style="width:${porcentaje}%"></span></span>
    </span>`;
  }

  function estadoBloque(progreso) {
    if (!progreso || progreso.estado === 'nuevo') return '';
    if (progreso.estado === 'en_progreso') return barraMini(progreso.porcentaje);
    if (progreso.estado === 'completado') {
      const clase = progreso.aprobado ? 'ok' : 'fail';
      const texto = progreso.aprobado ? 'Apto' : 'No apto';
      return `<span class="mt-1" style="display:block;"><span class="badge ${clase}">${texto} · ${progreso.aciertos}/${progreso.total}</span></span>`;
    }
    return '';
  }

  function limpiarSeleccion() {
    inputBloqueId.value = '';
    inputTemaId.value = '';
    accion('Elige una opción', false);
  }

  // -------------------------------------------------------------------------
  // Render de cada paso
  // -------------------------------------------------------------------------
  function render() {
    cuerpo.innerHTML = '';
    limpiarSeleccion();

    if (paso === 1) return pasoTipo();
    if (tipo === 'aleatorio') return pasoConfirmarAleatorio();
    if (tipo === 'tema') return paso === 2 ? pasoTema() : pasoBloques();
    if (tipo === 'oficial') return pasoSimulacros();
    if (tipo === 'repaso') return pasoRepaso();
  }

  function irA(n) { paso = n; render(); }

  function pasoTipo() {
    elTitulo.textContent = 'Tipo de test';
    pintarProgreso();
    Object.entries(TIPOS).forEach(([clave, t]) => {
      const sinFallos = clave === 'repaso' && TOTAL_FALLOS === 0;
      cuerpo.appendChild(fila({
        titulo: t.titulo,
        sub: sinFallos ? 'No tienes fallos pendientes de repasar.' : t.sub,
        marca: `<i data-lucide="${t.icono}" class="icon"></i>`,
        disabled: sinFallos,
        seleccionada: tipo === clave,
        onClick: () => {
          tipo = clave;
          inputTipo.value = clave;
          temaElegido = null;
          irA(2);
        },
      }));
    });
    if (window.lucide) lucide.createIcons();
  }

  function pasoConfirmarAleatorio() {
    elTitulo.textContent = 'Test aleatorio';
    pintarProgreso();
    const caja = document.createElement('div');
    caja.className = 'paso-resumen';
    caja.innerHTML =
      `<span class="rol">Listo para empezar</span>` +
      `<span class="nombre">30 preguntas</span>` +
      `<p class="detalle">De todo el temario, con el formato del examen oficial: 30 preguntas y se aprueba con 27.</p>`;
    cuerpo.appendChild(caja);
    accion('Empezar test aleatorio', true);
  }

  function pasoTema() {
    elTitulo.textContent = 'Elige un tema';
    pintarProgreso();
    TEMAS.forEach((t) => {
      const sinBloques = t.numBloques === 0;
      cuerpo.appendChild(fila({
        titulo: t.numero === 0 ? 'Sin categorizar' : `Tema ${t.numero}`,
        sub: t.numero === 0 ? 'Preguntas que no encajan en ningún tema' : esc(t.nombre),
        marca: t.numero === 0 ? '<i data-lucide="layers" class="icon"></i>' : String(t.numero).padStart(2, '0'),
        extra: `<span style="display:block;font-size:.78rem;color:var(--muted-soft);margin-top:4px;">${num(t.numPreguntas)} preguntas · ${t.numBloques} test${t.numBloques === 1 ? '' : 's'}</span>`,
        disabled: sinBloques,
        seleccionada: temaElegido && temaElegido.id === t.id,
        onClick: () => { temaElegido = t; irA(3); },
      }));
    });
    if (window.lucide) lucide.createIcons();
  }

  function pasoBloques() {
    const t = temaElegido;
    elTitulo.textContent = t.numero === 0 ? 'Sin categorizar' : `Tema ${t.numero}`;
    pintarProgreso();
    const bloques = BLOQUES_POR_TEMA[t.id] || [];
    if (!bloques.length) {
      cuerpo.innerHTML = '<p class="ayuda">Este tema todavía no tiene tests generados.</p>';
      return;
    }
    bloques.forEach((b, idx) => {
      const f = fila({
        titulo: `Test ${idx + 1}`,
        sub: `${num(b.numPreguntas)} preguntas`,
        marca: String(idx + 1).padStart(2, '0'),
        extra: estadoBloque(b.progreso),
        onClick: () => {
          cuerpo.querySelectorAll('.fila-opcion').forEach((x) => x.classList.remove('selected'));
          f.classList.add('selected');
          inputBloqueId.value = b.id;
          const enCurso = b.progreso && b.progreso.estado === 'en_progreso';
          accion(`${enCurso ? 'Continuar' : 'Empezar'} Test ${idx + 1}`, true);
        },
      });
      cuerpo.appendChild(f);
    });
    if (window.lucide) lucide.createIcons();
  }

  function pasoSimulacros() {
    elTitulo.textContent = 'Elige un simulacro';
    pintarProgreso();
    if (!SIMULACROS.length) {
      cuerpo.innerHTML = '<p class="ayuda">No hay simulacros generados todavía. Ejecuta <code>npm run generar:simulacros</code>.</p>';
      return;
    }
    SIMULACROS.forEach((s, idx) => {
      const f = fila({
        titulo: `Simulacro ${idx + 1}`,
        sub: `${num(s.numPreguntas)} preguntas`,
        marca: String(idx + 1).padStart(2, '0'),
        extra: estadoBloque(s.progreso),
        onClick: () => {
          cuerpo.querySelectorAll('.fila-opcion').forEach((x) => x.classList.remove('selected'));
          f.classList.add('selected');
          inputBloqueId.value = s.id;
          const enCurso = s.progreso && s.progreso.estado === 'en_progreso';
          accion(`${enCurso ? 'Continuar' : 'Empezar'} simulacro ${idx + 1}`, true);
        },
      });
      cuerpo.appendChild(f);
    });
    if (window.lucide) lucide.createIcons();
  }

  function pasoRepaso() {
    elTitulo.textContent = '¿Qué quieres repasar?';
    pintarProgreso();

    const todos = fila({
      titulo: 'Todos los fallos',
      sub: `${TOTAL_FALLOS} pregunta${TOTAL_FALLOS === 1 ? '' : 's'} fallada${TOTAL_FALLOS === 1 ? '' : 's'}`,
      marca: '<i data-lucide="list" class="icon"></i>',
      disabled: TOTAL_FALLOS === 0,
      onClick: () => {
        cuerpo.querySelectorAll('.fila-opcion').forEach((x) => x.classList.remove('selected'));
        todos.classList.add('selected');
        inputTemaId.value = '';
        accion('Repasar todos los fallos', true);
      },
    });
    cuerpo.appendChild(todos);

    TEMAS.forEach((t) => {
      const n = t.numFallos || 0;
      const f = fila({
        titulo: t.numero === 0 ? 'Sin categorizar' : `Tema ${t.numero}`,
        sub: t.numero === 0 ? 'Preguntas sin tema' : esc(t.nombre),
        marca: t.numero === 0 ? '<i data-lucide="layers" class="icon"></i>' : String(t.numero).padStart(2, '0'),
        extra: `<span class="mt-1" style="display:block;"><span class="badge ${n > 0 ? 'fail' : 'neutro'}">${n} fallo${n === 1 ? '' : 's'}</span></span>`,
        disabled: n === 0,
        onClick: () => {
          cuerpo.querySelectorAll('.fila-opcion').forEach((x) => x.classList.remove('selected'));
          f.classList.add('selected');
          inputTemaId.value = t.id;
          accion(t.numero === 0 ? 'Repasar sin categorizar' : `Repasar tema ${t.numero}`, true);
        },
      });
      cuerpo.appendChild(f);
    });
    if (window.lucide) lucide.createIcons();
  }

  btnAtras.addEventListener('click', () => {
    if (paso > 1) irA(paso - 1);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && paso > 1) irA(paso - 1);
  });

  render();
})();
