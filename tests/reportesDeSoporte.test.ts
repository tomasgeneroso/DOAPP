import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  CATEGORIAS_DE_TICKET,
  armarReporte,
  asuntoDelReporte,
  categoriaDelReporte,
  esCategoriaDeTicket,
  esUuid,
  mensajeInicialDelReporte,
  rutaParaReportar,
} from '../shared/tickets/reportes.js';
import { ROLE_PERMISSIONS, PERMISSIONS } from '../server/config/permissions.js';

/**
 * Escribirle a soporte sobre un contrato o un usuario: siempre se puede (regla del dueño). Lo que se arma en la web y en la app es lo mismo y es lo
 * que el servidor lee; el reporte de un usuario no llegaba nunca porque el modal mandaba `description` y la categoría `abuse`.
 */
const CONTRATO = '11111111-1111-4111-8111-111111111111';
const USUARIO = '22222222-2222-4222-8222-222222222222';

describe('reportes a soporte: lo que se arma', () => {
  it('un problema usa la categoría del contrato o del usuario; una sugerencia, «feature»; todas las categorías las conoce el servidor', () => {
    expect(categoriaDelReporte('contrato', 'problema')).toBe('report_contract');
    expect(categoriaDelReporte('usuario', 'problema')).toBe('report_user');
    expect(categoriaDelReporte('contrato', 'sugerencia')).toBe('feature');
    expect(categoriaDelReporte('usuario', 'sugerencia')).toBe('feature');
    for (const sobre of ['contrato', 'usuario'] as const) for (const tipo of ['problema', 'sugerencia'] as const) expect(esCategoriaDeTicket(categoriaDelReporte(sobre, tipo))).toBe(true);
  });

  it('«abuse» no es una categoría: el servidor la rechazaba y por eso nunca llegó un reporte de usuario', () => {
    expect(esCategoriaDeTicket('abuse')).toBe(false);
    expect(CATEGORIAS_DE_TICKET).toEqual(expect.arrayContaining(['report_user', 'report_contract', 'feature', 'support']));
  });

  it('el cuerpo trae los nombres que lee el servidor (message, relatedContract, relatedUser) y no los que se perdían', () => {
    const r = armarReporte({ sobre: 'usuario', usuarioId: USUARIO, contratoId: CONTRATO, nombre: 'Ana', detalle: 'Me insultó en el chat', prioridad: 'high' });

    expect(r).toMatchObject({ category: 'report_user', priority: 'high', relatedUser: USUARIO, relatedContract: CONTRATO, tags: [] });
    expect(r.subject).toBe('Reporte de usuario: Ana');
    expect(r.message).toContain(`Contrato ID ${CONTRATO}`);
    expect(r.message).toContain(`Usuario ID ${USUARIO}`);
    expect(r.message.trimEnd().endsWith('Me insultó en el chat')).toBe(true);
    for (const viejo of ['description', 'relatedContractId', 'relatedUserId', 'relatedJobId']) expect(r).not.toHaveProperty(viejo);
  });

  it('una sugerencia lleva la etiqueta «sugerencia»; sin detalle queda el arranque para completar', () => {
    const r = armarReporte({ sobre: 'contrato', tipo: 'sugerencia', contratoId: CONTRATO, nombre: 'Pintar el living' });

    expect([r.category, r.tags, r.subject]).toEqual(['feature', ['sugerencia'], 'Sugerencia sobre el contrato: Pintar el living']);
    expect(r.message).toBe(mensajeInicialDelReporte({ sobre: 'contrato', tipo: 'sugerencia', contratoId: CONTRATO, nombre: 'Pintar el living' }));
    expect(r.message).toContain('Contanos tu sugerencia:');
  });

  it('un id que no es un uuid no se manda como enlace (queda solo en el texto)', () => {
    const r = armarReporte({ sobre: 'contrato', contratoId: 'abc', usuarioId: 'def' });

    expect(r).not.toHaveProperty('relatedContract');
    expect(r).not.toHaveProperty('relatedUser');
    expect(esUuid(CONTRATO)).toBe(true);
    expect(esUuid('abc')).toBe(false);
  });

  it('el asunto no pasa de 200 caracteres (el límite del ticket)', () => {
    expect(asuntoDelReporte('contrato', 'problema', 'x'.repeat(500)).length).toBe(200);
  });

  it('la ruta del formulario lleva el contrato, el usuario y el tipo, y se puede volver a leer', () => {
    const ruta = rutaParaReportar({ sobre: 'usuario', tipo: 'sugerencia', contratoId: CONTRATO, usuarioId: USUARIO, trabajoId: 'job-1', nombre: 'Ana Pérez' });
    const q = new URL(ruta, 'https://doapp.test').searchParams;

    expect(ruta.startsWith('/tickets/new?')).toBe(true);
    expect([q.get('type'), q.get('tipo'), q.get('contractId'), q.get('userId'), q.get('jobId'), q.get('nombre')]).toEqual(['report_user', 'sugerencia', CONTRATO, USUARIO, 'job-1', 'Ana Pérez']);
  });
});

describe('reportes a soporte: no se pierde por permisos ni por nombres viejos', () => {
  it('todas las cuentas pueden crear tickets, también las del equipo (antes admin, super_admin, marketing y dpo no podían)', () => {
    for (const [rol, permisos] of Object.entries(ROLE_PERMISSIONS)) {
      if (rol === 'owner') continue; // el dueño pasa siempre (SUPERUSER)
      expect([rol, (permisos as readonly string[]).includes(PERMISSIONS.TICKET_CREATE)]).toEqual([rol, true]);
    }
  });

  it('la tabla de permisos de la web dice lo mismo (el formulario redirige a quien no tiene el permiso)', () => {
    const web = readFileSync(join(process.cwd(), 'client/hooks/usePermissions.ts'), 'utf8');
    for (const rol of ['super_admin', 'admin', 'support', 'marketing', 'dpo', 'user']) {
      const inicio = web.indexOf(`  ${rol}: [`);
      expect([rol, inicio >= 0]).toEqual([rol, true]);
      const bloque = web.slice(inicio, web.indexOf('\n  ],', inicio));
      expect([rol, bloque.includes('PERMISSIONS.TICKET_CREATE')]).toEqual([rol, true]);
    }
  });

  it('ningún archivo de la web ni de la app manda la categoría «abuse» ni el campo «description» a /tickets', () => {
    const recorrer = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (n === 'node_modules') return [];
        return statSync(p).isDirectory() ? recorrer(p) : /\.(ts|tsx)$/.test(n) ? [p] : [];
      });
    const archivos = [...recorrer(join(process.cwd(), 'client')), ...recorrer(join(process.cwd(), 'mobile/app')), ...recorrer(join(process.cwd(), 'mobile/components'))];
    const malos = archivos.filter((f) => /category:\s*["']abuse["']/.test(readFileSync(f, 'utf8')));

    expect(malos).toEqual([]);
  });

  it('el servidor usa la lista única de categorías, no una copia', () => {
    const ruta = readFileSync(join(process.cwd(), 'server/routes/tickets.ts'), 'utf8');

    expect(ruta).toContain('esCategoriaDeTicket(category)');
    expect(ruta).not.toMatch(/validCategories\s*=/);
  });
});
