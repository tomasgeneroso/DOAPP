import { textoParaCompartir, nivelDeVerificacion, AVISO_COMPARTIR } from '../shared/contracts/compartir.js';

/**
 * Compartir con alguien de confianza. Lo que se prueba es sobre todo lo que
 * NO tiene que salir: telefono, email y documento de la otra persona no son
 * del cliente para repartir.
 */
describe('compartir el contrato con un contacto de confianza', () => {
  const base = {
    nombreDeLaOtraParte: 'Ana Pérez',
    rolDeLaOtraParte: 'trabajador' as const,
    tituloDelTrabajo: 'Arreglo de canilla',
    cuando: new Date('2026-09-25T14:00:00'),
    zona: 'Almagro',
    verificacion: 'full',
    foto: 'https://doapparg.com/u/ana.jpg',
    perfil: 'https://doapparg.com/profile/123',
  };

  it('dice quien viene, cuando y como esta verificado', () => {
    const t = textoParaCompartir(base);
    expect(t).toContain('Ana Pérez');
    expect(t).toContain('Arreglo de canilla');
    expect(t).toContain('Almagro');
    expect(t).toMatch(/identidad verificada/i);
    expect(t).toContain('https://doapparg.com/profile/123');
  });

  it('nunca incluye telefono, email ni documento', () => {
    const t = textoParaCompartir({ ...base, ...({ telefono: '1155667788', email: 'ana@mail.com', dni: '30111222' } as any) });
    expect(t).not.toMatch(/1155667788|ana@mail\.com|30111222/);
  });

  it('funciona sin foto, sin zona y sin fecha', () => {
    const t = textoParaCompartir({ ...base, foto: null, zona: null, cuando: null, perfil: null });
    expect(t).toContain('Ana Pérez');
    expect(t).not.toMatch(/undefined|null|Invalid Date/);
  });

  it('una fecha invalida no ensucia el mensaje', () => {
    const t = textoParaCompartir({ ...base, cuando: 'no es una fecha' });
    expect(t).not.toMatch(/Invalid Date|Cuándo:/);
  });

  it('el trabajador comparte con el texto del otro lado', () => {
    const t = textoParaCompartir({ ...base, rolDeLaOtraParte: 'cliente' });
    expect(t).toMatch(/Trabajo para Ana Pérez/);
    expect(t).toMatch(/sepas dónde estoy/);
  });

  it('un nivel desconocido no inventa verificacion', () => {
    expect(nivelDeVerificacion('otro')).toBe('sin verificar');
    expect(nivelDeVerificacion(null)).toBe('sin verificar');
  });

  it('el aviso dice que no es un control ni un seguimiento', () => {
    expect(AVISO_COMPARTIR).toMatch(/no un control/i);
    expect(AVISO_COMPARTIR).toMatch(/tiempo real/i);
  });
});
