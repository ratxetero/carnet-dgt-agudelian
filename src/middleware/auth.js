// src/middleware/auth.js

/**
 * Hace disponible el usuario autenticado (si lo hay) en res.locals.user
 * para poder usarlo en cualquier vista EJS (p.ej. mostrar el nombre en el nav).
 */
function attachUser(req, res, next) {
  res.locals.user = req.session && req.session.user ? req.session.user : null;
  next();
}

/**
 * Protege rutas que requieren estar logueado. Si no hay sesión, redirige a /login
 * (para rutas de página) o responde 401 JSON (para rutas /api/*).
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    return next();
  }
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  req.session.returnTo = req.originalUrl;
  return res.redirect('/login');
}

/**
 * Para páginas de login/registro: si ya hay sesión, redirige al dashboard.
 */
function redirectIfAuth(req, res, next) {
  if (req.session && req.session.user) {
    return res.redirect('/');
  }
  next();
}

module.exports = { attachUser, requireAuth, redirectIfAuth };
