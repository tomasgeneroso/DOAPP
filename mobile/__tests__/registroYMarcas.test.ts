import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Registro e ingreso de la app (pedidos del dueño, 2026-11-17): los términos son UNA frase con enlaces adentro (no cajas sueltas), el error se ve al lado del botón,
 * los logos son los reales (DOAPP, Google, X) y un «Failed to fetch» crudo nunca llega a la pantalla.
 */
const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8').replace(/\r\n/g, '\n');

describe('registro e ingreso de la app', () => {
  const registro = leer('app/(auth)/register.tsx');
  const ingreso = leer('app/(auth)/login.tsx');

  it('los términos son una sola frase: los enlaces van dentro del mismo texto', () => {
    const bloque = registro.slice(registro.indexOf('styles.termsContainer'), registro.indexOf('styles.button,'));
    expect(bloque).toMatch(/<Text style=\{styles\.termsLink\}[^>]*onPress=\{\(\) => router\.push\('\/legal\/terms'/);
    expect(bloque).toMatch(/<Text style=\{styles\.termsLink\}[^>]*onPress=\{\(\) => router\.push\('\/legal\/privacy'/);
    // ningún enlace es una caja propia al lado de la casilla
    expect(bloque).not.toMatch(/<TouchableOpacity[^>]*onPress=\{\(\) => router\.push\('\/legal/);
  });

  it('el error se muestra justo arriba del botón (no escondido arriba de la pantalla)', () => {
    for (const fuente of [registro, ingreso]) {
      const iError = fuente.indexOf('<Text style={styles.errorText}>{error}</Text>');
      const iBoton = fuente.indexOf('style={[styles.button,');
      expect(iError).toBeGreaterThan(-1);
      expect(iError).toBeLessThan(iBoton);
      // y no queda una copia arriba de las pestañas
      expect(fuente.split('styles.errorText}>{error}').length - 1).toBe(1);
      expect(iBoton - iError).toBeLessThan(600);
    }
  });

  it('la aclaración de «¿Cómo vas a usar DOAPP?» dice que solo personaliza el muro', () => {
    expect(leer('components/SelectorDeTipoDeCuenta.tsx')).toContain('Solo sirve para personalizar tu muro');
    expect(readFileSync(join(RAIZ, '../client/components/perfil/SelectorDeTipoDeCuenta.tsx'), 'utf8')).toContain('Solo sirve para personalizar tu muro');
  });
});

describe('logos de la app', () => {
  it('el logo de DOAPP, el de Google y el de X son dibujos reales, no texto', () => {
    const marcas = leer('components/ui/IconosDeMarca.tsx');
    expect(marcas).toContain('export function LogoDoApp');
    expect(marcas).toContain('export function IconoGoogle');
    expect(marcas).toContain('export function IconoX');
    expect(leer('components/ui/Logo.tsx')).toContain('<LogoDoApp');
    const sociales = leer('components/BotonesSociales.tsx');
    expect(sociales).toContain('<IconoGoogle');
    expect(sociales).toContain('<IconoX');
  });
});

describe('error de red', () => {
  it('«Failed to fetch» y parientes se cambian por un mensaje claro en la app', () => {
    const api = leer('services/api.ts');
    expect(api).toContain('export function mensajeDeRed');
    // se usa tanto en las consultas como en las subidas de archivos
    expect(api.split('mensajeDeRed(error)').length - 1).toBeGreaterThanOrEqual(2);
    // la misma función, aislada, con los mensajes que dan los navegadores y el celular
    const reconoce = /failed to fetch|network request failed|load failed|networkerror|network error/i;
    for (const crudo of ['Failed to fetch', 'Network request failed', 'Load failed', 'NetworkError when attempting to fetch resource.']) {
      expect(reconoce.test(crudo)).toBe(true);
    }
    expect(api).toContain(String(reconoce));
  });
});
