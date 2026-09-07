import {
  requiereDobleConfirmacion,
  verificarEnfriamientoCbu,
  MONTO_DOBLE_CONFIRMACION_ARS,
  ENFRIAMIENTO_CBU_HORAS,
  TOPE_DIARIO_POR_ROL_ARS,
} from '../server/services/paymentSafeguards.js';

/**
 * Estos controles solo sirven si fallan cerrados: ante la duda, no dejan pasar
 * la plata. La mayoria de los casos de acá prueban justamente eso, no el camino
 * feliz.
 */

describe('doble confirmacion por monto', () => {
  it('la pide desde el umbral, no despues', () => {
    // El limite es inclusivo a proposito: un monto exactamente igual al umbral
    // es tan grande como uno que lo supera por un peso.
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS)).toBe(true);
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS + 1)).toBe(true);
  });

  it('no molesta en los montos chicos', () => {
    // Si el control se dispara todo el tiempo, el equipo lo evita.
    expect(requiereDobleConfirmacion(MONTO_DOBLE_CONFIRMACION_ARS - 1)).toBe(false);
    expect(requiereDobleConfirmacion(50_000)).toBe(false);
  });
});

describe('enfriamiento tras cambiar el CBU', () => {
  const haceHoras = (h: number) => new Date(Date.now() - h * 3_600_000);

  it('bloquea el retiro inmediatamente despues del cambio', () => {
    // Es el ataque concreto: entrar con la contraseña robada, cambiar la cuenta
    // de destino y retirar. Sin demora, entre las dos cosas pasan segundos.
    const r = verificarEnfriamientoCbu(new Date());
    expect(r.permitido).toBe(false);
    expect(r.motivo).toMatch(/no fuiste vos/i);
  });

  it('sigue bloqueando una hora antes de cumplirse el plazo', () => {
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS - 1)).permitido).toBe(false);
  });

  it('habilita cuando se cumplio el plazo', () => {
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS)).permitido).toBe(true);
    expect(verificarEnfriamientoCbu(haceHoras(ENFRIAMIENTO_CBU_HORAS + 10)).permitido).toBe(true);
  });

  it('no bloquea a quien nunca cambio la cuenta', () => {
    // La inmensa mayoria de los retiros son de gente que cargo su CBU una vez y
    // no lo toco nunca mas. Ese caso no puede pagar el costo del control.
    expect(verificarEnfriamientoCbu(null).permitido).toBe(true);
    expect(verificarEnfriamientoCbu(undefined).permitido).toBe(true);
  });

  it('dice cuanto falta, no solo que no se puede', () => {
    const r = verificarEnfriamientoCbu(haceHoras(4));
    expect(r.detalle?.horasFaltantes).toBe(ENFRIAMIENTO_CBU_HORAS - 4);
  });
});

describe('topes diarios por rol', () => {
  it('soporte no mueve plata', () => {
    // Tope cero y no "sin permiso": si algun dia una ruta se le abre por error,
    // el tope lo frena igual.
    expect(TOPE_DIARIO_POR_ROL_ARS.support).toBe(0);
  });

  it('el tope crece con la responsabilidad', () => {
    expect(TOPE_DIARIO_POR_ROL_ARS.admin).toBeLessThan(TOPE_DIARIO_POR_ROL_ARS.super_admin);
    expect(TOPE_DIARIO_POR_ROL_ARS.super_admin).toBeLessThan(TOPE_DIARIO_POR_ROL_ARS.owner);
  });

  it('el dueño no tiene tope', () => {
    // Ponerle un tope solo lo obligaria a saltearselo, y un control que se
    // saltea rutinariamente ensena que los controles son opcionales.
    expect(TOPE_DIARIO_POR_ROL_ARS.owner).toBe(Number.POSITIVE_INFINITY);
  });

  it('un rol desconocido no tiene tope definido, y eso lo bloquea', () => {
    // verificarTopeDiario rechaza cuando el rol no figura. Es la diferencia
    // entre fallar cerrado y fallar abierto.
    expect(TOPE_DIARIO_POR_ROL_ARS['marketing']).toBeUndefined();
    expect(TOPE_DIARIO_POR_ROL_ARS['dpo']).toBeUndefined();
  });
});

describe('compresion de la metadata de auditoria', () => {
  const { leerMetadata } = require('../server/utils/auditLog.js');
  const { gzipSync } = require('node:zlib');

  it('lee una metadata comprimida', () => {
    const original = { discrepancias: Array.from({ length: 50 }, (_, i) => ({ id: i, detalle: 'x'.repeat(60) })) };
    const fila = {
      metadata: { _comprimida: true, _claves: ['discrepancias'] },
      metadataGz: gzipSync(Buffer.from(JSON.stringify(original), 'utf8')),
    };
    expect(leerMetadata(fila)).toEqual(original);
  });

  it('lee una metadata sin comprimir', () => {
    expect(leerMetadata({ metadata: { monto: 1000 } })).toEqual({ monto: 1000 });
  });

  it('no rompe cuando la metadata comprimida esta corrupta', () => {
    // Devolver el resumen es mejor que devolver nada: al menos dice que claves
    // habia. Y tirar una excepcion acá dejaria sin ver TODO el listado de
    // auditoria por una sola fila mal escrita.
    const r = leerMetadata({
      metadata: { _claves: ['a'] },
      metadataGz: Buffer.from('esto no es gzip'),
    });
    expect(r?._errorAlDescomprimir).toBeDefined();
    expect(r?._claves).toEqual(['a']);
  });

  it('comprimir vale la pena solo por encima del umbral', () => {
    // El caso contraintuitivo: gzip agrega ~20 bytes de encabezado, asi que un
    // objeto chico comprimido pesa MAS que el original. Por eso hay umbral.
    const chico = JSON.stringify({ monto: 1000, moneda: 'ARS' });
    expect(gzipSync(Buffer.from(chico)).length).toBeGreaterThan(Buffer.byteLength(chico));

    const grande = JSON.stringify(Array.from({ length: 200 }, (_, i) => ({ id: i, campo: 'valor repetido' })));
    expect(gzipSync(Buffer.from(grande)).length).toBeLessThan(Buffer.byteLength(grande) / 5);
  });
});
