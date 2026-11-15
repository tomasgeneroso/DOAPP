import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ofreceServicios, rolSegunOfrece, CUALQUIER_CUENTA_PUEDE_PUBLICAR, CUALQUIER_CUENTA_PUEDE_POSTULARSE } from '../shared/cuenta/capacidades';

/**
 * Una sola cuenta para todo (decisión del dueño, 2026-11-15): el tipo de cuenta ya no esconde pantallas ni da permisos. Solo queda como preferencia «ofrezco mis
 * servicios».
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8');

describe('capacidades de la cuenta', () => {
  it('«ofrece servicios» es doer o both (doer es el tipo viejo y se trata igual)', () => {
    expect(ofreceServicios('doer')).toBe(true);
    expect(ofreceServicios('both')).toBe(true);
    for (const r of ['client', 'user', '', null, undefined, 'admin']) expect(ofreceServicios(r as any)).toBe(false);
  });

  it('activar «ofrezco mis servicios» deja la cuenta en both; desactivarlo, en client (publicar nunca se apaga)', () => {
    expect(rolSegunOfrece(true)).toBe('both');
    expect(rolSegunOfrece(false)).toBe('client');
  });

  it('toda cuenta puede publicar y postularse', () => {
    expect(CUALQUIER_CUENTA_PUEDE_PUBLICAR).toBe(true);
    expect(CUALQUIER_CUENTA_PUEDE_POSTULARSE).toBe(true);
  });
});

describe('las pantallas no esconden cosas según el tipo de cuenta', () => {
  it('«Mis trabajos» muestra las dos pestañas a todos', () => {
    const f = leer('client/pages/MyJobsScreen.tsx');
    expect(f).not.toMatch(/isClientOnly|isWorkerOnly/);
  });

  it('el interruptor del perfil es uno solo («ofrezco mis servicios»), sin «modo cliente»', () => {
    const f = leer('client/components/profile/WorkerModeToggle.tsx');
    expect(f).toMatch(/role="switch"/);
    expect(f).not.toMatch(/Modo cliente|clientMode/);
  });

  it('el perfil público solo dice si ofrece servicios (no «modo cliente»)', () => {
    const f = leer('client/pages/ProfilePage.tsx');
    expect(f).toMatch(/insignia-ofrece-servicios/);
    expect(f).not.toMatch(/profile\.clientMode/);
  });

  it('cotizar después de postularse no depende del tipo de cuenta', () => {
    const f = leer('client/pages/JobDetail.tsx');
    expect(f).not.toMatch(/user\?\.role === 'doer' \|\| user\?\.role === 'both'/);
  });
});
