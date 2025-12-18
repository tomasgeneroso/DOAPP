# DOAPP - Plataforma Freelance Argentina

## Stack
**Backend**: Express 5 + PostgreSQL (Sequelize) + Socket.io + Redis + MercadoPago
**Frontend**: React 18 + Vite + TailwindCSS + React Router 6

## Commands
```bash
npm run dev:all          # Full stack
npm run dev:server       # Backend only
npm test                 # Jest tests
npx sequelize-cli db:migrate
```

## Config Argentina
- Comisiones: 8% estándar, 3% PRO, 2% SUPER PRO | Mínimo $1000 ARS
- Membresías: PRO €5.99/mes, SUPER PRO €8.99/mes
- Retiros: CBU 22 dígitos, mín $1000 ARS
- Moneda: ARS ↔ USD (2 APIs fallback, caché 1h)

## Coding Rules
1. EDITAR archivos existentes, NO crear nuevos
2. Imports con `.js` extension (ESM)
3. Invalidar cache: `cacheService.delPattern('jobs:*')`
4. Sanitizar inputs: `server/utils/sanitizer.ts`
5. Types estrictos, evitar `any`

## Key Files
| Área | Ubicación |
|------|-----------|
| Models | `server/models/sql/*.model.ts` |
| Routes | `server/routes/*.ts` |
| Services | `server/services/*.ts` |
| Pages | `client/pages/*.tsx` |
| Types | `client/types/index.ts` |
| Migrations | `migrations/*.cjs` |

## Status Flows

**Job**: draft → pending_payment → pending_approval → open → in_progress → completed

**Contract**: pending → ready → accepted → in_progress → awaiting_confirmation → completed

## Admin Roles
| Rol | Permisos |
|-----|----------|
| `owner` | Acceso total |
| `super_admin` | Gestión completa |
| `admin` | Usuarios, contratos, disputas |
| `support` | Tickets, disputas |

Asignar: `npx tsx server/scripts/assignAdminRoleSQL.ts email@example.com owner`

## Detailed Documentation

Ver `.claude/rules/` para documentación contextual (se carga automáticamente):

```
.claude/rules/
├── general.md              # Stack, comandos, config
├── testing.md              # Patrones de tests
├── backend/
│   ├── models.md          # Modelos Sequelize
│   ├── api.md             # Endpoints API
│   └── services.md        # Servicios y middleware
├── frontend/
│   ├── pages.md           # Páginas React
│   └── types.md           # TypeScript interfaces
├── reference/
│   ├── business-rules.md  # Reglas de negocio
│   └── database.md        # PostgreSQL/migraciones
└── sop/                    # Procedimientos
    ├── adding-migration.md
    ├── adding-api-endpoint.md
    └── adding-frontend-feature.md
```
