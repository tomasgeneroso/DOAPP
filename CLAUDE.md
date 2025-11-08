# DOAPP - Context para Claude Code

## Resumen
Plataforma freelance Argentina: React + TypeScript + Express + PostgreSQL + Socket.io + Redis + MercadoPago

**🇦🇷 CONFIG ARGENTINA**
- **Pagos**: MercadoPago con escrow | Conversión USD↔ARS automática
- **Comisiones**: 8% estándar, 3% PRO, 2% SUPER PRO | Contratos < $8000 ARS → comisión mínima $1000 ARS fija
- **Membresía PRO**: €5.99/mes → 3 contratos/mes al 3%, badge, KYC, stats
- **Membresía SUPER PRO**: €8.99/mes → 3 contratos/mes al 2%, analytics avanzados, dashboard exclusivo
- **Referidos**: 1000 usuarios → 3 códigos → beneficios progresivos
- **Escrow**: Retención hasta confirmación bidireccional o disputa admin
- **Retiros**: CBU argentino, mín $1000 ARS, workflow admin completo

## Stack
**Backend**: Express 5, PostgreSQL (Sequelize), Socket.io, Redis, JWT, MercadoPago, Sharp, i18n, FCM
**Frontend**: React 18, Vite, TailwindCSS, Router 6
**Security**: Helmet, CORS, XSS-clean, Rate limiting, 2FA

## Scripts
```bash
npm run dev:all / dev / dev:server / seed:mockup / test / build
npx tsx server/scripts/assignAdminRoleSQL.ts <email> <role>  # Asignar roles admin
```

## Roles de Administrador (PostgreSQL)

**Asignar rol:** `npx tsx server/scripts/assignAdminRoleSQL.ts admin@doapp.com owner`

| Rol | Permisos | Acceso Company Balance |
|-----|----------|----------------------|
| `owner` | Acceso total (`*`) | ✅ Sí |
| `super_admin` | Gestión completa | ❌ No |
| `admin` | Usuarios, contratos, disputas | ❌ No |
| `marketing` | Analytics, contenido | ❌ No |
| `support` | Tickets, disputas | ❌ No |
| `dpo` | GDPR, auditoría | ❌ No |

**Importante:** Después de asignar rol, el usuario debe cerrar sesión y volver a iniciar sesión para que el JWT se actualice.

## Modelos & Servicios Clave

**Modelos**: User (auth, roles, 2FA, ratings múltiples), Job, Contract (escrow, extensiones), Payment (MercadoPago), Dispute (adjuntos, resolución), Proposal, Review (3 categorías), Membership, Referral, Advertisement (3 modelos), Portfolio, ChatMessage, Notification, Ticket, BalanceTransaction, WithdrawalRequest

**Servicios**: mercadopago (escrow, webhooks), currencyExchange (USD↔ARS, caché 1h), cache (Redis), email (12+ templates), socket, fcm, membershipService, referralService, advertisementService, analytics, imageOptimization

**Middleware**: auth (JWT, roles), advancedRateLimit (Redis, 5-200 req), permissions (RBAC), security (Helmet, CORS), upload (50MB, images/videos/PDFs)

## Endpoints Principales

**Auth**: /register, /login, /logout, /profile
**Jobs**: CRUD + /search
**Contracts**: CRUD + /confirm, /dispute, /modify-price, /request-extension, /approve-extension
**Payments**: /create-order, /capture (MercadoPago escrow)
**Proposals**: CRUD + /approve, /reject, /withdraw
**Membership**: /pricing, /usage, /upgrade-to-pro, /cancel
**Referrals**: /stats, /my-invitations, /validate, /use-code
**Balance**: /, /transactions, /summary, /withdraw, /withdrawals
**Portfolio**: /user/:userId, CRUD, /like
**Disputes**: CRUD + /messages, /evidence (archivos)
**Advertisements**: CRUD + /pause, /resume, /impression, /click, /performance
**Chat**: /conversations, /messages
**Notifications**: /, /read, /subscribe (FCM)
**Webhooks**: /mercadopago, /mercadopago/subscription
**Admin**: /analytics, /users, /tickets, /disputes (assign, resolve), /advertisements (approve, reject), /withdrawals (approve, processing, complete, reject)

## Features ✅

