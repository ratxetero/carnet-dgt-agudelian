// public/js/stats.js
(async function () {
  function variableCss(nombre) {
    return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim();
  }

  function crearDonut(canvasId, { valores, etiquetas, colores, centro }) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;
    const total = valores.reduce((a, b) => a + b, 0);

    new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: etiquetas,
        datasets: [{ data: total > 0 ? valores : [1], backgroundColor: total > 0 ? colores : [variableCss('--border')], borderWidth: 0 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: '72%',
        plugins: {
          legend: { display: false },
          tooltip: { enabled: total > 0 },
        },
      },
      plugins: [{
        id: 'texto-central',
        afterDraw(chart) {
          const { ctx, chartArea: { left, right, top, bottom } } = chart;
          const x = (left + right) / 2;
          const y = (top + bottom) / 2;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = "700 1.35rem 'Space Mono', monospace";
          ctx.fillStyle = variableCss('--ink');
          ctx.fillText(centro.valor, x, y - 8);
          ctx.font = "600 0.68rem 'Instrument Sans', sans-serif";
          ctx.fillStyle = variableCss('--muted');
          ctx.fillText(centro.etiqueta, x, y + 12);
          ctx.restore();
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

  try {
    const [resumen, temas, oficiales] = await Promise.all([
      fetch('/api/stats/resumen').then((r) => r.json()),
      fetch('/api/stats/temas').then((r) => r.json()),
      fetch('/api/stats/oficiales').then((r) => r.json()),
    ]);

    const accent = variableCss('--accent');
    const success = variableCss('--success');
    const danger = variableCss('--danger');
    const muted = variableCss('--border-strong');

    // Donut 1: aciertos vs fallos (vs en blanco)
    crearDonut('donut-aciertos', {
      valores: [resumen.totalAciertos, resumen.totalFallos, resumen.totalEnBlanco],
      etiquetas: ['Aciertos', 'Fallos', 'En blanco'],
      colores: [success, danger, muted],
      centro: { valor: `${resumen.porcentajeAcierto}%`, etiqueta: 'ACIERTO' },
    });
    crearLeyenda('leyenda-aciertos', [
      { color: success, texto: `Aciertos (${resumen.totalAciertos})` },
      { color: danger, texto: `Fallos (${resumen.totalFallos})` },
      { color: muted, texto: `En blanco (${resumen.totalEnBlanco})` },
    ]);

    // Donut 2: aptos vs no aptos
    crearDonut('donut-aptos', {
      valores: [resumen.totalAprobados, resumen.totalSuspensos],
      etiquetas: ['Aptos', 'No aptos'],
      colores: [accent, danger],
      centro: { valor: resumen.totalTests, etiqueta: 'TESTS' },
    });
    crearLeyenda('leyenda-aptos', [
      { color: accent, texto: `Aptos (${resumen.totalAprobados})` },
      { color: danger, texto: `No aptos (${resumen.totalSuspensos})` },
    ]);

    // Barras por tema (se mantienen como barras: son 12 categorías, un donut no sería legible)
    const ctxTemas = document.getElementById('chart-temas');
    if (ctxTemas) {
      new Chart(ctxTemas, {
        type: 'bar',
        data: {
          labels: temas.map((t) => `T${t.tema_numero}`),
          datasets: [
            { label: 'Aciertos', data: temas.map((t) => t.aciertos), backgroundColor: success, borderRadius: 3 },
            { label: 'Fallos', data: temas.map((t) => t.fallos), backgroundColor: danger, borderRadius: 3 },
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
    }

    const tbody = document.querySelector('#tabla-oficiales tbody');
    if (tbody) {
      tbody.innerHTML = oficiales
        .map(
          (o) => `<tr>
            <td>${o.examen_nombre}</td>
            <td>${o.intentos}</td>
            <td>${o.mejor_resultado ?? '–'}</td>
            <td>${o.aprobado_alguna_vez ? '<i data-lucide="check" class="icon-sm" style="color:var(--success);"></i>' : '—'}</td>
          </tr>`
        )
        .join('');
    }
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Error cargando estadísticas', e);
  }
})();
