import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guardas de accesibilidad y de transparencia sobre datos personales.
 *
 * No reemplazan una auditoría con lector de pantalla: son las dos reglas que
 * ya se rompieron y que se pueden verificar leyendo el código.
 *
 * 1. Un campo que pide un dato personal sensible (teléfono, DNI, CBU) tiene que
 *    decir para qué se usa y si se publica, **visible sin tener que hacer clic**.
 *    Una promesa de privacidad detrás de un ícono no es una promesa.
 * 2. Ese texto tiene que decir las dos cosas: el uso y la no-publicación. Decir
 *    solo "lo usamos para contactarte" deja abierta la duda de si se muestra.
 */

const RAIZ = join(__dirname, '..', 'client');

function archivosTsx(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivosTsx(ruta, acc);
    else if (nombre.endsWith('.tsx')) acc.push(ruta);
  }
  return acc;
}

/** Un input de dato sensible: por tipo, por name o por autoComplete. */
const SENSIBLES = [
  { que: 'teléfono', re: /type=["']tel["']|name=["']phone["']/ },
  { que: 'DNI', re: /name=["']dni["']/ },
  { que: 'CBU', re: /name=["']cbu["']/ },
];

/**
 * Pantallas donde el dato se muestra pero no se pide (perfiles, paneles de
 * admin, detalle de contrato). La regla aplica a los formularios que lo piden.
 */
const SOLO_LECTURA = /pages[\\/]admin[\\/]|PaymentProof|Chargebacks/;

describe('campos que piden datos personales', () => {
  const archivos = archivosTsx(RAIZ);

  it('encuentra archivos para revisar', () => {
    expect(archivos.length).toBeGreaterThan(50);
  });

  for (const { que, re } of SENSIBLES) {
    it(`todo formulario que pide ${que} explica para qué se usa`, () => {
      const sinExplicacion = archivos.filter((ruta) => {
        if (SOLO_LECTURA.test(ruta)) return false;
        const src = readFileSync(ruta, 'utf8');
        if (!re.test(src)) return false;
        // Alcanza con que el archivo use FormField: el componente obliga a que
        // la nota quede visible y enlazada por aria-describedby.
        return !/FormField/.test(src);
      });

      if (sinExplicacion.length > 0) {
        throw new Error(
          `Estos formularios piden ${que} sin decir para qué se usa ni si se publica:\n` +
            sinExplicacion.map((f) => '  - ' + f.replace(RAIZ, 'client')).join('\n') +
            `\n\nEnvolvé el input en <FormField ... privado note="..."> ` +
            `(client/components/ui/FormField.tsx). La nota va visible, no detrás del ícono.`,
        );
      }
      expect(sinExplicacion).toEqual([]);
    });
  }
});

describe('qué dice la promesa de privacidad', () => {
  const login = readFileSync(join(RAIZ, 'pages', 'LoginScreen.tsx'), 'utf8');

  it('el teléfono dice para qué se usa y que no se muestra', () => {
    // Las dos mitades: el uso legítimo y la no-publicación. Una sola no alcanza.
    expect(login).toMatch(/contactarte si hay un problema/i);
    expect(login).toMatch(/No aparece en tu perfil/i);
    expect(login).toMatch(/no lo usamos para publicidad/i);
  });

  it('el DNI dice que nunca se muestra a otros usuarios', () => {
    expect(login).toMatch(/Nunca se muestra a otros usuarios/i);
  });

  it('el CBU aclara que tiene que estar a nombre del usuario', () => {
    expect(login).toMatch(/a tu nombre/i);
  });
});

describe('el componente de campo accesible', () => {
  const src = readFileSync(
    join(RAIZ, 'components', 'ui', 'FormField.tsx'),
    'utf8',
  );

  it('ata el error al input y lo anuncia', () => {
    // Sin esto el error se ve pero un lector de pantalla no lo dice nunca.
    expect(src).toMatch(/aria-invalid/);
    expect(src).toMatch(/role="alert"/);
    expect(src).toMatch(/aria-describedby/);
  });

  it('la ayuda es un botón con estado, no un title', () => {
    // Un title= no se abre con teclado ni existe en celular.
    expect(src).toMatch(/aria-expanded/);
    expect(src).toMatch(/aria-controls/);
    expect(src).toMatch(/type="button"/);
  });

  it('la ayuda queda en el DOM aunque esté colapsada', () => {
    // Si se desmontara, aria-describedby apuntaría a un id inexistente y el
    // lector de pantalla no leería la explicación al enfocar el campo.
    expect(src).toMatch(/hidden=\{!abierto\}/);
  });

  it('marca el campo obligatorio también para lectores de pantalla', () => {
    // El asterisco es decorativo: aria-hidden + texto real en sr-only.
    expect(src).toMatch(/aria-hidden="true">\*/);
    expect(src).toMatch(/sr-only/);
    expect(src).toMatch(/aria-required/);
  });
});
