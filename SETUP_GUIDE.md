# DoApp - Guía de Configuración

## 📋 Requisitos Previos

- Node.js 18+ 
- npm o yarn
- MongoDB Atlas account (o instancia local de MongoDB)
- Git

## 🚀 Instalación Rápida

### 1. Clonar el Repositorio

```bash
git clone <repository-url>
cd DOAPP
```

### 2. Instalar Dependencias

```bash
npm install
```

### 3. Configurar Variables de Entorno

Copia el archivo `.env.example` a `.env`:

```bash
cp .env.example .env
```

Edita `.env` y configura las siguientes variables **OBLIGATORIAS**:

```env
# Base de Datos (OBLIGATORIO)
MONGODB_URI=tu-mongodb-uri

# Seguridad (OBLIGATORIO)
JWT_SECRET=genera-un-secret-seguro-aqui

# URLs (OBLIGATORIO)
CLIENT_URL=http://localhost:5173
```

### 4. Iniciar el Servidor

```bash
npm run dev:all
```

Esto iniciará:
- Backend en `http://localhost:5000`
- Frontend en `http://localhost:5173`

---

## 🔧 Configuración Detallada

### Variables de Entorno Obligatorias

#### 1. Base de Datos - MongoDB

**MongoDB Atlas (Recomendado para producción):**
1. Crea una cuenta en [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Crea un cluster
3. Ve a "Database Access" y crea un usuario
4. Ve a "Network Access" y añade tu IP (o 0.0.0.0/0 para desarrollo)
5. Click en "Connect" y copia la connection string

```env
MONGODB_URI=mongodb+srv://usuario:contraseña@cluster.mongodb.net/doapp?retryWrites=true&w=majority
```

**MongoDB Local:**
```env
MONGODB_URI=mongodb://localhost:27017/doapp
```

#### 2. JWT Secret

Genera un secret fuerte:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

```env
JWT_SECRET=tu-secret-generado-aqui
```

### Variables Opcionales (Funcionalidades Adicionales)

#### OAuth - Google

1. Ve a [Google Cloud Console](https://console.cloud.google.com)
2. Crea un proyecto
3. Habilita Google+ API
4. Crea credenciales OAuth 2.0
5. Añade `http://localhost:5000/api/auth/google/callback` a Authorized redirect URIs

```env
GOOGLE_CLOUD_AUTH_ID=tu-client-id.apps.googleusercontent.com
GOOGLE_CLOUD_AUTH_PASS=tu-client-secret
```

#### OAuth - Facebook

1. Ve a [Facebook Developers](https://developers.facebook.com)
2. Crea una app
3. Configura Facebook Login
4. Añade `http://localhost:5000/api/auth/facebook/callback` a Valid OAuth Redirect URIs

```env
FACEBOOK_APP_ID=tu-app-id
FACEBOOK_APP_SECRET=tu-app-secret
VITE_FACEBOOK_APP_ID=tu-app-id
```

#### PayPal

1. Ve a [PayPal Developer](https://developer.paypal.com)
2. Crea una app en Sandbox
3. Obtén Client ID y Secret

```env
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=tu-client-id
PAYPAL_CLIENT_SECRET=tu-client-secret
VITE_PAYPAL_CLIENT_ID=tu-client-id
```

#### Firebase (Notificaciones Push)

1. Ve a [Firebase Console](https://console.firebase.google.com)
2. Crea un proyecto
3. Ve a Project Settings > Service Accounts
4. Genera nueva clave privada (descarga JSON)
5. Convierte a base64:

**Linux/Mac:**
```bash
base64 -i serviceAccountKey.json | tr -d '\n'
```

**Windows (PowerShell):**
```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("serviceAccountKey.json"))
```

```env
FIREBASE_SERVICE_ACCOUNT_KEY=tu-json-en-base64
```

#### Email - SendGrid

1. Crea cuenta en [SendGrid](https://sendgrid.com)
2. Ve a Settings > API Keys
3. Crea nueva API key

```env
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=SG.tu-api-key
SENDGRID_FROM_EMAIL=noreply@tudominio.com
```

#### Email - Mailgun (Alternativa)

1. Crea cuenta en [Mailgun](https://www.mailgun.com)
2. Verifica tu dominio
3. Obtén API key

```env
EMAIL_PROVIDER=mailgun
MAILGUN_API_KEY=tu-api-key
MAILGUN_DOMAIN=mg.tudominio.com
MAILGUN_FROM_EMAIL=noreply@tudominio.com
```

#### Redis (Caché - Opcional pero Recomendado)

**Redis Local:**
```bash
# Instalar Redis
# Windows: https://github.com/microsoftarchive/redis/releases
# Mac: brew install redis
# Linux: sudo apt-get install redis-server

# Iniciar Redis
redis-server
```

```env
REDIS_URL=redis://localhost:6379
```

**Redis Cloud:**
1. Crea cuenta en [Redis Cloud](https://redis.com/cloud)
2. Crea una base de datos
3. Obtén la connection string

```env
REDIS_URL=redis://usuario:contraseña@host:puerto
```

#### Google Analytics

1. Ve a [Google Analytics](https://analytics.google.com)
2. Crea una propiedad GA4
3. Obtén el Measurement ID

```env
GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
VITE_GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```

---

## 📂 Estructura de Directorios

```
DOAPP/
├── client/              # Frontend (React + Vite)
│   ├── components/      # Componentes React
│   ├── pages/          # Páginas
│   ├── hooks/          # Custom hooks
│   ├── utils/          # Utilidades
│   └── types/          # TypeScript types
├── server/             # Backend (Express + TypeScript)
│   ├── config/         # Configuración
│   ├── models/         # Modelos Mongoose
│   ├── routes/         # Rutas API
│   ├── services/       # Servicios (cache, email, etc.)
│   ├── middleware/     # Middleware
│   ├── utils/          # Utilidades
│   └── locales/        # Traducciones i18n
├── uploads/            # Archivos subidos (gitignored)
├── temp/               # Archivos temporales (gitignored)
└── public/             # Archivos estáticos
```

---

## 🎯 Scripts Disponibles

```bash
# Desarrollo
npm run dev              # Solo frontend
npm run dev:server       # Solo backend
npm run dev:all          # Frontend + Backend

# Build
npm run build            # Build completo
npm run build:server     # Build backend
npm run build:client     # Build frontend

# Testing
npm run typecheck        # Verificar tipos TypeScript
npm run security:check   # Verificar seguridad
npm run security:audit   # Audit + fix vulnerabilidades

# Producción
npm start                # Iniciar en producción
npm run preview          # Preview del build
```

---

## 🔒 Checklist de Seguridad

Antes de ir a producción:

- [ ] Cambiar `JWT_SECRET` a un valor fuerte y único
- [ ] Configurar `NODE_ENV=production`
- [ ] Cambiar `PAYPAL_MODE=live` (si usas PayPal)
- [ ] Configurar HTTPS
- [ ] Configurar CORS correctamente
- [ ] Configurar IP whitelist en MongoDB Atlas
- [ ] Habilitar Firebase/SendGrid en producción
- [ ] Configurar rate limiting apropiado
- [ ] Revisar todas las variables de entorno
- [ ] Ejecutar `npm run security:check`
- [ ] Configurar backups automáticos de MongoDB
- [ ] Configurar monitoring (logs, errores)

---

## 🆘 Solución de Problemas

### Error: "MongoDB connection failed"
- Verifica que la URI de MongoDB sea correcta
- Verifica que tu IP esté en whitelist (MongoDB Atlas)
- Verifica que el usuario/contraseña sean correctos

### Error: "Redis connection failed"
- Redis es OPCIONAL. Si no lo necesitas, deja `REDIS_URL` vacío
- Verifica que Redis esté corriendo: `redis-cli ping`
- Verifica la connection string

### Error: "Port 5000 already in use"
- Cambia el puerto en `.env`: `PORT=5001`
- O mata el proceso: `npx kill-port 5000`

### Warnings de Firebase/SendGrid
- Son normales si no configuraste estas variables
- Las funcionalidades seguirán funcionando sin ellas
- Configúralas cuando necesites notificaciones

---

## 📚 Documentación Adicional

- [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md) - Documentación de PHASE 1 (MVP)
- [PHASE2_COMPLETE.md](./PHASE2_COMPLETE.md) - Documentación de PHASE 2 (Post-MVP)
- [PHASE3_COMPLETE.md](./PHASE3_COMPLETE.md) - Documentación de PHASE 3 (Optimización)

---

## 🤝 Soporte

Si tienes problemas:
1. Revisa esta guía
2. Verifica los archivos de documentación
3. Revisa los logs del servidor
4. Verifica las variables de entorno

---

**¡Listo para empezar a desarrollar! 🚀**
