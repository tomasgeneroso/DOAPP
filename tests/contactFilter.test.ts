import { findContactInfo, contactBlockedMessage } from '../shared/chat/contactFilter.js';

/**
 * El riesgo de este filtro no es que se le escape un telefono: es que bloquee
 * un mensaje legitimo. Por eso hay mas casos de "esto NO se bloquea" que de
 * "esto si", y son los que importan.
 */

const detecta = (t: string) => findContactInfo(t).length > 0;

describe('detecta lo que tiene que detectar', () => {
  it.each([
    'mi numero es 11 2345 6789',
    'llamame al 1123456789',
    'wsp +54 9 11 2345-6789',
    'mi cel: 011 15 2345 6789',
    'escribime a juan.perez@gmail.com',
    'mandame un mail a contacto@empresa.com.ar',
    'soy juan arroba gmail punto com',
  ])('bloquea: %s', (texto) => {
    expect(detecta(texto)).toBe(true);
  });
});

describe('no bloquea mensajes legitimos', () => {
  it.each([
    // Plata: el falso positivo mas caro, porque el chat es donde se negocia.
    'el trabajo sale $40.000',
    'te cobro 15.000 pesos por el arreglo',
    'mi presupuesto es de ARS 1.250.000',
    'el total con materiales son 87.500',
    'quedamos en 250000 pesos',
    // Direcciones.
    'vivo en Av. Rivadavia 1234, piso 3',
    'la casa es calle San Martin 4567',
    'el codigo postal es 3400',
    // Fechas, medidas, cantidades.
    'arranco el 15/03 a las 9',
    'necesito 3 metros por 4 metros',
    'son 20 cajas de 30x40',
    // Texto normal.
    'hola, cuando podes venir?',
    'perfecto, nos vemos el lunes',
    '',
  ])('deja pasar: %s', (texto) => {
    expect(detecta(texto)).toBe(false);
  });
});

describe('el mensaje explica que paso', () => {
  it('nombra el tipo de dato detectado', () => {
    expect(contactBlockedMessage(findContactInfo('llamame al 11 2345 6789'))).toContain('teléfono');
    expect(contactBlockedMessage(findContactInfo('escribime a a@b.com'))).toContain('correo');
  });

  it('dice por que conviene no arreglar por afuera', () => {
    const msg = contactBlockedMessage(findContactInfo('11 2345 6789'));
    // No alcanza con prohibir: el usuario tiene que entender que pierde él.
    expect(msg).toMatch(/pago protegido|disputas|respaldo/);
  });
});

describe('devuelve lo encontrado, no solo un si o un no', () => {
  it('identifica cada dato por separado', () => {
    const r = findContactInfo('soy juan@mail.com o al 11 2345 6789');
    expect(r.map((x) => x.kind).sort()).toEqual(['email', 'telefono']);
  });

  it('no cuenta dos veces los digitos de un correo', () => {
    const r = findContactInfo('escribime a usuario12345678@gmail.com');
    expect(r.filter((x) => x.kind === 'telefono')).toHaveLength(0);
  });
});
