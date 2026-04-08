// =============================================
// routes/productos.js — CRUD de productos
// =============================================
// CRUD = Create, Read, Update, Delete
// Estas son todas las operaciones posibles sobre los productos

const express = require('express');
const { pool } = require('../database');
const { verificarToken } = require('../middleware/auth');

const router = express.Router();

// ─────────────────────────────────────────────
// RUTAS PÚBLICAS (no requieren login)
// ─────────────────────────────────────────────

// GET /api/productos
// Lista productos con filtros opcionales
// Query params: ?categoria=Bazar&buscar=taza&pagina=1&limite=12&destacados=true
router.get('/', async (req, res) => {
  try {
    const { categoria, buscar, pagina = 1, limite = 12, destacados } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(limite);

    let whereConditions = ['p.activo = true'];
    let params = [];
    let paramIndex = 1;

    if (categoria && categoria !== 'Todos') {
      whereConditions.push(`c.nombre = $${paramIndex++}`);
      params.push(categoria);
    }
    if (buscar) {
      whereConditions.push(`(p.nombre ILIKE $${paramIndex} OR p.descripcion ILIKE $${paramIndex})`);
      params.push(`%${buscar}%`);
      paramIndex++;
    }
    if (destacados === 'true') {
      whereConditions.push('p.destacado = true');
    }

    const where = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    // Contar total para paginación
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Obtener productos de esta página
    const result = await pool.query(
      `SELECT
         p.id, p.nombre, p.descripcion, p.precio, p.stock,
         p.imagen_url, p.emoji, p.destacado,
         c.nombre AS categoria,
         p.created_at, p.updated_at
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ${where}
       ORDER BY p.destacado DESC, p.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, parseInt(limite), offset]
    );

    // Agregar variantes a cada producto
    const productosConVariantes = await Promise.all(result.rows.map(async (prod) => {
      const vars = await pool.query(
        'SELECT id, nombre, color_hex, imagen_url, stock, orden FROM variantes_producto WHERE producto_id = $1 AND activa = true ORDER BY orden ASC',
        [prod.id]
      );
      const imgs = await pool.query(
        'SELECT imagen_url FROM imagenes_producto WHERE producto_id = $1 ORDER BY orden ASC',
        [prod.id]
      );
      return { ...prod, variantes: vars.rows, imagenes_extra: imgs.rows.map(i => i.imagen_url) };
    }));

    res.json({
      ok: true,
      productos: productosConVariantes,
      paginacion: {
        total,
        pagina: parseInt(pagina),
        limite: parseInt(limite),
        totalPaginas: Math.ceil(total / parseInt(limite))
      }
    });
  } catch (err) {
    console.error('Error listando productos:', err);
    res.status(500).json({ ok: false, error: 'Error obteniendo productos' });
  }
});

// GET /api/productos/:id
// Obtener un producto específico
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT p.*, c.nombre AS categoria
       FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = $1 AND p.activo = true`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    const prod = result.rows[0];
    const vars = await pool.query(
      'SELECT id, nombre, color_hex, imagen_url, stock, orden FROM variantes_producto WHERE producto_id = $1 AND activa = true ORDER BY orden ASC',
      [prod.id]
    );
    const imgs = await pool.query(
      'SELECT imagen_url FROM imagenes_producto WHERE producto_id = $1 ORDER BY orden ASC',
      [prod.id]
    );
    prod.variantes = vars.rows;
    prod.imagenes_extra = imgs.rows.map(i => i.imagen_url);
    res.json({ ok: true, producto: prod });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error obteniendo producto' });
  }
});

// ─────────────────────────────────────────────
// RUTAS PRIVADAS (requieren login - verificarToken)
// ─────────────────────────────────────────────

// POST /api/productos
// Crear un nuevo producto
router.post('/', verificarToken, async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, categoria, imagen_url, emoji, destacado } = req.body;

    // Validaciones
    if (!nombre || nombre.trim().length < 2) {
      return res.status(400).json({ ok: false, error: 'El nombre es obligatorio (mínimo 2 caracteres)' });
    }
    if (precio === undefined || precio < 0) {
      return res.status(400).json({ ok: false, error: 'El precio debe ser un número positivo' });
    }
    if (stock === undefined || stock < 0) {
      return res.status(400).json({ ok: false, error: 'El stock debe ser un número positivo' });
    }

    // Buscar o crear la categoría
    let categoriaId = null;
    if (categoria) {
      const catResult = await pool.query(
        'SELECT id FROM categorias WHERE nombre = $1',
        [categoria]
      );
      if (catResult.rows.length > 0) {
        categoriaId = catResult.rows[0].id;
      } else {
        const newCat = await pool.query(
          'INSERT INTO categorias (nombre) VALUES ($1) RETURNING id',
          [categoria]
        );
        categoriaId = newCat.rows[0].id;
      }
    }

    const result = await pool.query(
      `INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, imagen_url, emoji, destacado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        nombre.trim(), descripcion?.trim() || '', precio, stock,
        categoriaId, imagen_url || null, emoji || '📦', destacado || false
      ]
    );

    // Obtener el producto completo con la categoría
    const producto = await pool.query(
      `SELECT p.*, c.nombre AS categoria FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       WHERE p.id = $1`,
      [result.rows[0].id]
    );

    res.status(201).json({
      ok: true,
      producto: producto.rows[0],
      mensaje: `Producto "${nombre}" creado correctamente`
    });
  } catch (err) {
    console.error('Error creando producto:', err);
    res.status(500).json({ ok: false, error: 'Error creando producto' });
  }
});

// PUT /api/productos/:id
// Actualizar un producto completo
router.put('/:id', verificarToken, async (req, res) => {
  try {
    const { nombre, descripcion, precio, stock, categoria, imagen_url, emoji, destacado, activo } = req.body;
    const { id } = req.params;

    // Verificar que existe
    const existe = await pool.query('SELECT id FROM productos WHERE id = $1', [id]);
    if (existe.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    // Resolver categoría
    let categoriaId = null;
    if (categoria) {
      const catResult = await pool.query('SELECT id FROM categorias WHERE nombre = $1', [categoria]);
      categoriaId = catResult.rows.length > 0 ? catResult.rows[0].id : null;
    }

    await pool.query(
      `UPDATE productos
       SET nombre = $1, descripcion = $2, precio = $3, stock = $4,
           categoria_id = $5, imagen_url = $6, emoji = $7, destacado = $8, activo = $9
       WHERE id = $10`,
      [nombre, descripcion, precio, stock, categoriaId, imagen_url, emoji || '📦', destacado ?? true, activo ?? true, id]
    );

    const updated = await pool.query(
      `SELECT p.*, c.nombre AS categoria FROM productos p
       LEFT JOIN categorias c ON p.categoria_id = c.id WHERE p.id = $1`,
      [id]
    );

    res.json({ ok: true, producto: updated.rows[0], mensaje: 'Producto actualizado' });
  } catch (err) {
    console.error('Error actualizando producto:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando producto' });
  }
});

// PATCH /api/productos/:id/stock
// Actualizar solo el stock (para registrar ventas)
router.patch('/:id/stock', verificarToken, async (req, res) => {
  try {
    const { cantidad, operacion } = req.body;
    // operacion: 'restar' (venta) | 'sumar' (reposición) | 'fijar' (valor exacto)
    const { id } = req.params;

    if (cantidad < 0) {
      return res.status(400).json({ ok: false, error: 'La cantidad debe ser positiva' });
    }

    let query;
    if (operacion === 'restar') {
      query = 'UPDATE productos SET stock = GREATEST(0, stock - $1) WHERE id = $2 RETURNING stock';
    } else if (operacion === 'sumar') {
      query = 'UPDATE productos SET stock = stock + $1 WHERE id = $2 RETURNING stock';
    } else if (operacion === 'fijar') {
      query = 'UPDATE productos SET stock = $1 WHERE id = $2 RETURNING stock';
    } else {
      return res.status(400).json({ ok: false, error: 'Operación inválida. Usá: restar, sumar o fijar' });
    }

    const result = await pool.query(query, [cantidad, id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    res.json({
      ok: true,
      stockNuevo: result.rows[0].stock,
      mensaje: `Stock actualizado. Stock actual: ${result.rows[0].stock}`
    });
  } catch (err) {
    console.error('Error actualizando stock:', err);
    res.status(500).json({ ok: false, error: 'Error actualizando stock' });
  }
});

// DELETE /api/productos/:id
// Eliminación lógica (no borra de la DB, solo oculta)
router.delete('/:id', verificarToken, async (req, res) => {
  try {
    const result = await pool.query(
      'UPDATE productos SET activo = false WHERE id = $1 RETURNING nombre',
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ ok: false, error: 'Producto no encontrado' });
    }

    res.json({ ok: true, mensaje: `Producto "${result.rows[0].nombre}" eliminado` });
  } catch (err) {
    res.status(500).json({ ok: false, error: 'Error eliminando producto' });
  }
});

// POST /api/productos/importar
// Importar múltiples productos de una vez (desde Excel)
router.post('/importar', verificarToken, async (req, res) => {
  try {
    const { productos } = req.body;
    if (!Array.isArray(productos) || productos.length === 0) {
      return res.status(400).json({ ok: false, error: 'Se requiere un array de productos' });
    }

    let agregados = 0, actualizados = 0, errores = [];

    for (const p of productos) {
      try {
        if (!p.nombre || p.precio === undefined) {
          errores.push(`Fila inválida: ${JSON.stringify(p)}`);
          continue;
        }

        // Resolver categoría
        let categoriaId = null;
        if (p.categoria) {
          const cat = await pool.query(
            'INSERT INTO categorias (nombre) VALUES ($1) ON CONFLICT (nombre) DO UPDATE SET nombre = EXCLUDED.nombre RETURNING id',
            [p.categoria]
          );
          categoriaId = cat.rows[0].id;
        }

        // Upsert: si el nombre ya existe, actualiza; si no, inserta
        const existing = await pool.query('SELECT id FROM productos WHERE nombre ILIKE $1', [p.nombre]);
        if (existing.rows.length > 0) {
          await pool.query(
            `UPDATE productos SET descripcion=$1, precio=$2, stock=$3, categoria_id=$4, imagen_url=$5, emoji=$6, activo=true
             WHERE id=$7`,
            [p.descripcion || '', p.precio, p.stock || 0, categoriaId, p.imagen_url || null, p.emoji || '📦', existing.rows[0].id]
          );
          actualizados++;
        } else {
          await pool.query(
            `INSERT INTO productos (nombre, descripcion, precio, stock, categoria_id, imagen_url, emoji)
             VALUES ($1,$2,$3,$4,$5,$6,$7)`,
            [p.nombre, p.descripcion || '', p.precio, p.stock || 0, categoriaId, p.imagen_url || null, p.emoji || '📦']
          );
          agregados++;
        }
      } catch (rowErr) {
        errores.push(`Error en "${p.nombre}": ${rowErr.message}`);
      }
    }

    res.json({
      ok: true,
      mensaje: `Importación completa: ${agregados} agregados, ${actualizados} actualizados`,
      agregados, actualizados,
      errores: errores.length > 0 ? errores : undefined
    });
  } catch (err) {
    console.error('Error importando:', err);
    res.status(500).json({ ok: false, error: 'Error en la importación' });
  }
});

module.exports = router;
