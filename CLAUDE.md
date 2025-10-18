# DOAPP - Context para Claude Code

## Resumen del Proyecto
Plataforma freelance con sistema de matching, pagos, contratos y chat en tiempo real. Stack: React + TypeScript + Express + MongoDB + Socket.io + Redis.

---

## Estructura Principal

```
D:\DOAPP\
├── client/          # React Frontend (Vite)
├── server/          # Express Backend (Node.js + TypeScript)
│   ├── config/      # Configuraciones (DB, i18n, passport, env)
│   ├── models/      # Mongoose schemas
│   ├── routes/      # Express routes
│   ├── services/    # Lógica de negocio (cache, analytics, payments)
│   ├── middleware/  # Auth, security, rate limiting
│   └── utils/       # Helpers (sanitizer, audit, tokens)
└── package.json
```

---

## Stack Tecnológico

**Backend:**
- Express 5 + TypeScript
- MongoDB + Mongoose
- Socket.io (real-time)
- Redis + ioredis (cache)
- JWT + Passport (auth)
- PayPal SDK (payments)

**Frontend:**
- React 18 + TypeScript
- Vite
- TailwindCSS
- React Router 6
- Socket.io-client

**Seguridad:**
- Helmet, CORS, XSS-clean
- Rate limiting (rate-limiter-flexible)
- DOMPurify (sanitización)
- 2FA (Speakeasy)

**Otros:**
- Sharp (optimización imágenes)
- i18next (ES/EN)
- Firebase Admin (push notifications)
- SendGrid/Mailgun (emails)

---

## Scripts Principales

```bash
npm run dev:all        # Frontend + Backend en paralelo
npm run dev            # Solo frontend (Vite)
npm run dev:server     # Solo backend (nodemon + tsx)
npm run security:check # Auditoría de seguridad
npm run seed           # Seed database
npm run build          # Build producción
```

---

## Variables de Entorno Clave

```env
# Core
PORT=5000
NODE_ENV=development
MONGODB_URI=mongodb+srv://...
JWT_SECRET=...
CLIENT_URL=http://localhost:5173

# Redis Cache
REDIS_URL=redis://localhost:6379

# Auth
GOOGLE_CLOUD_AUTH_ID=...
FACEBOOK_APP_ID=...

# Payments
PAYPAL_MODE=sandbox
PAYPAL_CLIENT_ID=...
PAYPAL_PLATFORM_FEE_PERCENTAGE=5

# Email
EMAIL_PROVIDER=sendgrid
SENDGRID_API_KEY=...

# Firebase
FIREBASE_SERVICE_ACCOUNT_KEY=...

# Analytics (opcional)
GOOGLE_ANALYTICS_ID=G-XXXXXXXXXX
```

---

## Modelos Principales

**User** (`server/models/User.ts`)
- Autenticación (local, OAuth)
- Trust score, roles, 2FA
- Dispositivos de login
- GDPR compliance

**Job** (`server/models/Job.ts`)
- Posts de trabajos
- Categorías, tags, pricing
- Status: open/in_progress/completed

**Contract** (`server/models/Contract.ts`)
- Contratos entre freelancer y cliente
- Milestones, pagos, escrow
- Negotiation integrada

**Payment** (`server/models/Payment.ts`)
- Transacciones PayPal
- Escrow, refunds, fees
- Status tracking

**Notification** (`server/models/Notification.ts`)
- In-app + push notifications
- FCM integration

**ChatMessage/Conversation** (`server/models/ChatMessage.ts`)
- Chat real-time (Socket.io)
- Attachments, read status

**Ticket** (`server/models/Ticket.ts`)
- Sistema de soporte
- Categorías, prioridad, status

**Review** (`server/models/Review.ts`)
- Sistema de ratings
- Impacta trust score

**Proposal** (`server/models/Proposal.ts`)
- Sistema de propuestas para trabajos
- Estados: pending, approved, rejected, cancelled, withdrawn
- Vincula freelancer con job y cliente

**Advertisement** (`server/models/Advertisement.ts`)
- Sistema de publicidad con 3 tipos de anuncios
- Modelos: model1 (3x1 banner), model2 (1x2 sidebar), model3 (1x1 card)
- Status: pending, active, paused, expired, rejected
- Analytics: impressions, clicks, CTR
- Payment integration con pricing dinámico

---

## Servicios Clave

**Cache** (`server/services/cache.ts`)
- Redis con fallback a memoria
- TTL configurable
- Pattern deletion
- Métodos: get, set, del, increment

**Analytics** (`server/services/analytics.ts`)
- Métricas de plataforma
- User growth, job stats, revenue
- Cache automático (10-60 min)

**Image Optimization** (`server/services/imageOptimization.ts`)
- Resize, compress (Sharp)
- Thumbnails, WebP conversion
- Validation

**Email** (`server/services/email.ts`)
- SendGrid/Mailgun
- Templates (bienvenida, reset password)

**PayPal** (`server/services/paypal.ts`)
- Orders, captures, refunds
- Platform fees

