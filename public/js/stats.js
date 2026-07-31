// public/js/stats.js
(function () {
  function variableCss(nombre) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  function crearDonut(canvasId, { valores, etiquetas, colores, centro }) {
    const ctx = document.getElementById(canvasId);
    if (!ctx || typeof Chart === 'undefined') return;
    const total = valores.reduce((a, b) => a + b, 0);
    const datosFinales = total > 0 ? valores : [1];
    const coloresFinales = total > 0 ? colores : [variableCss('--border')];

    new Chart(ctx, {
      type: 'doughnut',
      data: { labels: etiquetas, datasets: [{ data: datosFinales, backgroundColor: coloresFinales, borderWidth: 0 }] },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '72%',
        plugins: { legend: { display: false }, tooltip: { enabled: total > 0 } },
      },
      plugins: [{
        id: `texto-central-${canvasId}`,
        afterDraw(chart) {
          const { ctx: c, chartArea: { left, right, top, bottom } } = chart;
          const x = (left + right) / 2;
          const y = (top + bottom) / 2;
          c.save();
          c.textAlign = 'center';
          c.textBaseline = 'middle';
          c.font = "700 1.35rem 'Space Mono', monospace";
          c.fillStyle = variableCss('--ink');
          c.fillText(centro.valor, x, y - 8);
          c.font = "600 0.68rem 'Instrument Sans', sans-serif";
          c.fillStyle = variableCss('--muted');
          c.fillText(centro.etiqueta, x, y + 12);
          c.restore();
        },
      }],
    });
  }

  function crearLeyenda(contenedorId, items) {
    const el = document.getElementById(contenedorId);
    if (!el) return;
    el.innerHTML = items
      .map((it) => `<span class="leyenda-item"><span class="punto" style="background:${it.color}"></span>${it.texto}</span>`)
      .join('');
  }

  function mostrarEstadoVacio(mostrar) {
    const vacio = document.getElementById('stats-vacio');
    const contenido = document.getElementById('stats-contenido');
    if (vacio) vacio.style.display = mostrar ? 'block' : 'none';
    if (contenido) contenido.style.display = mostrar ? 'none' : 'block';
  }

  function mostrarErrorGeneral(mensaje) {
    const el = document.getElementById('stats-error');
    if (!el) return;
    el.textContent = mensaje;
    el.style.display = 'block';
  }

  // Cada bloque se ejecuta de forma independiente: si uno falla, no se
  // lleva por delante a los demás (antes, un solo error en cualquier punto
  // dejaba toda la página en blanco sin ningún aviso).
  function renderDonuts(resumen) {
    try {
      const accent = variableCss('--accent');
      const success = variableCss('--success');
      const danger = variableCss('--danger');
      const muted = variableCss('--border-strong');

      crearDonut('donut-aciertos', {
        valores: [resumen.totalAciertos || 0, resumen.totalFallos || 0, resumen.totalEnBlanco || 0],
        etiquetas: ['Aciertos', 'Fallos', 'En blanco'],
        colores: [success, danger, muted],
        centro: { valor: `${resumen.porcentajeAcierto || 0}%`, etiqueta: 'ACIERTO' },
      });
      crearLeyenda('leyenda-aciertos', [
        { color: success, texto: `Aciertos (${resumen.totalAciertos || 0})` },
        { color: danger, texto: `Fallos (${resumen.totalFallos || 0})` },
        { color: muted, texto: `En blanco (${resumen.totalEnBlanco || 0})` },
      ]);

      crearDonut('donut-aptos', {
        valores: [resumen.totalAprobados || 0, resumen.totalSuspensos || 0],
        etiquetas: ['Aptos', 'No aptos'],
        colores: [accent, danger],
        centro: { valor: resumen.totalTests || 0, etiqueta: 'TESTS' },
      });
      crearLeyenda('leyenda-aptos', [
        { color: accent, texto: `Aptos (${resumen.totalAprobados || 0})` },
        { color: danger, texto: `No aptos (${resumen.totalSuspensos || 0})` },
      ]);
    } catch (e) {
      console.error('No se pudieron dibujar los gráficos circulares:', e);
    }
  }

  function renderBarrasPorTema(temas) {
    try {
      const ctxTemas = document.getElementById('chart-temas');
      if (!ctxTemas || typeof Chart === 'undefined' || !Array.isArray(temas)) return;
      const success = variableCss('--success');
      const danger = variableCss('--danger');
      new Chart(ctxTemas, {
        type: 'bar',
        data: {
          labels: temas.map((t) => `T${t.tema_numero}`),
          datasets: [
            { label: 'Aciertos', data: temas.map((t) => t.aciertos || 0), backgroundColor: success, borderRadius: 3 },
            { label: 'Fallos', data: temas.map((t) => t.fallos || 0), backgroundColor: danger, borderRadius: 3 },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'bottom', labels: { color: variableCss('--ink-soft'), font: { size: 11 } } } },
          scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: variableCss('--muted') } },
            y: { stacked: true, beginAtZero: true, grid: { color: variableCss('--border') }, ticks: { color: variableCss('--muted') } },
          },
        },
      });
    } catch (e) {
      console.error('No se pudo dibujar el gráfico por tema:', e);
    }
  }

  function renderTablaOficiales(oficiales) {
    try {
      const tbody = document.querySelector('#tabla-oficiales tbody');
      if (!tbody) return;
      if (!Array.isArray(oficiales) || !oficiales.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No hay simulacros disponibles.</td></tr>';
        return;
      }
      tbody.innerHTML = oficiales
        .map(
          (o) => `<tr>
            <td>${o.examen_nombre || '—'}</td>
            <td>${o.intentos || 0}</td>
            <td>${o.mejor_resultado ?? '–'}</td>
            <td>${o.aprobado_alguna_vez ? '<i data-lucide="check" class="icon-sm" style="color:var(--success);"></i>' : '—'}</td>
          </tr>`
        )
        .join('');
      if (window.lucide) lucide.createIcons();
    } catch (e) {
      console.error('No se pudo pintar la tabla de simulacros:', e);
    }
  }

  async function iniciar() {
    let resumen, temas, oficiales;
    try {
      const respuestas = await Promise.all([
        fetch('/api/stats/resumen'),
        fetch('/api/stats/temas'),
        fetch('/api/stats/oficiales'),
      ]);
      for (const r of respuestas) {
        if (!r.ok) throw new Error(`El servidor respondió con un error (${r.status}).`);
      }
      [resumen, temas, oficiales] = await Promise.all(respuestas.map((r) => r.json()));
    } catch (e) {
      console.error('Error cargando estadísticas', e);
      mostrarEstadoVacio(false);
      mostrarErrorGeneral('No se han podido cargar tus estadísticas. Comprueba tu conexión y recarga la página.');
      return;
    }

    // Si todavía no hay ningún test completado, mostramos un estado vacío
    // útil en vez de una pantalla sin contenido.
    if (!resumen || !resumen.totalTests) {
      mostrarEstadoVacio(true);
      return;
    }
    mostrarEstadoVacio(false);

    renderDonuts(resumen);
    renderBarrasPorTema(temas);
    renderTablaOficiales(oficiales);
  }

  iniciar();
})();
