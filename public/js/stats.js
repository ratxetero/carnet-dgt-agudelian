// public/js/stats.js
// Estadísticas sin librerías de gráficos: todo son barras de energía y números
// del propio sistema visual. Antes se dependía de Chart.js por CDN — si tardaba
// o no cargaba, los canvas quedaban vacíos y la página parecía rota.
//
// Además la carga es progresiva: el resumen (consulta rápida) se pinta en cuanto
// llega, y el desglose por tema y los simulacros entran después sin bloquear.

(function () {
  const $ = (id) => document.getElementById(id);

  function mostrarVacio(mostrar) {
    if ($('stats-vacio')) $('stats-vacio').style.display = mostrar ? 'block' : 'none';
    if ($('stats-contenido')) $('stats-contenido').style.display = mostrar ? 'none' : 'block';
  }

  function mostrarError(mensaje) {
    const el = $('stats-error');
    if (!el) return;
    el.innerHTML = '<i data-lucide="alert-octagon" class="icon"></i> ' + mensaje;
    el.style.display = 'flex';
    if (window.lucide) lucide.createIcons();
  }

  function pct(parte, total) {
    return total > 0 ? Math.round((parte / total) * 100) : 0;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  // ---------------------------------------------------------------- resumen
  function pintarResumen(r) {
    $('v-tests').textContent = r.totalTests || 0;
    $('v-acierto').textContent = `${r.porcentajeAcierto || 0}%`;
    $('v-acierto-2').textContent = `${r.porcentajeAcierto || 0}%`;
    $('v-aptos').textContent = r.totalAprobados || 0;
    $('v-noaptos').textContent = r.totalSuspensos || 0;

    const porcentaje = Number(r.porcentajeAcierto) || 0;
    $('carga-global').style.width = `${porcentaje}%`;
    $('barra-global').classList.toggle('baja', porcentaje < 70);

    const ok = r.totalAciertos || 0;
    const fail = r.totalFallos || 0;
    const blanco = r.totalEnBlanco || 0;
    const total = ok + fail + blanco;

    const tramos = [
      { clase: 'ok', valor: ok, texto: `Aciertos (${ok})`, color: 'var(--success)' },
      { clase: 'fail', valor: fail, texto: `Fallos (${fail})`, color: 'var(--danger)' },
      { clase: 'blanco', valor: blanco, texto: `En blanco (${blanco})`, color: 'var(--border-soft)' },
    ];

    $('reparto-respuestas').innerHTML = tramos
      .filter((t) => t.valor > 0)
      .map((t) => {
        const p = pct(t.valor, total);
        return `<div class="tramo ${t.clase}" style="width:${p}%" title="${t.texto}">${p >= 12 ? p + '%' : ''}</div>`;
      })
      .join('');

    $('leyenda-respuestas').innerHTML = tramos
      .map((t) => `<span class="leyenda-item"><span class="punto" style="background:${t.color}"></span>${t.texto}</span>`)
      .join('');
  }

  // ------------------------------------------------------------------ temas
  function pintarTemas(temas) {
    const cont = $('lista-temas');
    if (!cont) return;
    const conDatos = (Array.isArray(temas) ? temas : []).filter((t) => (t.respondidas || 0) > 0);
    if (!conDatos.length) {
      cont.innerHTML = '<p class="text-muted" style="margin:0;">Todavía no hay preguntas respondidas por tema.</p>';
      return;
    }
    cont.innerHTML = conDatos
      .map((t) => {
        const respondidas = t.respondidas || 0;
        const aciertos = t.aciertos || 0;
        const p = pct(aciertos, respondidas);
        const nombre = t.tema_numero === 0
          ? 'Sin categorizar'
          : `Tema ${t.tema_numero} — ${esc(t.tema_nombre)}`;
        return `<div class="fila-energia">
          <div class="fila-cab">
            <span class="fila-nombre">${nombre}</span>
            <span class="fila-cifra">${aciertos}/${respondidas} · ${p}%</span>
          </div>
          <div class="barra-energia ${p < 70 ? 'baja' : ''}">
            <div class="pista"><div class="carga" style="width:${p}%"></div></div>
          </div>
        </div>`;
      })
      .join('');
  }

  // -------------------------------------------------------------- oficiales
  function pintarOficiales(oficiales) {
    const tbody = document.querySelector('#tabla-oficiales tbody');
    if (!tbody) return;
    if (!Array.isArray(oficiales) || !oficiales.length) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No hay simulacros disponibles.</td></tr>';
      return;
    }
    tbody.innerHTML = oficiales
      .map((o) => `<tr>
        <td>${esc(o.examen_nombre || '—')}</td>
        <td>${o.intentos || 0}</td>
        <td>${o.mejor_resultado == null ? '–' : o.mejor_resultado}</td>
        <td>${o.aprobado_alguna_vez ? '<span class="badge ok">Sí</span>' : '<span class="badge neutro">–</span>'}</td>
      </tr>`)
      .join('');
  }

  async function json(url) {
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!r.ok) throw new Error(`${url} respondió ${r.status}`);
    return r.json();
  }

  async function iniciar() {
    // 1) Resumen primero: decide si hay algo que mostrar y se pinta ya.
    let resumen;
    try {
      resumen = await json('/api/stats/resumen');
    } catch (e) {
      console.error(e);
      mostrarVacio(false);
      mostrarError('No se han podido cargar tus estadísticas. Comprueba la conexión y recarga.');
      return;
    }

    if (!resumen || !resumen.totalTests) {
      mostrarVacio(true);
      return;
    }
    mostrarVacio(false);
    pintarResumen(resumen);

    // 2) El resto en paralelo, cada uno independiente: si uno falla o tarda,
    //    no arrastra al otro ni deja la pantalla a medias.
    json('/api/stats/temas')
      .then(pintarTemas)
      .catch((e) => {
        console.error(e);
        $('lista-temas').innerHTML = '<p class="text-muted" style="margin:0;">No se ha podido cargar el desglose por tema.</p>';
      });

    json('/api/stats/oficiales')
      .then(pintarOficiales)
      .catch((e) => {
        console.error(e);
        const tbody = document.querySelector('#tabla-oficiales tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-muted">No se han podido cargar los simulacros.</td></tr>';
      });
  }

  iniciar();
})();
