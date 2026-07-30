// src/middleware/csrf.js
// Protección CSRF sencilla basada en un token almacenado en la sesión
// (patrón "synchronizer token"). No usamos el paquete `csurf` porque está
// deprecado; esta implementación cubre las necesidades de una app local.

const crypto = require('crypto');

/**
 * Genera (si no existe) un token CSRF por sesión y lo expone en
 * res.locals.csrfToken para poder incluirlo en formularios EJS y en las
 * peticiones fetch del frontend (vía meta tag).
 */
function ensureCsrfToken(req, res, next) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  res.locals.csrfToken = req.session.csrfToken;
  next();
}

/**
 * Verifica el token CSRF en peticiones que modifican estado (POST/PUT/DELETE).
 * Acepta el token en el body (formularios) o en la cabecera X-CSRF-Token (fetch/JSON).
 */
function verifyCsrfToken(req, res, next) {
  const metodosSeguros = ['GET', 'HEAD', 'OPTIONS'];
  if (metodosSeguros.includes(req.method)) return next();

  const tokenEnviado = (req.body && req.body._csrf) || req.headers['x-csrf-token'];
  const tokenSesion = req.session && req.session.csrfToken;

  if (!tokenSesion || !tokenEnviado || tokenEnviado !== tokenSesion) {
    if (req.path.startsWith('/api/')) {
      return res.status(403).json({ error: 'Token CSRF inválido o ausente' });
    }
    return res.status(403).render('error', {
      titulo: 'Solicitud rechazada',
      mensaje: 'Token de seguridad (CSRF) inválido o caducado. Vuelve atrás y recarga la página.',
    });
  }
  next();
}

module.exports = { ensureCsrfToken, verifyCsrfToken };
