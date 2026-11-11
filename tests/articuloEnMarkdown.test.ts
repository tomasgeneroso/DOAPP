import { describe, it, expect } from '@jest/globals';
import { contenidoParaMostrar } from '../server/utils/markdownToHtml.js';
import { betaPost } from '../shared/content/betaPost.js';

/**
 * Un artículo guardado como Markdown se dibujaba como texto corrido (los `##`, los `**` y la tabla `| a | b |` salían literales), porque el blog entrega HTML y lo muestra tal cual
 * («blog/que-incluye-la-beta-de-doapp», 2026-11-09). `contenidoParaMostrar` lo convierte al leer; el HTML que ya es HTML no se toca.
 */
describe('contenidoParaMostrar', () => {
  const tabla = ['| | Durante la beta | Desde el 1/1/2027 |', '|---|---|---|', '| Trabajo | $36.000 | $36.000 |', '| **Paga el cliente** | **$36.000** | **$41.000** |'].join('\n');

  it('convierte una tabla de Markdown en una tabla HTML (con negritas y encabezado)', () => {
    const html = contenidoParaMostrar(`Antes de la tabla.\n\n${tabla}\n\nDespués.`);
    expect(html).toContain('<table>');
    expect(html).toContain('<th>Durante la beta</th>');
    expect(html).toContain('<td>Trabajo</td>');
    expect(html).toContain('<strong>Paga el cliente</strong>');
    expect(html).not.toContain('|---|');
  });

  it('convierte títulos, negritas y listas', () => {
    const html = contenidoParaMostrar('## Un título\n\nTexto con **negrita**.\n\n- uno\n- dos');
    expect(html).toContain('<h2');
    expect(html).toContain('<strong>negrita</strong>');
    expect(html).toContain('<li>uno</li>');
  });

  it('el artículo de la beta, tal como está escrito, sale sin una sola barra de tabla ni «##» literales', () => {
    const html = contenidoParaMostrar(betaPost.content);
    expect(html).toContain('<table>');
    expect(html).not.toMatch(/\|---\|/);
    expect(html).not.toMatch(/^##\s/m);
    expect(html).not.toContain('**');
  });

  it('el HTML que ya es HTML se entrega tal cual (el del editor no se vuelve a pasar por el conversor)', () => {
    const html = '<p>Hola <strong>mundo</strong></p><table><tr><td>a | b</td></tr></table>';
    expect(contenidoParaMostrar(html)).toBe(html);
    expect(contenidoParaMostrar('<h2>Título</h2>\n<p>Texto con | barras |</p>')).toBe('<h2>Título</h2>\n<p>Texto con | barras |</p>');
  });

  it('un texto sin formato se entrega igual, y lo vacío da vacío', () => {
    expect(contenidoParaMostrar('Solo un texto simple.')).toBe('Solo un texto simple.');
    expect(contenidoParaMostrar('')).toBe('');
    expect(contenidoParaMostrar(null)).toBe('');
    expect(contenidoParaMostrar(undefined)).toBe('');
  });
});
