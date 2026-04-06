// =============================================
// routes/auth.js — Login del admin
// =============================================
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../database');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/login
// Recibe: { email, password }
// Devuelve: { ok, token, admin }
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email y contraseña son requeridos' });
    }

    // Buscar admin en la base de datos
    const result = await pool.query(
      'SELECT * FROM admins WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    const admin = result.rows[0];

    // Comparar contraseña con el hash guardado
    const passwordOk = await bcrypt.compare(password, admin.password_hash);
    if (!passwordOk) {
      return res.status(401).json({ ok: false, error: 'Credenciales incorrectas' });
    }

    // Generar token JWT que dura 24 horas
    const token = jwt.sign(
      { id: admin.id, email: admin.email, nombre: admin.nombre },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      ok: true,
      token,
      admin: { id: admin.id, email: admin.email, nombre: admin.nombre }
    });

  } catch (err) {
    console.error('Error en login:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// POST /api/auth/setup
// Crea el primer admin (solo funciona si no existe ninguno todavía)
router.post('/setup', async (req, res) => {
  try {
    const count = await pool.query('SELECT COUNT(*) FROM admins');
    if (parseInt(count.rows[0].count) > 0) {
      return res.status(403).json({ ok: false, error: 'Ya existe un admin configurado' });
    }

    const { email, password, nombre } = req.body;
    if (!email || !password) {
      return res.status(400).json({ ok: false, error: 'Email y contraseña requeridos' });
    }
    if (password.length < 8) {
      return res.status(400).json({ ok: false, error: 'La contraseña debe tener al menos 8 caracteres' });
    }

    const hash = await bcrypt.hash(password, 12); // 12 = nivel de seguridad del hash
    const result = await pool.query(
      'INSERT INTO admins (email, password_hash, nombre) VALUES ($1, $2, $3) RETURNING id, email, nombre',
      [email.toLowerCase().trim(), hash, nombre || 'Admin']
    );

    res.status(201).json({ ok: true, admin: result.rows[0], mensaje: 'Admin creado correctamente' });

  } catch (err) {
    console.error('Error en setup:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

// GET /api/auth/verificar
// Verifica si el token sigue siendo válido
router.get('/verificar', verificarToken, (req, res) => {
  res.json({ ok: true, admin: req.admin });
});

// POST /api/auth/cambiar-password
router.post('/cambiar-password', verificarToken, async (req, res) => {
  try {
    const { passwordActual, passwordNuevo } = req.body;
    if (!passwordActual || !passwordNuevo) {
      return res.status(400).json({ ok: false, error: 'Ambas contraseñas son requeridas' });
    }
    if (passwordNuevo.length < 8) {
      return res.status(400).json({ ok: false, error: 'La nueva contraseña debe tener al menos 8 caracteres' });
    }

    const result = await pool.query('SELECT * FROM admins WHERE id = $1', [req.admin.id]);
    const admin = result.rows[0];
    const ok = await bcrypt.compare(passwordActual, admin.password_hash);
    if (!ok) return res.status(401).json({ ok: false, error: 'Contraseña actual incorrecta' });

    const nuevoHash = await bcrypt.hash(passwordNuevo, 12);
    await pool.query('UPDATE admins SET password_hash = $1 WHERE id = $2', [nuevoHash, req.admin.id]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada correctamente' });
  } catch (err) {
    console.error('Error cambiando contraseña:', err);
    res.status(500).json({ ok: false, error: 'Error interno del servidor' });
  }
});

module.exports = router;
