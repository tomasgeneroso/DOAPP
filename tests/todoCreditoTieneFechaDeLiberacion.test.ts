import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Guarda contra el error de «liberar plata sin respetar el plazo de Mercado Pago».
 *
 * Cada vez que el servidor SUMA saldo a alguien con `acreditarSaldo(...)` o le devuelve plata con `acreditarDevolucion(...)` tiene que decidir desde
 * cuándo se puede retirar (en una devolución, además, si todavía es a favor PENDIENTE y no saldo):
 *   - lleva `disponibleDesde` en la metadata (devoluciones: cuando MP libera el pago original; cobros: lo que tarde más entre MP y el
 *     plazo de reclamo), o
 *   - lleva el comentario `// sin-espera: <motivo>` si de verdad no hay nada que esperar (la plata ya está en la cuenta de la plataforma).
 *
 * Un camino nuevo que acredite sin decidir falla acá, no en producción.
 */
const RAIZ = join(process.cwd(), 'server');

function archivos(dir: string, acc: string[] = []): string[] {
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) archivos(ruta, acc);
    else if (ruta.endsWith('.ts')) acc.push(ruta);
  }
  return acc;
}

describe('todo crédito de saldo decide cuándo se puede retirar', () => {
  it('cada llamada a acreditarSaldo / acreditarDevolucion lleva disponibleDesde o un «sin-espera» justificado', () => {
    const sinDecidir: string[] = [];
    for (const f of archivos(RAIZ)) {
      const src = readFileSync(f, 'utf8');
      const re = /\bacreditar(?:Saldo|Devolucion)\(/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src))) {
        const antes = src.slice(Math.max(0, m.index - 20), m.index);
        if (/function\s+$/.test(antes) || /async function\s+$/.test(antes)) continue; // la definición
        const ventana = src.slice(m.index, m.index + 1800);
        // hasta el cierre de esa llamada: lo que sigue de otra llamada no cuenta
        const fin = ventana.search(/\n\s*\}\s*\)\s*;|\n\s*\)\s*;/);
        const llamada = fin > 0 ? ventana.slice(0, fin) : ventana;
        const lineaAntes = src.slice(Math.max(0, m.index - 300), m.index);
        if (/disponibleDesde/.test(llamada) || /sin-espera:/.test(llamada) || /sin-espera:/.test(lineaAntes.split('\n').slice(-4).join('\n'))) continue;
        const linea = src.slice(0, m.index).split('\n').length;
        sinDecidir.push(`${f.replace(RAIZ, 'server')}:${linea}`);
      }
    }
    expect(sinDecidir).toEqual([]);
  });
});
