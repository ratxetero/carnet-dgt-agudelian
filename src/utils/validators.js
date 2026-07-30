// src/utils/validators.js
// Validación y saneamiento básico de los formularios de usuario.
// No sustituye a una librería como zod/joi, pero cubre lo esencial sin
// añadir dependencias extra a un proyecto pensado para ser simple.

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sanitizeText(value) {
  if (typeof value !== 'string') return '';
  // Elimina etiquetas HTML básicas para reducir riesgo de XSS almacenado.
  return value.replace(/<[^>]*>?/gm, '').trim();
}

function validarRegistro({ username, email, password, password2 }) {
  const errores = [];
  const u = sanitizeText(username);
  const e = sanitizeText(email).toLowerCase();

  if (!USERNAME_RE.test(u)) {
    errores.push('El nombre de usuario debe tener entre 3 y 30 caracteres (letras, números, punto, guion o guion bajo).');
  }
  if (!EMAIL_RE.test(e)) {
    errores.push('El email no tiene un formato válido.');
  }
  if (typeof password !== 'string' || password.length < 8) {
    errores.push('La contraseña debe tener al menos 8 caracteres.');
  }
  if (password !== password2) {
    errores.push('Las contraseñas no coinciden.');
  }

  return { errores, valores: { username: u, email: e } };
}

function validarLogin({ username, password }) {
  const errores = [];
  const u = sanitizeText(username);
  if (!u) errores.push('Introduce tu usuario o email.');
  if (!password) errores.push('Introduce tu contraseña.');
  return { errores, valores: { username: u } };
}

module.exports = { sanitizeText, validarRegistro, validarLogin };
