import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Chat de la app (regla del dueño, 2026-11-12): mientras se escribe, el teclado y el campo quedan fijos; para recorrer los mensajes
 * hay que bajar el teclado primero. Es una prueba de código (la pantalla necesita un dispositivo): cuida que la lista se congele con el
 * teclado abierto, que deslizar no lo cierre solo y que el estado siga los eventos reales del teclado.
 */
const fuente = readFileSync(join(__dirname, '..', 'app', 'chat', '[id].tsx'), 'utf8').replace(/\r\n/g, '\n');

describe('chat: teclado abierto = lista quieta', () => {
  it('la lista de mensajes no se desplaza mientras el teclado está abierto', () => {
    expect(fuente).toContain('scrollEnabled={!tecladoAbierto}');
  });

  it('deslizar la lista no cierra el teclado (hay que bajarlo a propósito) y tocar un mensaje tampoco', () => {
    expect(fuente).toContain('keyboardDismissMode="none"');
    expect(fuente).toContain('keyboardShouldPersistTaps="handled"');
  });

  it('el estado sigue los eventos del teclado y los quita al salir de la pantalla', () => {
    expect(fuente).toContain("'keyboardWillShow' : 'keyboardDidShow'");
    expect(fuente).toContain("'keyboardWillHide' : 'keyboardDidHide'");
    expect(fuente).toMatch(/Keyboard\.addListener\(alAbrir, \(\) => setTecladoAbierto\(true\)\)/);
    expect(fuente).toMatch(/Keyboard\.addListener\(alCerrar, \(\) => setTecladoAbierto\(false\)\)/);
    expect(fuente).toMatch(/a\.remove\(\);\s*b\.remove\(\);/);
  });
});
