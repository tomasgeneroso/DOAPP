import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { tablasQueFaltan } from '../server/config/ensureSchema.js';

/**
 * Todas las tablas existen (regla del dueño, 2026-11-11: «asegurarse que existan todas las tablas»).
 *
 * Producción no sincroniza los modelos: vive de migraciones. Un modelo agregado sin su migración anda en desarrollo (`sync()` crea la tabla) y rompe en producción con
 * `relation "portfolio_items" does not exist` (2026-11-09: «compartir el trabajo terminado en mi perfil» no funcionaba, y nadie lo vio porque en desarrollo andaba).
 *
 * Dos defensas: al arrancar, `crearTablasQueFaltan` crea desde los modelos las tablas que faltan (nunca toca una existente), y ESTA prueba falla si se agrega un modelo cuya
 * tabla no la crea ninguna migración ni `ensureSchema.ts`, para que se escriba la migración (que es lo correcto: deja las columnas y los índices bajo control).
 */

const raiz = process.cwd();
const modelos = readdirSync(join(raiz, 'server/models/sql')).filter((f) => f.endsWith('.model.ts'));
const migraciones = readdirSync(join(raiz, 'migrations'))
  .filter((f) => f.endsWith('.cjs'))
  .map((f) => readFileSync(join(raiz, 'migrations', f), 'utf8'))
  .join('\n');
const ensure = readFileSync(join(raiz, 'server/config/ensureSchema.ts'), 'utf8');

/**
 * Las tablas BASE: se crearon con el `sequelize.sync()` original, cuando el proyecto arrancó, y existen en producción desde entonces. Esta lista está CONGELADA: un modelo nuevo
 * no se agrega acá, se le escribe su migración (ver `migrations/20261109140000-portfolio-items.cjs`).
 */
const TABLAS_BASE = new Set([
  'advertisements', 'audit_logs', 'balance_transactions', 'chat_messages', 'consent_logs', 'contact_messages', 'contracts', 'contract_negotiations', 'conversations',
  'data_access_logs', 'disputes', 'jobs', 'login_devices', 'matching_codes', 'memberships', 'notifications', 'password_reset_tokens', 'payments', 'payment_proofs',
  'proposals', 'referrals', 'refresh_tokens', 'reviews', 'roles', 'tickets', 'users', 'withdrawal_requests',
]);

const pluralizar = (nombre: string) => {
  const snake = nombre.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  if (/(s|x|ch|sh)$/.test(snake)) return `${snake}es`;
  if (/[^aeiou]y$/.test(snake)) return `${snake.slice(0, -1)}ies`;
  return `${snake}s`;
};

const tablaDe = (archivo: string) => {
  const src = readFileSync(join(raiz, 'server/models/sql', archivo), 'utf8');
  return src.match(/tableName:\s*['"]([a-z0-9_]+)['"]/)?.[1] ?? pluralizar(archivo.replace('.model.ts', ''));
};

const laCreaAlgo = (tabla: string) => new RegExp(`CREATE TABLE(?: IF NOT EXISTS)?\\s+"?${tabla}"?\\b|createTable\\(\\s*['"]${tabla}['"]`, 'i').test(`${migraciones}\n${ensure}`);

describe('cada modelo tiene su tabla garantizada en producción', () => {
  it('hay modelos para revisar', () => {
    expect(modelos.length).toBeGreaterThan(40);
  });

  it.each(modelos.map((m) => [m, tablaDe(m)]))('%s → %s: la crea una migración o ensureSchema, o es una tabla base', (_archivo, tabla) => {
    expect({ tabla, garantizada: TABLAS_BASE.has(tabla as string) || laCreaAlgo(tabla as string) }).toEqual({ tabla, garantizada: true });
  });

  it('la lista de tablas base no tiene entradas de más (si una ya tiene migración, sobra)', () => {
    const delCodigo = new Set(modelos.map(tablaDe));
    const sobran = [...TABLAS_BASE].filter((t) => !delCodigo.has(t));
    expect(sobran).toEqual([]);
  });
});

describe('tablasQueFaltan (la parte pura de la creación al arrancar)', () => {
  it('devuelve las de los modelos que no están en la base, sin repetir y en orden', () => {
    expect(tablasQueFaltan(['users', 'portfolio_items', 'jobs', 'portfolio_items', 'refund_requests'], new Set(['users', 'jobs']))).toEqual(['portfolio_items', 'refund_requests']);
  });

  it('si no falta ninguna, no devuelve nada', () => {
    expect(tablasQueFaltan(['users', 'jobs'], new Set(['users', 'jobs', 'otra']))).toEqual([]);
  });
});
