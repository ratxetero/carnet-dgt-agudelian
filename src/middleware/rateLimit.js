// src/middleware/rateLimit.js
// Límite de peticiones muy simple, en memoria, por usuario. Suficiente para
// una app local/personal (un solo proceso); no pensado para múltiples
// instancias en producción, donde haría falta un store compartido.

const contadores = new Map(); // usuario_id -> [timestamps de peticiones recientes]

function rateLimit({ maxPeticiones = 12, ventanaMs = 60 * 1000 } = {}) {
  return (req, res, next) => {
    const usuarioId = req.session && req.session.user ? req.session.user.id : req.ip;
    const ahora = Date.now();
    const historial = (contadores.get(usuarioId) || []).filter((t) => ahora - t < ventanaMs);

    if (historial.length >= maxPeticiones) {
      return res.status(429).json({
        error: `Has hecho demasiadas consultas seguidas. Espera un momento antes de volver a intentarlo (máx. ${maxPeticiones} por minuto).`,
      });
    }

    historial.push(ahora);
    contadores.set(usuarioId, historial);
    next();
  };
}

module.exports = { rateLimit };
