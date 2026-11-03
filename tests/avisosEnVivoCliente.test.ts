import { describe, it, expect } from '@jest/globals';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guarda: ninguna pantalla puede pisar los avisos en vivo de otra.
 *
 * Antes cada aviso del servidor tenía UN solo lugar donde engancharse (`eventHandlers.onX = handler`): la última pantalla en anotarse pisaba a las demás. La
 * pantalla de un trabajo y sus tareas se quitaban el aviso entre sí, y la lista de notificaciones dejaba sin aviso a la campanita. Además, las pantallas «se
 * desanotaban» anotando una función vacía, lo que con varios oyentes dejaría el viejo vivo para siempre.
 *
 * Ahora cada aviso tiene varios oyentes y quien se anota recibe de vuelta cómo darse de baja. Esta prueba mira el código de la web:
 * - el almacén de un solo lugar no vuelve;
 * - nadie se «desanota» con una función vacía;
 * - toda llamada `register…Handler(` devuelve su baja (se retorna, se guarda o va en una lista), no queda suelta.
 */
// `process.cwd()` y no `__dirname`: el proyecto corre estos tests como módulos ES, donde no existe.
const RAIZ = join(process.cwd(), 'client');

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((nombre) => {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) return archivos(ruta);
    return /\.(tsx?|jsx?)$/.test(nombre) ? [ruta] : [];
  });
}

const FUENTES = archivos(RAIZ).map((ruta) => ({ ruta: ruta.slice(RAIZ.length + 1).replace(/\\/g, '/'), texto: readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n') }));

describe('avisos en vivo de la web: varios oyentes por aviso, cada uno con su baja', () => {
  it('el almacén de UN solo lugar por aviso no volvió', () => {
    const hook = FUENTES.find((f) => f.ruta === 'hooks/useSocket.tsx')!;
    // La explicación del cambio nombra el patrón viejo en un comentario; lo que no puede haber es código que lo use.
    const sinComentarios = hook.texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(sinComentarios).not.toMatch(/eventHandlers\s*[.[]/);
  });

  it('nadie se «desanota» anotando una función vacía (con varios oyentes dejaría el viejo vivo)', () => {
    const culpables = FUENTES.filter((f) => /register[A-Za-z]+Handler\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(f.texto)).map((f) => f.ruta);
    expect(culpables).toEqual([]);
  });

  it('toda llamada a register…Handler( devuelve su baja: se retorna, se guarda o va en una lista', () => {
    const sueltas: string[] = [];
    for (const { ruta, texto } of FUENTES) {
      if (ruta === 'hooks/useSocket.tsx') continue; // ahí se DEFINEN
      const lineas = texto.split('\n');
      lineas.forEach((linea, i) => {
        const m = linea.match(/^(\s*)register[A-Za-z]+Handler\(/);
        if (!m) return; // a mitad de línea (`return …`, `[a(), b()]`, `() => …`) siempre devuelve la baja
        const anterior = lineas.slice(0, i).reverse().find((l) => l.trim() !== '') ?? '';
        // Como elemento de una lista, o como cuerpo de una función flecha: la línea de arriba lo abre.
        if (/[[,(]\s*$|=>\s*$/.test(anterior.trimEnd())) return;
        sueltas.push(`${ruta}:${i + 1}: ${linea.trim()}`);
      });
    }
    expect(sueltas).toEqual([]);
  });

  it('las pantallas de lista no se anotan con una función propia pisada: usan useEventoEnVivo o devuelven la baja', () => {
    // Las que reaccionan a «cambió algo» deben escuchar también la reconexión (lo que pasó sin conexión no llegó).
    const sinReconexion = ['pages/BalancePage.tsx', 'pages/ContractsScreen.tsx', 'pages/Dashboard.tsx', 'pages/MessagesScreen.tsx', 'pages/MyJobsScreen.tsx', 'pages/WithdrawalRequestPage.tsx']
      .filter((ruta) => !FUENTES.find((f) => f.ruta === ruta)!.texto.includes('socket:reconectado'));
    expect(sinReconexion).toEqual([]);
  });
});
