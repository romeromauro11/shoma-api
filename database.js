// =============================================
// database.js — Conexión a PostgreSQL
// =============================================
const { Pool } = require('pg');

// Pool = grupo de conexiones reutilizables (más eficiente que conectar cada vez)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Crear todas las tablas si no existen
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tabla de categorías
    await client.query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(100) NOT NULL UNIQUE,
        descripcion TEXT,
        activa BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla de productos
    await client.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        descripcion TEXT,
        precio DECIMAL(10,2) NOT NULL CHECK (precio >= 0),
        stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
        categoria_id INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
        imagen_url TEXT,
        emoji VARCHAR(10) DEFAULT '📦',
        activo BOOLEAN DEFAULT true,
        destacado BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla de ventas (historial)
    await client.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        productos JSONB NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        canal VARCHAR(50) DEFAULT 'whatsapp',
        notas TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Tabla de admin (usuarios)
    await client.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        nombre VARCHAR(100),
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Insertar categorías por defecto si la tabla está vacía
    await client.query(`
      INSERT INTO categorias (nombre) VALUES
        ('Bazar'), ('Juguetes'), ('Cocina'),
        ('Decoración'), ('Regalería'), ('Papelería'), ('Limpieza')
      ON CONFLICT (nombre) DO NOTHING
    `);

    // Trigger para actualizar updated_at automáticamente
    await client.query(`
      CREATE OR REPLACE FUNCTION update_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);
    await client.query(`
      DROP TRIGGER IF EXISTS set_updated_at ON productos;
      CREATE TRIGGER set_updated_at
        BEFORE UPDATE ON productos
        FOR EACH ROW EXECUTE FUNCTION update_updated_at();
    `);

    await client.query('COMMIT');
    console.log('✅ Base de datos inicializada correctamente');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error inicializando la base de datos:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
