import { describe, it, expect } from '@jest/globals';
import { inicialDe, marcadorConInicial } from '../client/utils/imagenesRotas';

describe('fotos de perfil que no cargan: la inicial', () => {
  it('saca la inicial del nombre (con o sin el prefijo del alt)', () => {
    expect(inicialDe('Tomas generoso')).toBe('T');
    expect(inicialDe('Foto de ana')).toBe('A');
    expect(inicialDe('Avatar')).toBe('?'); // solo el prefijo: no hay nombre
    expect(inicialDe('')).toBe('?');
    expect(inicialDe(null)).toBe('?');
  });

  it('el marcador es una imagen SVG con esa inicial', () => {
    const uri = marcadorConInicial('Tomas');
    expect(uri.startsWith('data:image/svg+xml')).toBe(true);
    expect(decodeURIComponent(uri)).toContain('>T</text>');
  });
});