**Socket** (`server/services/socket.ts`)
- Real-time chat
- Typing indicators
- Online status

**FCM** (`server/services/fcm.ts`)
- Push notifications
- Device tokens

**Advertisement Service** (`server/services/advertisementService.ts`)
- Gestión de anuncios activos
- Integración de ads en listings (jobs, search)
- Cálculo de pricing dinámico
- Analytics y reporting (impressions, clicks, CTR)
- Auto-expiración de campañas

---

## Middleware Importante

**auth** (`server/middleware/auth.ts`)
- `authenticateToken`: Valida JWT
- `requireRole`: Control de roles

**advancedRateLimit** (`server/middleware/advancedRateLimit.ts`)
- Redis-based rate limiting
- authRateLimit: 5 req/15min
- perUserRateLimit: 200 req/hora

**permissions** (`server/middleware/permissions.ts`)
- Permisos granulares por rol
- RBAC system

**security** (`server/middleware/security.ts`)
- Helmet, CORS, XSS
- CSP headers

---

## Rutas Principales

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/profile

GET    /api/jobs
POST   /api/jobs
GET    /api/jobs/:id
PUT    /api/jobs/:id
DELETE /api/jobs/:id

GET    /api/contracts
POST   /api/contracts
PUT    /api/contracts/:id
POST   /api/contracts/:id/milestones/:milestoneId/complete

GET    /api/payments
POST   /api/payments/create-order
POST   /api/payments/capture

GET    /api/notifications
PUT    /api/notifications/:id/read
POST   /api/notifications/subscribe (FCM)

GET    /api/chat/conversations
GET    /api/chat/conversations/:id/messages
POST   /api/chat/conversations/:id/messages

POST   /api/reviews
GET    /api/reviews/user/:userId

GET    /api/search/jobs
GET    /api/search/tags
GET    /api/search/categories

GET    /api/proposals
GET    /api/proposals/job/:jobId
POST   /api/proposals
PUT    /api/proposals/:id/approve
PUT    /api/proposals/:id/reject
PUT    /api/proposals/:id/withdraw
DELETE /api/proposals/:id

GET    /api/advertisements/pricing
GET    /api/advertisements/active
GET    /api/advertisements
POST   /api/advertisements
GET    /api/advertisements/:id
PUT    /api/advertisements/:id
POST   /api/advertisements/:id/pause
POST   /api/advertisements/:id/resume
POST   /api/advertisements/:id/impression
POST   /api/advertisements/:id/click
GET    /api/advertisements/:id/performance
GET    /api/advertisements/stats/overview
DELETE /api/advertisements/:id

# Admin routes
GET    /api/admin/analytics
GET    /api/admin/users
GET    /api/admin/tickets
GET    /api/admin/advertisements
GET    /api/admin/advertisements/pending
POST   /api/admin/advertisements/:id/approve
POST   /api/admin/advertisements/:id/reject
PUT    /api/admin/advertisements/:id/priority
GET    /api/admin/advertisements/stats/platform
POST   /api/admin/advertisements/expire
```

---

## Características Implementadas

✅ **Autenticación**: JWT + OAuth (Google, Facebook) + 2FA
✅ **RBAC**: Roles y permisos granulares
✅ **Matching**: Código numérico para match
✅ **Contratos**: Milestones, escrow, negotiation
✅ **Pagos**: PayPal con fees automáticos
✅ **Chat**: Real-time con Socket.io
✅ **Notificaciones**: In-app + push (FCM)
✅ **Reviews**: Sistema de ratings bidireccional
✅ **Tickets**: Soporte con categorías
✅ **Búsqueda**: Filtros, tags, categorías
✅ **Analytics**: Métricas de plataforma
✅ **Cache**: Redis con TTL
✅ **Rate Limiting**: Redis-based avanzado
✅ **i18n**: ES/EN
✅ **Security**: Sanitización, GDPR, audit logs
✅ **Images**: Optimización con Sharp
✅ **Propuestas**: Sistema completo de propuestas para trabajos
✅ **Dashboard**: Página de métricas de usuario (ingresos, gastos, contratos, propuestas)
✅ **UI/UX**: Menú desplegable de usuario, modo oscuro mejorado
✅ **Publicidad**: Sistema completo de anuncios con 3 modelos, pricing dinámico, analytics y aprobación admin

---

## Patrones de Desarrollo

### 1. Error Handling
```typescript
try {
  // lógica
} catch (error) {
  res.status(500).json({ message: 'Error message' });
}
```

### 2. Validación
```typescript
import { body, validationResult } from 'express-validator';

const validate = [
  body('field').notEmpty(),
];

if (!validationResult(req).isEmpty()) {
  return res.status(400).json({ errors: ... });
}
```

### 3. Cache Pattern
```typescript
const cached = await cache.get<Data>(`key:${id}`);
if (cached) return cached;

const data = await fetchData();
await cache.set(`key:${id}`, data, 300); // 5 min
return data;
```

### 4. Auth Guard
```typescript
import { authenticateToken, requireRole } from '../middleware/auth.js';

