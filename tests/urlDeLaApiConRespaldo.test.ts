import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

/**
 * Ningún enlace ni pedido del cliente puede armarse con `VITE_API_URL` pelada.
 *
 * Qué motivó esto: el botón «Ingresar con Google» de producción apuntaba a
 * `https://doapparg.com/undefined/auth/google`. La variable no estaba definida cuando el servidor
 * compiló el cliente, y `${import.meta.env.VITE_API_URL}/auth/google` con la variable vacía da el
 * texto «undefined». Desde un celular la persona tocaba el botón, caía en una página que no existe
 * y se quedaba mirando una pantalla azul sin poder entrar.
 *
 * La misma línea estaba en la página de retorno del pago: confirmaba el cobro contra
 * `/undefined/payments/capture-order`, que no existe, y por eso esa confirmación nunca corría.
 *
 * El resto del cliente ya hacía lo correcto (`import.meta.env.VITE_API_URL || "/api"`). Este test
 * hace que ya no sea una cuestión de acordarse.
 */

// `process.cwd()` y no `__dirname`: el proyecto corre estos tests como módulos ES, donde no existe.
const RAIZ = process.cwd();

function archivos(dir: string): string[] {
  const salida: string[] = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const completo = join(dir, e.name);
    if (e.isDirectory()) salida.push(...archivos(completo));
    else if (/\.(ts|tsx)$/.test(e.name)) salida.push(completo);
  }
  return salida;
}

const sinComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('VITE_API_URL en el cliente', () => {
  const del_cliente = archivos(join(RAIZ, 'client'));

  it('encuentra el código del cliente (el test no puede pasar mirando una carpeta vacía)', () => {
    expect(del_cliente.length).toBeGreaterThan(100);
  });

  it('nunca se interpola ni se concatena sin un valor de respaldo', () => {
    const pelada = /\$\{\s*import\.meta\.env\.VITE_API_URL\s*\}|import\.meta\.env\.VITE_API_URL\s*\+/;
    const infractores = del_cliente
      .filter((f) => pelada.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(RAIZ.length + 1).replace(/\\/g, '/'));
    expect(infractores).toEqual([]);
  });

  it('el respaldo nunca es una dirección de desarrollo (localhost:NNNN)', () => {
    // `VITE_API_URL || 'http://localhost:5000'` en producción manda el pedido a la máquina de quien navega:
    // crear una disputa desde la web no llegaba nunca, y el tiempo real figuraba «sin conexión».
    const dev = /import\.meta\.env\.VITE_[A-Z_]+\s*(\|\||\?\?)\s*['"`]https?:\/\/localhost/;
    const infractores = del_cliente
      .filter((f) => dev.test(sinComentarios(readFileSync(f, 'utf8'))))
      .map((f) => f.slice(RAIZ.length + 1).replace(/\\/g, '/'));
    expect(infractores).toEqual([]);
  });
});

describe('los botones de ingreso social', () => {
  const login = sinComentarios(readFileSync(join(RAIZ, 'client/pages/LoginScreen.tsx'), 'utf8'));
  const rutasDelServidor = readFileSync(join(RAIZ, 'server/routes/auth.ts'), 'utf8');

  it('hay al menos el de Google (si se llega a vaciar, el test no está mirando lo que cree)', () => {
    expect(login).toMatch(/\/auth\/google/);
  });

  it('cada proveedor que el login ofrece tiene su ruta en el servidor', () => {
    // Un botón que lleva a una ruta que no existe no falla con un mensaje: deja a la persona en una
    // página vacía. Los desactivados van dentro de un comentario, que acá no se cuenta.
    // Solo los enlaces (`href`): el login también llama a /auth/check, /auth/resend, etc., que son pedidos y no botones.
    const proveedores = [...login.matchAll(/href=\{`[^`]*\/auth\/([a-z]+)`\}/g)].map((m) => m[1]);
    const sinRuta = [...new Set(proveedores)].filter((p) => !new RegExp(`router\\.get\\(\\s*["']/${p}["']`).test(rutasDelServidor));
    expect(sinRuta).toEqual([]);
  });
});
