// =============================================
// server.js — Punto de entrada principal
// =============================================
// Este archivo arranca el servidor Express.
// Express es el framework más popular para hacer APIs en Node.js.

require('dotenv').config(); // Carga las variables del archivo .env

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3001;

// ─────────────────────────────────────────────
// MIDDLEWARES DE SEGURIDAD
// ─────────────────────────────────────────────

// Helmet: agrega headers de seguridad HTTP automáticamente
app.use(helmet());

// CORS: define quién puede hacer requests a esta API
// Solo tu frontend de Netlify puede acceder
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [process.env.FRONTEND_URL, /\.netlify\.app$/]
    : '*', // En desarrollo permite cualquier origen
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Parsear JSON en los requests (req.body)
app.use(express.json({ limit: '5mb' })); // Límite 5MB para imágenes en base64
app.use(express.urlencoded({ extended: true }));

// Rate limiting global: máximo 100 requests por IP cada 15 minutos
const limiterGeneral = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: 'Demasiadas solicitudes. Esperá unos minutos.' }
});
app.use(limiterGeneral);

// Rate limiting específico para login: máximo 10 intentos cada hora
const limiterLogin = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { ok: false, error: 'Demasiados intentos de login. Esperá 1 hora.' }
});
app.use('/api/auth/login', limiterLogin);

// ─────────────────────────────────────────────
// RUTAS
// ─────────────────────────────────────────────

// Health check: para saber si el servidor está funcionando
app.get('/', (req, res) => {
  res.json({
    ok: true,
    mensaje: '🛍 Shoma API funcionando correctamente',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

// Rutas principales
app.use('/api/auth', require('./routes/auth'));
app.use('/api/productos', require('./routes/productos'));
app.use('/api/ventas', require('./routes/ventas'));
app.use('/api/categorias', require('./routes/categorias'));
app.use('/api/variantes', require('./routes/variantes'));

// ─────────────────────────────────────────────
// MANEJO DE ERRORES
// ─────────────────────────────────────────────

// Ruta no encontrada (404)
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: `Ruta no encontrada: ${req.method} ${req.url}`
  });
});

// Error handler global (500)
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    ok: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message
  });
});

// ─────────────────────────────────────────────
// ARRANCAR SERVIDOR
// ─────────────────────────────────────────────
async function arrancar() {
  try {
    await initDatabase(); // Crear tablas si no existen
    app.listen(PORT, () => {
      console.log('');
      console.log('🛍  ================================');
      console.log('🛍  SHOMA API arrancada');
      console.log(`🛍  Puerto: ${PORT}`);
      console.log(`🛍  Entorno: ${process.env.NODE_ENV || 'development'}`);
      console.log('🛍  ================================');
      console.log('');
    });
  } catch (err) {
    console.error('❌ Error arrancando el servidor:', err);
    process.exit(1);
  }
}

arrancar();
