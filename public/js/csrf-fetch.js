// public/js/csrf-fetch.js
// El token CSRF se lee del <meta> al cargar la página y se guarda en el
// cliente. En una sesión larga (un test de 30 preguntas puede durar varios
// minutos) ese valor cacheado puede quedar desincronizado de la sesión real
// del servidor. En vez de dejar al usuario atrapado con un error
// irrecuperable, esta utilidad detecta el rechazo por CSRF, pide un token
// fresco y reintenta la petición automáticamente una vez.

(function () {
  var metaTag = document.querySelector('meta[name="csrf-token"]');
  window.__csrfToken = metaTag ? metaTag.content : '';

  async function refrescarCsrfToken() {
    try {
      const res = await fetch('/api/csrf-token');
      if (!res.ok) return null;
      const data = await res.json();
      window.__csrfToken = data.csrfToken;
      return data.csrfToken;
    } catch (e) {
      return null;
    }
  }

  /**
   * Igual que fetch(), pero añade el token CSRF actual como cabecera y, si
   * el servidor responde 403 (token inválido/caducado), refresca el token
   * y reintenta la misma petición una vez antes de rendirse.
   */
  window.fetchConCsrf = async function (url, opciones) {
    opciones = opciones || {};
    opciones.headers = Object.assign({}, opciones.headers, { 'X-CSRF-Token': window.__csrfToken });

    let res = await fetch(url, opciones);
    if (res.status === 403) {
      const nuevoToken = await refrescarCsrfToken();
      if (nuevoToken) {
        opciones.headers['X-CSRF-Token'] = nuevoToken;
        res = await fetch(url, opciones);
      }
    }
    return res;
  };
})();
