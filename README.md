# 🛍 Shoma API

API REST profesional para la tienda Shoma — Bazar, Juguetería y Regalería.

## Stack tecnológico
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Base de datos**: PostgreSQL
- **Hosting**: Railway.app
- **Autenticación**: JWT (JSON Web Tokens)
- **Seguridad**: Helmet, CORS, Rate Limiting, bcrypt

---

## Endpoints disponibles

### Públicos (sin login)
| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/productos` | Lista de productos con filtros |
| GET | `/api/productos/:id` | Un producto específico |
| GET | `/api/categorias` | Todas las categorías |
| GET | `/health` | Estado del servidor |

### Privados (requieren token JWT)
| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login del admin |
| POST | `/api/auth/setup` | Crear primer admin |
| POST | `/api/productos` | Crear producto |
| PUT | `/api/productos/:id` | Actualizar producto |
| PATCH | `/api/productos/:id/stock` | Actualizar stock |
| DELETE | `/api/productos/:id` | Eliminar producto |
| POST | `/api/productos/importar` | Importar múltiples |
| POST | `/api/ventas` | Registrar venta |
| GET | `/api/ventas` | Historial de ventas |

---

## Guía de deploy en Railway

### Paso 1 — Crear cuenta en Railway
1. Ir a railway.app
2. "Login with GitHub" (usá la misma cuenta que ya tenés)

### Paso 2 — Crear el proyecto
1. Click en "New Project"
2. "Deploy from GitHub repo"
3. Seleccioná un nuevo repo llamado "shoma-api" (tenés que crear este repo aparte del de la tienda)
4. Railway detecta automáticamente que es Node.js

### Paso 3 — Agregar PostgreSQL
1. En el proyecto de Railway → "New" → "Database" → "PostgreSQL"
2. Railway crea la base de datos y te da la variable DATABASE_URL automáticamente

### Paso 4 — Variables de entorno en Railway
En tu proyecto → "Variables" → agregar:
```
JWT_SECRET=<generá una clave con: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
NODE_ENV=production
FRONTEND_URL=https://tu-tienda.netlify.app
```
Railway agrega DATABASE_URL automáticamente.

### Paso 5 — Deploy
Railway hace el deploy automático cuando subís código a GitHub.
Te da una URL tipo: `https://shoma-api-production.up.railway.app`

### Paso 6 — Crear el primer admin
Hacer un POST a `https://tu-api.railway.app/api/auth/setup`:
```json
{
  "email": "tu@email.com",
  "password": "tu_contraseña_segura",
  "nombre": "Admin Shoma"
}
```
Podés hacerlo con Postman, Insomnia, o Thunder Client (extensión de VS Code).

---

## Desarrollo local

```bash
# 1. Clonar el repo
git clone https://github.com/tu-usuario/shoma-api.git
cd shoma-api

# 2. Instalar dependencias
npm install

# 3. Copiar y completar variables de entorno
cp .env.example .env
# Editar .env con tus datos

# 4. Arrancar en modo desarrollo
npm run dev
```

La API queda en: http://localhost:3001
