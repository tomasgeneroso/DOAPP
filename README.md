# 🚀 Doers - Plataforma de Servicios Profesionales

Doers es una plataforma moderna que conecta clientes con profesionales para realizar trabajos y servicios. Desarrollada con React, TypeScript, Express y MongoDB.

## 📋 Tabla de Contenidos

- [Características](#características)
- [Tecnologías](#tecnologías)
- [Requisitos Previos](#requisitos-previos)
- [Instalación](#instalación)
- [Configuración](#configuración)
- [Desarrollo](#desarrollo)
- [Deployment](#deployment)
- [Estructura del Proyecto](#estructura-del-proyecto)
- [API Documentation](#api-documentation)

## ✨ Características

### Frontend
- ✅ Interfaz moderna y responsive (mobile-first)
- ✅ Sistema de autenticación con JWT
- ✅ Términos y condiciones para app y contratos
- ✅ SEO optimizado con meta tags internacionales
- ✅ Diseño con Tailwind CSS
- ✅ Componentes UI nativos (sin frameworks externos)

### Backend
- ✅ API RESTful con Express
- ✅ Base de datos MongoDB con Mongoose
- ✅ Autenticación y autorización con JWT
- ✅ Validación de datos con express-validator
- ✅ Seguridad con Helmet y CORS
- ✅ Manejo de errores centralizado

### Funcionalidades
- 📝 Publicación de trabajos
- 👥 Sistema de perfiles de usuarios
- 💼 Creación de contratos entre clientes y doers
- ⭐ Sistema de calificaciones
- 📄 Términos y condiciones legales
- 🔒 Gestión de pagos y comisiones

## 🛠 Tecnologías

### Frontend
- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router DOM
- React Helmet Async
- Lucide React (iconos)

### Backend
- Node.js
- Express
- MongoDB
- Mongoose
- JWT
- Bcrypt
- Helmet
- CORS

## 📦 Requisitos Previos

- Node.js 20.19+ o 22.12+
- MongoDB (local o MongoDB Atlas)
- npm o yarn

## 🚀 Instalación

### 1. Clonar el repositorio

\`\`\`bash
git clone <url-del-repo>
cd doapp
\`\`\`

### 2. Instalar dependencias

\`\`\`bash
npm install
\`\`\`

### 3. Configurar variables de entorno

Copia el archivo de ejemplo y configura tus variables:

\`\`\`bash
cp .env.example .env
\`\`\`

Edita `.env` con tus valores:

\`\`\`env
# MongoDB
MONGODB_URI=mongodb://localhost:27017/doers

# JWT Secret (genera uno seguro!)
JWT_SECRET=tu-secreto-super-seguro

# Servidor
PORT=5000
NODE_ENV=development

# Frontend URL
CLIENT_URL=http://localhost:5173
\`\`\`

### 4. Iniciar MongoDB

Si usas MongoDB local:

\`\`\`bash
# Windows
mongod

# macOS/Linux
sudo systemctl start mongodb
\`\`\`

Si usas MongoDB Atlas, asegúrate de tener tu connection string en `MONGODB_URI`.

## 💻 Desarrollo

### Iniciar todo el proyecto (Frontend + Backend)

\`\`\`bash
npm run dev:all
\`\`\`

Esto iniciará:
- Frontend en `http://localhost:5173`
- Backend en `http://localhost:5000`

### Iniciar solo el frontend

\`\`\`bash
npm run dev
\`\`\`

### Iniciar solo el backend

\`\`\`bash
npm run dev:server
\`\`\`

### Type checking

\`\`\`bash
npm run typecheck
\`\`\`

## 📦 Build para Producción

### 1. Build del frontend

\`\`\`bash
npm run build
\`\`\`

Esto genera los archivos estáticos en `dist/spa/`

### 2. Build del backend

\`\`\`bash
npm run build:server
\`\`\`

Esto compila TypeScript a JavaScript en `dist/server/`

### 3. Iniciar en producción

\`\`\`bash
npm start
\`\`\`

## 🌐 Deployment

### Opción 1: Vercel (Frontend) + Railway/Render (Backend)

#### Frontend en Vercel

1. Conecta tu repositorio a Vercel
2. Configura las variables de entorno:
   - `VITE_APP_NAME`
3. Build command: `npm run build`
4. Output directory: `dist/spa`
5. Deploy!

#### Backend en Railway

1. Crea un nuevo proyecto en Railway
2. Conecta tu repositorio
3. Configura las variables de entorno:
   - `MONGODB_URI` (usa MongoDB Atlas)
   - `JWT_SECRET`
   - `PORT=5000`
   - `NODE_ENV=production`
   - `CLIENT_URL=https://tu-dominio-vercel.app`
4. Start command: `npm start`
5. Deploy!

### Opción 2: VPS (DigitalOcean, AWS, etc.)

#### 1. Conectar al servidor

\`\`\`bash
ssh user@your-server-ip
\`\`\`

#### 2. Instalar dependencias del sistema

\`\`\`bash
# Actualizar sistema
sudo apt update && sudo apt upgrade -y

# Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Instalar MongoDB
# Seguir: https://www.mongodb.com/docs/manual/tutorial/install-mongodb-on-ubuntu/

# Instalar PM2 (proceso manager)
sudo npm install -g pm2

# Instalar Nginx
sudo apt install -y nginx
\`\`\`

#### 3. Clonar y configurar el proyecto

\`\`\`bash
cd /var/www
sudo git clone <url-del-repo> doers
cd doers
sudo npm install
sudo cp .env.example .env
sudo nano .env  # Configurar variables
\`\`\`

#### 4. Build del proyecto

\`\`\`bash
sudo npm run build
sudo npm run build:server
\`\`\`

#### 5. Configurar PM2

\`\`\`bash
pm2 start dist/server/index.js --name doers-api
pm2 startup
pm2 save
\`\`\`

#### 6. Configurar Nginx

\`\`\`bash
sudo nano /etc/nginx/sites-available/doers
\`\`\`

Agregar:

\`\`\`nginx
server {
    listen 80;
    server_name tu-dominio.com;

    # Frontend
    location / {
        root /var/www/doers/dist/spa;
        try_files $uri $uri/ /index.html;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Legal documents
    location /legal {
        proxy_pass http://localhost:5000;
    }
}
\`\`\`

Activar sitio:

\`\`\`bash
sudo ln -s /etc/nginx/sites-available/doers /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
\`\`\`

#### 7. Configurar SSL (opcional pero recomendado)

\`\`\`bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d tu-dominio.com
\`\`\`

## 📁 Estructura del Proyecto

\`\`\`
doapp/
├── client/                 # Frontend React
│   ├── components/
│   │   ├── app/           # Componentes de pantallas
│   │   └── ui/            # Componentes UI reutilizables
│   ├── lib/               # Utilidades
│   ├── pages/             # Páginas principales
│   ├── App.tsx
│   ├── main.tsx
│   └── global.css
├── server/                 # Backend Express
│   ├── config/            # Configuración (DB, env)
│   ├── middleware/        # Middleware (auth, errors)
│   ├── models/            # Modelos de MongoDB
│   ├── routes/            # Rutas de la API
│   └── index.ts           # Servidor principal
├── public/
│   └── legal/             # Documentos legales (T&C)
├── .env                   # Variables de entorno (NO commitear)
├── .env.example           # Ejemplo de variables
├── package.json
├── tsconfig.json          # Config TypeScript (frontend)
├── tsconfig.server.json   # Config TypeScript (backend)
├── vite.config.ts         # Config Vite
├── tailwind.config.ts     # Config Tailwind
└── README.md
\`\`\`

## 🔌 API Documentation

### Authentication

#### POST `/api/auth/register`
Registrar nuevo usuario

**Body:**
\`\`\`json
{
  "name": "Juan Pérez",
  "email": "juan@example.com",
  "password": "password123",
  "phone": "+54 11 1234-5678",
  "termsAccepted": true
}
\`\`\`

#### POST `/api/auth/login`
Iniciar sesión

**Body:**
\`\`\`json
{
  "email": "juan@example.com",
  "password": "password123"
}
\`\`\`

#### GET `/api/auth/me`
Obtener usuario actual (requiere auth)

**Headers:**
\`\`\`
Authorization: Bearer <token>
\`\`\`

### Jobs

#### GET `/api/jobs`
Listar trabajos

**Query params:**
- `status`: open | in_progress | completed | cancelled
- `category`: categoría del trabajo
- `minPrice`: precio mínimo
- `maxPrice`: precio máximo
- `limit`: cantidad de resultados (default: 20)

#### POST `/api/jobs`
Crear trabajo (requiere auth)

**Body:**
\`\`\`json
{
  "title": "Armar caja de madera",
  "summary": "Armar una caja de 60x100cm",
  "description": "Descripción detallada...",
  "price": 1500,
  "location": "Caballito, CABA",
  "startDate": "2025-10-15T13:00:00Z",
  "endDate": "2025-10-15T21:00:00Z"
}
\`\`\`

### Contracts

#### POST `/api/contracts`
Crear contrato (requiere auth)

**Body:**
\`\`\`json
{
  "job": "job_id",
  "doer": "doer_id",
  "price": 1500,
  "startDate": "2025-10-15T13:00:00Z",
  "endDate": "2025-10-15T21:00:00Z",
  "termsAccepted": true
}
\`\`\`

#### PUT `/api/contracts/:id/complete`
Marcar contrato como completado (requiere auth)

## 📄 Legal

Los términos y condiciones se encuentran en:
- `/public/legal/terminos-condiciones-app.txt` - T&C de la plataforma
- `/public/legal/terminos-condiciones-contrato.txt` - T&C de contratos

## 🔐 Seguridad

- Las contraseñas se hashean con bcrypt
- Autenticación con JWT
- Headers de seguridad con Helmet
- CORS configurado
- Validación de datos en todas las rutas

## 📝 Notas Importantes

1. **MongoDB Atlas**: Para producción, usa MongoDB Atlas en lugar de MongoDB local
2. **JWT Secret**: Genera un secreto seguro con: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. **CORS**: Actualiza `CLIENT_URL` en producción con tu dominio real
4. **Variables de entorno**: Nunca commitees `.env`, usa `.env.example` como referencia

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## 📞 Soporte

Para soporte, contacta a: legal@doers.com.ar

## 📜 Licencia

Este proyecto es privado y propietario.

---

**Hecho con ❤️ en Argentina 🇦🇷**
