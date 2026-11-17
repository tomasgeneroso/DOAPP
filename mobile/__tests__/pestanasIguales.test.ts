import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * La app del celular respeta la congruencia de diseño (pedido del dueño, 2026-11-17): todas las pestañas y filtros de una pantalla son el mismo componente
 * (`components/ui/Pestanas`), igual que en la web. Esta prueba falla si alguien vuelve a armar una barra de pestañas a mano.
 */
const RAIZ = join(__dirname, '..');

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) salida.push(...archivos(ruta));
    else if (ruta.endsWith('.tsx')) salida.push(ruta);
  }
  return salida;
}
const pantallas = [...archivos(join(RAIZ, 'app')), ...archivos(join(RAIZ, 'components'))];
const leer = (f: string) => readFileSync(f, 'utf8');
const esDelComponente = (f: string) => f.split('\\').join('/').endsWith('components/ui/Pestanas.tsx');

describe('pestañas de la app', () => {
  it('nadie arma las suyas: el rol «tab» solo está en components/ui/Pestanas', () => {
    const propios = pantallas.filter((f) => !esDelComponente(f) && /accessibilityRole="(tab|tablist)"/.test(leer(f)));
    expect(propios).toEqual([]);
  });

  it('no quedan estilos de barras de pestañas viejas (tabsContainer, tabActive, tabButton, filterChip…)', () => {
    const viejos = pantallas.filter((f) => !esDelComponente(f) && /\b(tabsContainer|tabActive|tabButton|tabScroll|filterChip|filterTab)\s*:/.test(leer(f)));
    expect(viejos).toEqual([]);
  });

  it('las pantallas con pestañas usan el componente', () => {
    for (const ruta of ['app/balance.tsx', 'app/contracts/index.tsx', 'app/help.tsx', 'app/my-jobs.tsx', 'app/payments.tsx', 'app/settings.tsx', 'app/(tabs)/index.tsx', 'app/(tabs)/search.tsx', 'app/(auth)/login.tsx', 'app/(auth)/register.tsx']) {
      expect(leer(join(RAIZ, ruta))).toContain('components/ui/Pestanas');
    }
  });

  it('el celeste de la pestaña elegida es el de siempre (no violeta, verde ni naranja)', () => {
    const f = leer(join(RAIZ, 'components/ui/Pestanas.tsx'));
    expect(f).toContain('colors.primary[100]');
    expect(f).not.toMatch(/premium|secondary\[|success\[/);
  });

  it('el buscador de la portada y el de búsqueda dicen lo mismo («Trabajos» y «Perfiles»), como en la web', () => {
    expect(leer(join(RAIZ, 'app/(tabs)/search.tsx'))).toContain("texto: 'Perfiles'");
    expect(leer(join(RAIZ, 'app/(tabs)/index.tsx'))).toContain("texto: 'Perfiles'");
  });
});
