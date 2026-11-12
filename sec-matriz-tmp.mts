/**
 * Matriz de acceso de TODA la API, contra la base de TEST y sin red hacia afuera.
 *
 * Monta los routers reales con la misma cadena de middleware que server/index.ts
 * (WAF, saneador, cabeceras...) y prueba cada endpoint como anónimo, como usuario
 * común y como owner. No simula nada del lado del servidor. Temporal: lo borro al
 * terminar. (Secretos: sólo se usan por proceso; nunca se imprimen.)
 */
import { config as cargarEnv } from 'dotenv';
cargarEnv({ path: '.env.test', override: true });
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-testing-only';

import net from 'net';
import http from 'http';
import https from 'https';
import { writeFileSync } from 'fs';

/* ---- Sin red hacia afuera: cualquier salida que no sea localhost se bloquea y se anota ---- */
const salidasBloqueadas = new Set<string>();
const esLocal = (h: unknown) => !h || /^(localhost|127\.0\.0\.1|::1|\[::1\])$/.test(String(h));
const origConnect = net.Socket.prototype.connect;
(net.Socket.prototype as any).connect = function (...args: any[]) {
  const o = args[0];
  const host = typeof o === 'object' && o !== null ? o.host : typeof args[1] === 'string' ? args[1] : undefined;
  if (!esLocal(host)) { salidasBloqueadas.add(String(host)); const e: any = new Error('SALIDA BLOQUEADA ' + host); e.code = 'ECONNREFUSED'; process.nextTick(() => this.destroy(e)); return this; }
  return (origConnect as any).apply(this, args);
};
const origFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (!esLocal(u.hostname)) { salidasBloqueadas.add(u.hostname); throw new Error('SALIDA BLOQUEADA ' + u.hostname); }
  return origFetch(input, init);
}) as any;
for (const m of [http, https] as any[]) {
  const o = m.request;
  m.request = function (...a: any[]) {
    const opt = a[0]; const host = typeof opt === 'string' ? new URL(opt).hostname : opt?.hostname || opt?.host;
    if (!esLocal(host)) { salidasBloqueadas.add(String(host)); throw new Error('SALIDA BLOQUEADA ' + host); }
    return o.apply(this, a);
  };
}

import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { initDatabase, sequelize } from './server/config/database.js';

const nombre = String((sequelize.config as any).database || '');
if (!/test/i.test(nombre)) throw new Error(`Apunta a "${nombre}", que no parece una base de tests. No sigo.`);
console.log('base:', nombre);
await initDatabase();