Auth (JWT, OAuth, 2FA) | RBAC | Contratos (escrow, extensiones, confirmación bidireccional) | Pagos MercadoPago | Disputas (adjuntos, admin) | Membresía PRO (€5.99, 3 contratos/mes 2%, badge, stats) | Referidos (3 códigos, beneficios) | Balance & Retiros (CBU, workflow admin) | Chat real-time | Notificaciones (in-app, push, email) | Reviews (3 categorías) | Portfolio (videos, PDFs, contratos) | Publicidad (3 modelos, analytics) | Dashboard | i18n ES/EN | Security (sanitización, GDPR, audit) | Cache Redis | Rate limiting | Testing (Jest)

## Tips

**Reglas**:
1. EDITAR archivos existentes, NO crear nuevos
2. Imports con `.js` extension (ESM)
3. Invalidar cache al modificar datos: `cache.delPattern('jobs:*')`
4. Sanitizar inputs: `sanitizer.ts`
5. Types estrictos, evitar `any`

**Archivos clave**: models/{User,Contract,Dispute,Payment,Membership,Referral,Advertisement}.ts | services/{mercadopago,email,currencyExchange,cache}.ts | middleware/{auth,upload}.ts

**Docs**: DEVELOPER_GUIDE.md, SETUP_GUIDE.md, DEPLOYMENT.md, tests/README.md

## Sistemas Especiales

### Publicidad
3 modelos: Banner 3x1 ($50/día), Sidebar 1x2 ($35/día), Card 1x1 ($20/día) | Pricing: base × días × (1 + priority × 0.1) | Analytics: impressions, clicks, CTR, CPM, CPC | Aprobación admin | Cache Redis

### Pagos & Escrow (MercadoPago)
**Flujo**: Cliente paga → Fondos a escrow (held_escrow) → Ambas partes confirman → Liberar al doer | **Disputa**: Pausa pago → Admin resuelve (full_release/full_refund/partial_refund) | **Webhooks**: payment.approved, payment.rejected, payment.refunded, subscription.authorized | **Moneda**: USD↔ARS (2 APIs fallback, caché 1h, respaldo 1000 ARS/USD)

### Membresías
**FREE**: 3 contratos gratis (1000 usuarios), 5% comisión, 3 códigos invitación
**PRO** (€5.99/mes): 3 contratos/mes 2%, prioridad búsquedas, KYC, badge, stats, bonus (1 gratis al completar 3) | Cron mensual: resetea contadores, otorga bonus

### Referidos (1000 usuarios)
Referido: 1 contrato gratis | Referidor: 1er completo→2 gratis, 2do→1 gratis, 3er→3% permanente | Máx 3 referidos

### Disputas
Adjuntos (fotos/videos/PDFs) → Pago pausado → Admin resuelve → Logs auditoría (low/medium/high/critical)

### Balance & Retiros
Balance en ARS | Transacciones: refund, payment, bonus, adjustment, withdrawal | **Retiros**: Mín $1000 ARS, CBU (22 dígitos), workflow: pending→approved→processing→completed | Admin: aprobar, rechazar, completar con comprobante | Emails + push notifications

## Testing & Analytics

**Testing**: Jest + Supertest + MongoDB Memory | 80%+ cobertura | tests/{middleware,routes,services,integration} | `npm test / test:watch / test:coverage / test:disputes / test:email`

**Analytics**: Custom (NO Sentry) | disputeAnalytics.ts | Métricas: total, resueltas, tiempo resolución, health score (0-100) | Endpoints: /metrics, /performance, /health, /trends | Cache Redis 30-60min

---

## Changelog Resumido

**v2.8.0** (2025-10-22): Balance & Retiros (CBU, workflow admin, emails+push)
**v2.7.0** (2025-10-22): Saldo usuario + Modificación precios contratos
**v2.6.0** (2025-10-22): UI/UX PRO (badges, ratings múltiples, modal oferta)
**v2.5.0** (2025-10-21): Integración completa (extensiones, PRO dashboard, badges)
**v2.4.0** (2025-10-21): Frontend (extensiones, portfolio, invitaciones, PRO)
**v2.3.0** (2025-10-21): Backend (extensiones, portfolio, invitaciones, PRO, cron)
**v2.0.0+**: Ratings múltiples, validaciones ($5000 ARS), flujo contrato mejorado

**Features Clave**:
- Reviews 3 categorías (workQuality, worker, contract)
- Extensiones contrato (máx 1, opcional monto adicional)
- Portfolio (videos, PDFs, linkedContract)
- Códigos invitación (3 por usuario, beneficios progresivos)
- PRO: €5.99/mes, 3 contratos 2%, badge, stats, bonus
- Balance: modificar precio contrato, retiros CBU $1000+ ARS
- Cron mensual: reset PRO, bonus automático

**Version actual**: 2.8.0 - Production Ready Argentina ✅
