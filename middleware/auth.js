// =============================================
// middleware/auth.js — Verificar token JWT
// =============================================
// Un middleware es una función que se ejecuta ANTES de llegar al endpoint.
// Si el token es inválido, corta la cadena y responde 401.
// Si es válido, agrega los datos del admin a req.admin y continúa.

const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
  // El token viene en el header: Authorization: Bearer <token>
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extrae la parte después de "Bearer "

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: 'Acceso denegado: no hay token'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = decoded; // Datos del admin disponibles en la ruta
    next(); // Continuar al handler de la ruta
  } catch (err) {
    return res.status(401).json({
      ok: false,
      error: 'Token inválido o expirado. Iniciá sesión de nuevo.'
    });
  }
}

module.exports = { verificarToken };