const { User } = await import('./server/models/sql/User.model.js');
const { wafMiddleware } = await import('./server/middleware/waf.js');
const sec = await import('./server/middleware/security.js');
const { errorHandler } = await import('./server/middleware/errorHandler.js');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(wafMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(sec.securityHeaders);
app.use(sec.xssProtection);
app.use(sec.preventDirectoryTraversal);

const MONTAJES: Array<[string, string]> = [
  ['/api/auth', 'auth'], ['/api/users', 'users'], ['/api/jobs', 'jobs'], ['/api/contracts', 'contracts'],
  ['/api/payments', 'payments'], ['/api/payment-orders', 'paymentOrders'], ['/api/matching', 'matching'],
  ['/api/negotiation', 'negotiation'], ['/api/search', 'search'], ['/api/webhooks', 'webhooks'],
  ['/api/contact', 'contact'], ['/api/contract-change-requests', 'contractChangeRequests'],
  ['/api/user-analytics', 'userAnalytics'], ['/api/tickets', 'tickets'], ['/api/reviews', 'reviews'],
  ['/api/chat', 'chat'], ['/api/notifications', 'notifications'], ['/api/portfolio', 'portfolio'],
  ['/api/disputes', 'disputes'], ['/api/proposals', 'proposals'], ['/api/quotes', 'quotes'],
  ['/api/referrals', 'referrals'], ['/api/membership', 'membership'], ['/api/advertisements', 'advertisements'],
  ['/api/profile-promotion', 'profilePromotion'], ['/api/blogs', 'blogs'], ['/api/balance', 'balance'],
  ['/api/posts', 'posts'], ['/api/promoter', 'promoter'], ['/api/config', 'config'], ['/api/profile', 'profile'],
  ['/api/calendar', 'calendar'],
  ['/api/admin/users', 'admin/users'], ['/api/admin/security', 'admin/security'], ['/api/admin/contracts', 'admin/contracts'],
  ['/api/admin/tickets', 'admin/tickets'], ['/api/admin/analytics', 'admin/analytics'], ['/api/admin/2fa', 'admin/twoFactor'],
  ['/api/admin/disputes', 'admin/disputes'], ['/api/admin/roles', 'admin/roles'], ['/api/admin/jobs', 'admin/jobs'],
  ['/api/admin/blacklist', 'admin/blacklist'], ['/api/admin/banned-identities', 'admin/bannedIdentities'],
  ['/api/admin/user-data', 'admin/userData'], ['/api/admin/padrones', 'admin/padrones'], ['/api/admin/platform', 'admin/platform'],
  ['/api/admin/content-agent', 'admin/contentAgent'], ['/api/admin/arca', 'admin/arca'],
  ['/api/admin/flagged-messages', 'admin/flaggedMessages'], ['/api/admin/advertisements', 'admin/advertisements'],
  ['/api/admin/contact', 'admin/contact'], ['/api/admin/blogs', 'admin/blogs'], ['/api/admin/withdrawals', 'admin/withdrawals'],
  ['/api/admin/payments', 'admin/payments'], ['/api/admin/audit-logs', 'admin/auditLogs'], ['/api/admin/search', 'admin/search'],
  ['/api/admin/company-balance', 'admin/companyBalance'], ['/api/admin/marketing', 'admin/marketing'],
  ['/api/admin/family-codes', 'admin/familyCodes'], ['/api/admin/business-plan', 'admin/businessPlan'],
  ['/api/admin/modules', 'admin/modules'], ['/api/admin/hubs', 'admin/hubs'], ['/api/admin/performance', 'admin/performance'],
  ['/api/admin/pending-payments', 'admin/pendingPayments'], ['/api/analytics/disputes', 'analytics/disputes'],
];

const routers: Array<{ prefijo: string; router: any }> = [];
const noMontados: string[] = [];
for (const [prefijo, archivo] of MONTAJES) {
  try {
    const mod = await import(`./server/routes/${archivo}.js`);
    app.use(prefijo, mod.default);
    routers.push({ prefijo, router: mod.default });
  } catch (e: any) {
    noMontados.push(`${prefijo} (${String(e?.message).split('\n')[0].slice(0, 90)})`);
  }
}
app.use(errorHandler);

/* ---- Endpoints registrados ---- */
interface Endpoint { metodo: string; ruta: string }
const endpoints: Endpoint[] = [];
for (const { prefijo, router } of routers) {
  for (const capa of router.stack || []) {
    if (!capa.route) continue;
    const rutas = Array.isArray(capa.route.path) ? capa.route.path : [capa.route.path];
    for (const r of rutas) {
      for (const metodo of Object.keys(capa.route.methods || {})) {
        if (capa.route.methods[metodo]) endpoints.push({ metodo, ruta: (prefijo + (r === '/' ? '' : r)).replace(/\/+$/, '') || prefijo });
      }
    }
  }
}
console.log(`endpoints encontrados: ${endpoints.length} en ${routers.length} routers; sin montar: ${noMontados.length}`);

/* ---- Identidades ---- */
const mk = async (clave: string, extra: Record<string, unknown> = {}) => {
  await User.destroy({ where: { email: `${clave}@sec.test` } });
  const u: any = await User.create({
    email: `${clave}@sec.test`, name: `Sec ${clave}`, username: `sec${clave}`, password: 'password123', role: 'client', ...extra,
  } as any);
  return { id: u.id as string, token: jwt.sign({ id: u.id, email: u.email }, process.env.JWT_SECRET!) };
};
const owner = await mk('owner', { adminRole: 'owner' });
const analista = await mk('analista', { adminRole: 'analista' });
const soporte = await mk('soporte', { adminRole: 'support' });
const userA = await mk('usera');
const userB = await mk('userb', { role: 'doer' });
const ids = { owner, analista, soporte, userA, userB };
writeFileSync(process.env.SEC_IDS_FILE || 'sec-ids-tmp.json', JSON.stringify(Object.fromEntries(Object.entries(ids).map(([k, v]) => [k, { id: v.id, token: v.token }]))));

const UUID = '00000000-0000-4000-8000-000000000001';
const rellenar = (ruta: string) => ruta.replace(/:([A-Za-z]+)/g, (_m, p) => (/id$/i.test(p) || p === 'code' ? UUID : 'x'));

const llamar = async (e: Endpoint, token?: string) => {
  const ruta = rellenar(e.ruta);
  let req: any = (request(app) as any)[e.metodo](ruta);
  if (token) req = req.set('Authorization', `Bearer ${token}`);
  if (['post', 'put', 'patch'].includes(e.metodo)) req = req.send({});
  try {
    const r = await req.timeout({ response: 8000, deadline: 12000 });
    return { s: r.status as number, c: (r.text || '').length, t: r.headers['content-type'] || '' };
  } catch (err: any) {
    return { s: -1, c: 0, t: String(err?.code || err?.message).slice(0, 40) };
  }
};

const filas: any[] = [];
const lote = 12;
for (let i = 0; i < endpoints.length; i += lote) {
  await Promise.all(endpoints.slice(i, i + lote).map(async (e) => {
    // secuencial por endpoint (anon → user → owner) para no mezclar efectos
    const anon = await llamar(e);
    const user = await llamar(e, userA.token);
    const own = await llamar(e, owner.token);
    filas.push({ ...e, anon: anon.s, user: user.s, owner: own.s, anonBytes: anon.c, userBytes: user.c });
  }));
}
filas.sort((a, b) => a.ruta.localeCompare(b.ruta) || a.metodo.localeCompare(b.metodo));
writeFileSync(process.env.SEC_MATRIZ_FILE || 'sec-matriz-tmp.json', JSON.stringify({ filas, noMontados, salidasBloqueadas: [...salidasBloqueadas] }, null, 1));
console.log('matriz escrita:', filas.length, 'filas | salidas bloqueadas:', [...salidasBloqueadas].join(', ') || 'ninguna');
await sequelize.close();
process.exit(0);