router.get('/admin', authenticateToken, requireRole(['admin']), handler);
```

---

## Convenciones de Código

- **Imports**: Siempre con `.js` extension (ESM)
- **Types**: Interfaces en mayúscula (`IUser`, `IJob`)
- **Async**: Usar async/await, no callbacks
- **Responses**: JSON con `{ success, data, message, error }`
- **Status codes**: 200 (OK), 201 (Created), 400 (Bad Request), 401 (Unauthorized), 403 (Forbidden), 404 (Not Found), 500 (Server Error)

---

## Próximas Tareas (Opcional)

- Testing (Jest, Supertest)
- Docker + CI/CD
- Monitoring (Sentry)
- PWA features
- Mobile app (React Native)

---

## Tips para Claude Code

**Cuando trabajes en este proyecto:**

1. **No generar archivos innecesarios**: Siempre edita archivos existentes en lugar de crear nuevos
2. **Importaciones**: Recuerda agregar `.js` al final de imports TypeScript
3. **Cache**: Invalidar cache cuando modifiques datos (ej: `cache.delPattern('jobs:*')`)
4. **Rate limiting**: Usar middleware apropiado según sensibilidad del endpoint
5. **Sanitización**: Siempre sanitizar inputs de usuario con `sanitizer.ts`
6. **i18n**: Usar `i18next.t('key')` para strings traducibles
7. **Analytics**: Trackear eventos importantes con `analytics.trackEvent()`
8. **Audit logs**: Crear logs para acciones sensibles
9. **Permissions**: Verificar permisos antes de operaciones críticas
10. **TypeScript**: Mantener types estrictos, evitar `any`

**Archivos a consultar frecuentemente:**
- `server/models/User.ts` - Schema de usuario
- `server/models/Advertisement.ts` - Schema de anuncios
- `server/config/permissions.ts` - Definición de permisos
- `server/services/cache.ts` - API de caché
- `server/services/advertisementService.ts` - Servicio de publicidad
- `server/utils/sanitizer.ts` - Funciones de sanitización
- `server/middleware/auth.ts` - Guards de autenticación

**Comandos útiles:**
```bash
npm run security:check  # Antes de commits importantes
npm run typecheck       # Verificar errores TypeScript
npm run dev:server      # Test backend solo
```

---

**Fecha de creación:** 2025-10-12
**Última actualización:** Sistema de publicidad implementado (2025-10-16)
**Versión:** 1.2.0

---

## Sistema de Publicidad

### Descripción
Sistema completo de gestión de anuncios publicitarios que se integran entre los trabajos disponibles. Los anunciantes pueden crear campañas, elegir entre 3 modelos de anuncios, y monitorear su rendimiento.

### Modelos de Anuncios

**Model 1 (Banner 3x1)** - Premium
- Tamaño: 3 cards de ancho × 1 card de alto
- Precio base: $50/día
- Ubicación: Cada 6 trabajos
- Ideal para: Máxima visibilidad

**Model 2 (Sidebar 1x2)**
- Tamaño: 1 card de ancho × 2 cards de alto
- Precio base: $35/día
- Ubicación: Cada 4 trabajos
- Ideal para: Presencia destacada

**Model 3 (Card 1x1)**
- Tamaño: 1 card de ancho × 1 card de alto
- Precio base: $20/día
- Ubicación: Cada 3 trabajos
- Ideal para: Presupuesto ajustado

### Características

**Para Anunciantes:**
- Creación de campañas con fechas de inicio/fin
- Selección de tipo de anuncio
- Targeting por categorías, tags y ubicaciones
- Niveles de prioridad (costo adicional +10% por nivel)
- Dashboard de rendimiento con métricas detalladas
- Control de campañas: pausar, reanudar, eliminar
- Analytics en tiempo real: impressions, clicks, CTR
- Análisis de costos: CPM, CPC

**Para Administradores:**
- Sistema de aprobación de anuncios
- Gestión de prioridades
- Estadísticas de plataforma
- Moderación de contenido
- Expiración automática de campañas

**Integración:**
- Ads mezclados orgánicamente en listings de trabajos
- Tracking automático de impressions y clicks
- Cache optimizado con Redis
- Responsive design para todos los dispositivos

### Pricing Dinámico
```typescript
totalPrice = basePricePerDay × durationDays × (1 + priority × 0.1)
```

### Archivos Clave

**Backend:**
- `server/models/Advertisement.ts` - Modelo de datos
- `server/routes/advertisements.ts` - API endpoints
- `server/routes/admin/advertisements.ts` - Admin endpoints
- `server/services/advertisementService.ts` - Lógica de negocio

**Frontend:**
- `client/components/Advertisement.tsx` - Componente de visualización
- `client/hooks/useAdvertisements.ts` - Hooks de gestión
- `client/pages/AdvertisementManager.tsx` - Gestor de campañas
- `client/components/app/JobsScreen.tsx` - Integración en listings
