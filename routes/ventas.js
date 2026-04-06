// =============================================
// routes/ventas.js — Registro de ventas
// =============================================
const express = require('express');
const { pool } = require('../database');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/ventas
// Registrar una venta y restar stock automáticamente
router.post('/', verificarToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { productos, notas, canal = 'whatsapp' } = req.body;

    if (!productos || productos.length === 0) {
      return res.status(400).json({ ok: false, error: 'La venta debe tener al menos un producto' });
    }

    await client.query('BEGIN');

    let total = 0;
    const productosVenta = [];

    for (const item of productos) {
      // Verificar stock antes de vender
      const prod = await client.query(
        'SELECT id, nombre, precio, stock FROM productos WHERE id = $1 AND activo = true FOR UPDATE',
        [item.id]
      );

      if (prod.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ ok: false, error: `Producto ID ${item.id} no encontrado` });
      }

      const producto = prod.rows[0];
      if (producto.stock < item.cantidad) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          ok: false,
          error: `Stock insuficiente para "${producto.nombre}". Disponible: ${producto.stock}`
        });
      }

      // Restar stock
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id = $2',
        [item.cantidad, item.id]
      );

      const subtotal = producto.precio * item.cantidad;
      total += subtotal;
      productosVenta.push({
        id: producto.id,
        nombre: producto.nombre,
        precio: producto.precio,
        cantidad: item.cantidad,
        subtotal
      });
    }

    // Guardar la venta
    const venta = await client.query(
      'INSERT INTO ventas (productos, total, canal, notas) VALUES ($1, $2, $3, $4) RETURNING id, created_at',
      [JSON.stringify(productosVenta), total, canal, notas]
    );

    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      venta: {
        id: venta.rows[0].id,
        productos: productosVenta,
        total,
        canal,
        fecha: venta.rows[0].created_at
      },
      mensaje: `Venta registrada. Total: $${total.toLocaleString('es-AR')}`
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error registrando venta:', err);
    res.status(500).json({ ok: false, error: 'Error registrando la venta' });
  } finally {
    client.release();
  }
});

// GET /api/ventas
// Historial de ventas (solo admin)
router.get('/', verificarToken, async (req, res) => {
  try {
    const { pagina = 1, limite = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    const result = await pool.query(
      `SELECT id, productos, total, canal, notas, created_at
       FROM ventas ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limite), offset]
    );

    const total = await pool.query('SELECT COUNT(*) FROM ventas');

    res.json({
      ok: true,
      ventas: result.rows,
      total: parseInt(total.rows[0].count)
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo ventas' });
  }
});

module.exports = router;
