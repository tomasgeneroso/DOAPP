import { randomUUID } from 'node:crypto';
import { mensajeParaCompartir, enlaceInterno } from '../shared/chat/enlacesDeDoapp.js';
import { findContactInfo, contactBlockedMessage, analyzeMessage } from '../shared/chat/contactFilter.js';

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

describe('lo que pasa pero queda marcado para revisar', () => {
  // La proteccion contra falsos positivos es tambien el hueco por donde se
  // evade: "cobro" hace que el filtro lea el numero como plata. No se puede
  // cerrar sin bloquear precios legitimos, asi que se deja pasar y se marca.
  it.each([
    'te cobro 1123456789',
    'el precio es 1145678901',
  ])('marca sin bloquear: %s', (texto) => {
    const r = analyzeMessage(texto);
    expect(r.bloquear).toHaveLength(0);
    expect(r.revisar.length).toBeGreaterThan(0);
  });

  it.each([
    'el trabajo sale $40.000',
    'te cobro 15.000 pesos por el arreglo',
    'mi presupuesto es de ARS 1.250.000',
  ])('un precio real no se marca: %s', (texto) => {
    // Cinco o siete digitos: ningun telefono argentino tiene ese largo. Es
    // lo que impide que la lista se llene con cada negociacion de precio.
    const r = analyzeMessage(texto);
    expect(r.bloquear).toHaveLength(0);
    expect(r.revisar).toHaveLength(0);
  });

  it('un numero largo con formato de miles se marca igual', () => {
    // Escribir el telefono con puntos es la forma tipica de evadir.
    const r = analyzeMessage('te cobro 1.123.456.789');
    expect(r.bloquear).toHaveLength(0);
    expect(r.revisar.length).toBeGreaterThan(0);
  });

  it('un mensaje bloqueado no se marca ademas para revisar', () => {
    const r = analyzeMessage('mi numero es 11 2345 6789');
    expect(r.bloquear.length).toBeGreaterThan(0);
    expect(r.revisar).toHaveLength(0);
  });
});

describe('enlaces de DOAPP', () => {
  it('compartir una publicación nunca se toma por un teléfono (antes se bloqueaba 1 de cada 8 enlaces)', () => {
    const ids = ['11223344-5566-4778-8990-1122334455ab', '0697ee18-fffe-4bf1-b55f-77ee4cf13d86', ...Array.from({ length: 600 }, () => randomUUID())];
    for (const id of ids) {
      for (const base of ['https://doapparg.com/posts/', 'https://staging.doapparg.com/profile/', 'https://www.doapparg.com/jobs/', 'http://localhost:5173/posts/']) {
        const r = analyzeMessage(mensajeParaCompartir('publicacion', 'Pintura', base + id));
        expect({ id, base, ...r }).toEqual({ id, base, bloquear: [], revisar: [] });
      }
    }
  });

  it('no abre un hueco: un teléfono al lado del enlace, en otro sitio, o disfrazado de identificador se sigue detectando', () => {
    const id = '0697ee18-fffe-4bf1-b55f-77ee4cf13d86';
    expect(analyzeMessage(`https://doapparg.com/posts/${id} mi cel es 3794 123456`).revisar.length + analyzeMessage(`https://doapparg.com/posts/${id} mi cel es 3794 123456`).bloquear.length).toBeGreaterThan(0);
    expect(analyzeMessage('https://doapparg.com/posts/11223344-5566-4778-8990-112233445566').bloquear.length).toBeGreaterThan(0); // solo cifras
    expect(analyzeMessage('https://doapparg.com/3794-123456').bloquear.length + analyzeMessage('https://doapparg.com/3794-123456').revisar.length).toBeGreaterThan(0);
    expect(analyzeMessage('https://otro-sitio.example/posts/11223344-5566-4778-8990-1122334455ab').bloquear.length).toBeGreaterThan(0);
  });

  it('en el chat se muestran como tarjeta solo las páginas propias', () => {
    const origen = 'https://doapparg.com';
    expect(enlaceInterno('https://doapparg.com/posts/abc', origen)).toEqual({ ruta: '/posts/abc', rotulo: 'Ver publicación' });
    expect(enlaceInterno('https://doapparg.com/blog/como-contratar', origen)?.rotulo).toBe('Ver artículo');
    for (const ajeno of ['https://doapparg.com.estafa.example/posts/abc', 'https://estafa.example/posts/abc', 'https://doapparg.com@estafa.example/posts/abc', 'https://doapparg.com/admin/users', 'javascript:alert(1)', 'no es un enlace']) {
      expect(enlaceInterno(ajeno, origen)).toBeNull();
    }
  });
});
