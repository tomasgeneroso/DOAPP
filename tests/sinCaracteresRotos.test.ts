import { describe, it, expect } from '@jest/globals';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Ningún texto del proyecto lleva el carácter de reemplazo «�» (U+FFFD): es lo que queda cuando un archivo se guarda con la codificación equivocada y se pierde la
 * letra (pedido del dueño, 2026-11-15: «Entrega �nica» en pantalla). Una vez perdida la letra no se recupera sola, así que se frena antes de subirlo.
 */
describe('textos sin caracteres rotos', () => {
  it('ningún archivo de texto del repositorio tiene «�»', () => {
    const archivos = execSync('git ls-files -z', { maxBuffer: 1e8 })
      .toString()
      .split('\0')
      .filter((f) => /\.(ts|tsx|json|js|cjs|mjs|css|html|md|txt|yml|yaml)$/.test(f))
      .filter((f) => f !== 'tests/sinCaracteresRotos.test.ts');
    const rotos: string[] = [];
    for (const f of archivos) {
      try {
        if (readFileSync(f, 'utf8').includes('�')) rotos.push(f);
      } catch {
        /* un archivo borrado en el árbol de trabajo no cuenta */
      }
    }
    expect(rotos).toEqual([]);
  });
});
