// =============================================
// routes/variantes.js — Variantes de productos
// =============================================
// Una variante es una versión del producto con distinto color, diseño o talle.
// Cada variante tiene: nombre, color (hex), imagen propia y stock propio.

const express = require('express');
const { pool } = require('../database');
const { verificarToken } = require('../middleware/auth');
const router = express.Router();

// ─────────────────────────────────────────────
// PÚBLICAS
// ─────────────────────────────────────────────

// GET /api/variantes/producto/:productoId
// Traer todas las variantes de un producto
router.get('/producto/:productoId', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, color_hex, imagen_url, stock, orden
       FROM variantes_producto
       WHERE producto_id = $1 AND activa = true
       ORDER BY orden ASC, id ASC`,
      [req.params.productoId]
    );
    res.json({ ok: true, variantes: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo variantes' });
  }
});

// ─────────────────────────────────────────────
// PRIVADAS (requieren token)
// ─────────────────────────────────────────────

// POST /api/variantes/producto/:productoId
// Agregar una variante a un producto
router.post('/producto/:productoId', verificarToken, async (req, res) => {
  try {
    const { nombre, color_hex, imagen_url, stock, orden } = req.body;
    const productoId = req.params.productoId;

    if (!nombre || nombre.trim().length < 1) {
      return res.status(400).json({ ok: false, error: 'El nombre de la variante es obligatorio' });
    }
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ ok: false, error: 'El stock debe ser un número positivo' });
    }

    // Verificar que el producto existe
    const prod = await pool.query('SELECT id FROM productos WHERE id = $1', [productoId]);
    if (prod.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    const result = await pool.query(
      `INSERT INTO variantes_producto (producto_id, nombre, color_hex, imagen_url, stock, orden)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [productoId, nombre.trim(), color_hex || null, imagen_url || null, stock, orden || 0]
    );

    res.status(201).json({ ok: true, variante: result.rows[0], mensaje: `Variante "${nombre}" creada` });
  } catch (err) {
    console.error('Error creando variante:', err);
    res.status(500).json({ ok: false, error: 'Error creando variante' });
  }
});

// POST /api/variantes/producto/:productoId/bulk
// Guardar múltiples variantes de una vez (reemplaza todas las existentes)
router.post('/producto/:productoId/bulk', verificarToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { variantes } = req.body;
    const productoId = req.params.productoId;

    if (!Array.isArray(variantes)) {
      return res.status(400).json({ ok: false, error: 'Se requiere un array de variantes' });
    }

    await client.query('BEGIN');

    // Eliminar variantes existentes del producto
    await client.query(
      'DELETE FROM variantes_producto WHERE producto_id = $1',
      [productoId]
    );

    // Insertar las nuevas
    const inserted = [];
    for (let i = 0; i < variantes.length; i++) {
      const v = variantes[i];
      if (!v.nombre) continue;
      const result = await client.query(
        `INSERT INTO variantes_producto (producto_id, nombre, color_hex, imagen_url, stock, orden)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [productoId, v.nombre.trim(), v.color_hex || null, v.imagen_url || null, v.stock || 0, i]
      );
      inserted.push(result.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, variantes: inserted, mensaje: `${inserted.length} variantes guardadas` });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error guardando variantes:', err);
    res.status(500).json({ ok: false, error: 'Error guardando variantes' });
  } finally {
    client.release();
  }
});

// PUT /api/variantes/:id
// Editar una variante
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { nombre, color_hex, imagen_url, stock, orden } = req.body;
    const result = await pool.query(
      `UPDATE variantes_producto
       SET nombre=$1, color_hex=$2, imagen_url=$3, stock=$4, orden=$5
       WHERE id=$6 RETURNING *`,
      [nombre, color_hex || null, imagen_url || null, stock, orden || 0, req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Variante no encontrada' });
    }
    res.json({ ok: true, variante: result.rows[0] });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error actualizando variante' });
  }
});

// PATCH /api/variantes/:id/stock
// Actualizar solo el stock de una variante (para ventas)
router.patch('/:id/stock', verificarToken, async (req, res) => {
  try {
    const { cantidad, operacion } = req.body;
    let query;
    if (operacion === 'restar') query = 'UPDATE variantes_producto SET stock = GREATEST(0, stock - $1) WHERE id = $2 RETURNING stock, nombre';
    else if (operacion === 'sumar') query = 'UPDATE variantes_producto SET stock = stock + $1 WHERE id = $2 RETURNING stock, nombre';
    else if (operacion === 'fijar') query = 'UPDATE variantes_producto SET stock = $1 WHERE id = $2 RETURNING stock, nombre';
    else return res.status(400).json({ ok: false, error: 'Operación inválida: restar | sumar | fijar' });

    const result = await pool.query(query, [cantidad, req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Variante no encontrada' });

    res.json({ ok: true, stockNuevo: result.rows[0].stock, nombre: result.rows[0].nombre });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error actualizando stock de variante' });
  }
});

// DELETE /api/variantes/:id
// Eliminar una variante
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE variantes_producto SET activa = false WHERE id = $1 RETURNING nombre',
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ ok: false, error: 'Variante no encontrada' });
    res.json({ ok: true, mensaje: `Variante "${result.rows[0].nombre}" eliminada` });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error eliminando variante' });
  }
});

// ─────────────────────────────────────────────
// IMÁGENES ADICIONALES
// ─────────────────────────────────────────────

// GET /api/variantes/imagenes/:productoId
router.get('/imagenes/:productoId', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, imagen_url, orden FROM imagenes_producto WHERE producto_id = $1 ORDER BY orden ASC',
      [req.params.productoId]
    );
    res.json({ ok: true, imagenes: result.rows });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo imágenes' });
  }
});

// POST /api/variantes/imagenes/:productoId
// Guardar imágenes adicionales (reemplaza todas)
router.post('/imagenes/:productoId', verificarToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { imagenes } = req.body; // Array de URLs
    const productoId = req.params.productoId;

    await client.query('BEGIN');
    await client.query('DELETE FROM imagenes_producto WHERE producto_id = $1', [productoId]);

    const inserted = [];
    for (let i = 0; i < imagenes.length; i++) {
      if (!imagenes[i]) continue;
      const r = await client.query(
        'INSERT INTO imagenes_producto (producto_id, imagen_url, orden) VALUES ($1,$2,$3) RETURNING *',
        [productoId, imagenes[i], i]
      );
      inserted.push(r.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ ok: true, imagenes: inserted, mensaje: `${inserted.length} imágenes guardadas` });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, error: 'Error guardando imágenes' });
  } finally {
    client.release();
  }
});

module.exports = router;
