// public/js/stats.js
(async function () {
  try {
    const [resumen, temas, oficiales] = await Promise.all([
      fetch('/api/stats/resumen').then((r) => r.json()),
      fetch('/api/stats/temas').then((r) => r.json()),
      fetch('/api/stats/oficiales').then((r) => r.json()),
    ]);

    document.getElementById('stat-total').textContent = resumen.totalTests;
    document.getElementById('stat-acierto').textContent = `${resumen.porcentajeAcierto}%`;
    document.getElementById('stat-aprobados').textContent = resumen.totalAprobados;
    document.getElementById('stat-suspensos').textContent = resumen.totalSuspensos;

    const ctx = document.getElementById('chart-temas');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: temas.map((t) => `T${t.tema_numero}`),
        datasets: [
          { label: 'Aciertos', data: temas.map((t) => t.aciertos), backgroundColor: '#2a9d8f' },
          { label: 'Fallos', data: temas.map((t) => t.fallos), backgroundColor: '#e63946' },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    });

    const tbody = document.querySelector('#tabla-oficiales tbody');
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
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Error cargando estadísticas', e);
  }
})();
