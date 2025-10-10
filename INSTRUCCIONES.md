# 🚀 Instrucciones para ejecutar DOAPP

## ✅ Problemas resueltos

1. **Seed de base de datos**: Ahora funciona correctamente y crea 8 trabajos de prueba
2. **Organización de types**: Types centralizados en `client/types` y `server/types`
3. **Warning de Mongoose**: Eliminado el índice duplicado en User
4. **Autenticación**: Funcional con mensajes de error mejorados

## 📋 Requisitos previos

- Node.js instalado
- MongoDB Atlas configurado (ya tienes la conexión en `.env`)
- Dependencias instaladas: `npm install`

## 🎯 Pasos para ejecutar

### 1️⃣ Poblar la base de datos (solo la primera vez)

```bash
npm run seed
```

Esto creará:
- **5 usuarios** de prueba
- **8 trabajos** en diferentes categorías

### 2️⃣ Ejecutar en desarrollo

**Opción A - Todo junto (recomendado):**
```bash
npm run dev:all
```

**Opción B - Por separado (más estable):**

Terminal 1 - Servidor backend:
```bash
npm run dev:server
```

Terminal 2 - Cliente frontend:
```bash
npm run dev
```

### 3️⃣ Acceder a la aplicación

- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:5000
- **API Health**: http://localhost:5000/api/health

## 🔑 Credenciales de prueba

Cualquiera de estos usuarios funciona:

```
Email: maria@example.com
Email: carlos@example.com
Email: ana@example.com
Email: juan@example.com
Email: laura@example.com

Password: password123
```

## 🎨 Funcionalidades implementadas

### ✅ Autenticación
- Registro con validación de términos
- Login con manejo de errores mejorado
- Redirección automática después de login
- Protección de rutas privadas

### ✅ Trabajos
- Vista pública de trabajos (sin necesidad de login)
- Detalle completo de cada trabajo
- Aplicar a trabajos (requiere autenticación)
- Creación de trabajos protegida

### ✅ UI/UX
- Mensajes de error específicos y claros
- Botones protegidos que redirigen a login
- Indicadores de carga
- Diseño responsive

## 📁 Estructura de carpetas

```
client/
  ├── types/          # Types del frontend
  ├── hooks/          # React hooks (useAuth)
  ├── pages/          # Páginas principales
  └── components/     # Componentes reutilizables

server/
  ├── types/          # Types del backend
  ├── models/         # Modelos de MongoDB
  ├── routes/         # Rutas de API
  ├── middleware/     # Middleware (auth, errors)
  ├── scripts/        # Scripts (seed)
  └── config/         # Configuración
```

## 🐛 Solución de problemas

### Error: "proxy error ECONNREFUSED"
- **Causa**: El servidor backend no está corriendo o no ha iniciado completamente
- **Solución**: Ejecuta el backend y frontend por separado (Opción B)

### No aparecen trabajos
- **Causa**: La base de datos está vacía
- **Solución**: Ejecuta `npm run seed`

### Error de autenticación
- **Causa**: El servidor backend no está corriendo
- **Solución**: Verifica que `npm run dev:server` esté corriendo en puerto 5000

## 🔄 Comandos útiles

```bash
# Poblar/resetear base de datos
npm run seed

# Ejecutar todo junto
npm run dev:all

# Ejecutar solo frontend
npm run dev

# Ejecutar solo backend
npm run dev:server

# Build de producción
npm run build

# Verificar tipos TypeScript
npm run typecheck
```

## ⚠️ Nota importante

Si usas `npm run dev:all` y ves el error de proxy, simplemente **recarga la página** después de que el servidor backend haya iniciado completamente (verás el mensaje "🚀 Servidor corriendo...").

La opción más estable es ejecutar frontend y backend por separado en terminales diferentes.
