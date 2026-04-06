// routes/categorias.js
const express = require('express');
const { pool } = require('../database');
const { verificarToken } = require('../middleware/auth');
const router = express.Router();

// GET /api/categorias — públicas
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.id, c.nombre,
         COUNT(p.id) FILTER (WHERE p.activo = true) AS cantidad_productos
       FROM categorias c
       LEFT JOIN productos p ON p.categoria_id = c.id
       WHERE c.activa = true
       GROUP BY c.id, c.nombre
       ORDER BY c.nombre`
    );
    res.json({ ok: true, categorias: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo categorías' });
  }
});

// POST /api/categorias — solo admin
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ ok: false, error: 'Nombre requerido' });
    const result = await pool.query(
      'INSERT INTO categorias (nombre, descripcion) VALUES ($1, $2) ON CONFLICT (nombre) DO NOTHING RETURNING *',
      [nombre.trim(), descripcion || null]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ ok: false, error: 'La categoría ya existe' });
    }
    res.status(201).json({ ok: true, categoria: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error creando categoría' });
  }
});

module.exports = router;
