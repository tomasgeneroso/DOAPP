import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { CAMBIOS_DE_POLITICAS, cambioVigente } from '../shared/legal/cambiosDePoliticas';
import { OCASIONES, esClaveQueSePuedeMarcar, textoDeOferta, textoDelResumen } from '../shared/momentos/momentos';
import { esRubroValido } from '../shared/perfiles/zonaDeTrabajo';

/** Momentos importantes y cambios de políticas: reglas puras y que lo corregido no vuelva. */
describe('momentos (sin base)', () => {
  const leer = (r: string) => readFileSync(join(process.cwd(), r), 'utf8');
  const archivos = (dir: string): string[] =>
    readdirSync(join(process.cwd(), dir)).flatMap((n) => {
      const r = `${dir}/${n}`;
      return statSync(join(process.cwd(), r)).isDirectory() ? archivos(r) : /\.tsx?$/.test(n) ? [r] : [];
    });

  it('los cambios de políticas van numerados de uno en uno y cada uno dice qué cambió y dónde leerlo', () => {
    expect(CAMBIOS_DE_POLITICAS.map((c) => c.version)).toEqual(CAMBIOS_DE_POLITICAS.map((_, i) => i + 1));
    for (const c of CAMBIOS_DE_POLITICAS) {
      expect(c.puntos.length).toBeGreaterThan(0);
      expect(leer('client/App.tsx')).toContain(`path="${c.enlace}"`);
    }
    expect(cambioVigente()).toBe(CAMBIOS_DE_POLITICAS[CAMBIOS_DE_POLITICAS.length - 1]);
  });

  it('cada trabajo de una ocasión usa un rubro que existe', () => {
    for (const o of OCASIONES) for (const t of o.trabajos) expect([t.titulo, esRubroValido(t.categoria)]).toEqual([t.titulo, true]);
  });

  it('solo se pueden marcar como vistas las claves conocidas', () => {
    for (const c of ['primer_cobro', 'bienvenida', 'politicas:1', 'politicas:12']) expect(esClaveQueSePuedeMarcar(c)).toBe(true);
    for (const c of ['politicas:0', 'politicas:', 'sin_postulaciones:abc', 'x', 3, null]) expect(esClaveQueSePuedeMarcar(c)).toBe(false);
  });

  it('con pocas personas no se dice cuántas; el resumen compartible no nombra a nadie ni montos', () => {
    expect(textoDeOferta(2, 'Pintura')).not.toMatch(/\d/);
    expect(textoDeOferta(3, 'Pintura')).toContain('3 personas ofrecen pintura');
    const t = textoDelResumen({ desde: '', hasta: '', trabajosTerminados: 1, rubros: [{ rubro: 'Pintura', cantidad: 1 }], resenas: 0, calificacionMedia: null });
    expect(t).toBe('En el último año terminé 1 trabajo con DOAPP. Sobre todo: pintura.');
  });

  it('ningún enlace de la web apunta a «/user/…», que no existe: el perfil público es «/profile/…»', () => {
    const rotos = archivos('client').filter((f) => /(to=\{`|origin\}|href=\{`|navigate\(`)\/user\/\$\{/.test(leer(f)));
    expect(rotos).toEqual([]);
  });

  it('los carteles esperan a que termine la visita guiada, y el permiso de notificaciones no se pide al ingresar', () => {
    expect(leer('client/components/momentos/MomentosGlobales.tsx')).toContain('if (!habilitado || hayVisitaGuiada) return null;');
    const auth = leer('client/hooks/useAuth.tsx');
    expect(auth).not.toContain('30000');
    expect(auth).toContain('EVENTO_PARA_PEDIR_AVISOS');
  });

  it('el antes y después y el cartel de la app están enganchados', () => {
    expect(leer('client/pages/ContractDetail.tsx')).toContain("contract.status === 'completed' && <AntesYDespues");
    expect(leer('mobile/app/_layout.tsx')).toContain('<AvisoDePoliticas');
  });

  it('la función que mandaba el nombre a un servicio de avatares ya no existe', () => {
    expect(leer('client/utils/imageUrl.ts')).not.toMatch(/getAvatarUrl|initials\/svg/);
  });
});
