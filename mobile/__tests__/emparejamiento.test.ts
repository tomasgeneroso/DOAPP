const mockPost = jest.fn();
const mockPut = jest.fn();
jest.mock('../services/api', () => ({
  post: (...a: unknown[]) => mockPost(...a),
  put: (...a: unknown[]) => mockPut(...a),
}));

import {
  aceptarElContrato,
  ambasPartesAceptaron,
  codigoCompleto,
  largoEsperadoDelCodigo,
  confirmarElCodigo,
  generarElCodigo,
  horasHastaElInicio,
  iniciarSinCodigo,
  mostrarEmparejamiento,
  normalizarCodigo,
  puedeAceptarElContrato,
  puedeConfirmarMiParte,
  puedeGenerarElCodigo,
  sugerirInicioSinCodigo,
} from '../services/emparejamiento';

const HORA = 3_600_000;
const AHORA = Date.UTC(2026, 9, 11, 12, 0, 0);
const enHoras = (h: number) => new Date(AHORA + h * HORA).toISOString();
const contrato = (over: Record<string, unknown> = {}) => ({
  status: 'accepted',
  termsAcceptedByClient: true,
  termsAcceptedByDoer: true,
  startDate: enHoras(10),
  pairingCode: null,
  clientConfirmedPairing: false,
  doerConfirmedPairing: false,
  ...over,
});

describe('aceptar el contrato', () => {
  it('sólo con el contrato aprobado por administración («ready») y si esa persona todavía no lo aceptó', () => {
    expect(puedeAceptarElContrato(contrato({ status: 'ready', termsAcceptedByClient: false }), true, false)).toBe(true);
    expect(puedeAceptarElContrato(contrato({ status: 'ready', termsAcceptedByDoer: false }), false, true)).toBe(true);
    // ya aceptó
    expect(puedeAceptarElContrato(contrato({ status: 'ready', termsAcceptedByClient: true, termsAcceptedByDoer: false }), true, false)).toBe(false);
    // todavía lo está revisando administración, o ya empezó
    for (const status of ['pending', 'accepted', 'in_progress', 'completed', 'cancelled']) {
      expect(puedeAceptarElContrato(contrato({ status, termsAcceptedByClient: false }), true, false)).toBe(false);
    }
    // alguien ajeno
    expect(puedeAceptarElContrato(contrato({ status: 'ready', termsAcceptedByClient: false }), false, false)).toBe(false);
    expect(puedeAceptarElContrato(null, true, false)).toBe(false);
  });

  it('aceptarElContrato llama a PUT /contracts/:id/accept y cuenta lo que respondió el servidor', async () => {
    mockPut.mockResolvedValueOnce({ success: true, message: 'Contrato aceptado por ambas partes' });
    const ok = await aceptarElContrato('c1');
    expect(mockPut).toHaveBeenCalledWith('/contracts/c1/accept', {});
    expect(ok).toEqual({ ok: true, mensaje: 'Contrato aceptado por ambas partes', yaIniciado: false });

    mockPut.mockResolvedValueOnce({ success: false, message: 'Ya has aceptado este contrato' });
    expect(await aceptarElContrato('c1')).toEqual({ ok: false, mensaje: 'Ya has aceptado este contrato' });
  });
});

describe('generar el código: sólo a menos de 24 horas del inicio', () => {
  it('con el contrato aceptado por los dos, dentro de la ventana y sin código', () => {
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(10) }), AHORA)).toBe(true);
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(24) }), AHORA)).toBe(true);
  });

  it('antes de las 24 horas, o con el inicio ya pasado, no', () => {
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(24.5) }), AHORA)).toBe(false);
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(72) }), AHORA)).toBe(false);
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(-1) }), AHORA)).toBe(false);
    expect(puedeGenerarElCodigo(contrato({ startDate: enHoras(0) }), AHORA)).toBe(false);
  });

  it('si falta que alguien acepte, o ya hay código, o el estado no es «accepted», no', () => {
    expect(puedeGenerarElCodigo(contrato({ termsAcceptedByDoer: false }), AHORA)).toBe(false);
    expect(puedeGenerarElCodigo(contrato({ pairingCode: 'AB12' }), AHORA)).toBe(false);
    for (const status of ['pending', 'ready', 'in_progress', 'completed']) {
      expect(puedeGenerarElCodigo(contrato({ status }), AHORA)).toBe(false);
    }
  });

  it('una fecha ausente o inválida nunca habilita nada', () => {
    expect(horasHastaElInicio({ startDate: undefined }, AHORA)).toBeNull();
    expect(horasHastaElInicio({ startDate: 'no es una fecha' }, AHORA)).toBeNull();
    expect(puedeGenerarElCodigo(contrato({ startDate: undefined }), AHORA)).toBe(false);
    expect(puedeGenerarElCodigo(contrato({ startDate: 'x' }), AHORA)).toBe(false);
  });
});

describe('cuándo se muestra la sección', () => {
  it('con código: mientras el contrato está aceptado o en curso', () => {
    expect(mostrarEmparejamiento(contrato({ pairingCode: 'AB12', startDate: enHoras(70) }), AHORA)).toBe(true);
    expect(mostrarEmparejamiento(contrato({ pairingCode: 'AB12', status: 'in_progress' }), AHORA)).toBe(true);
    expect(mostrarEmparejamiento(contrato({ pairingCode: 'AB12', status: 'completed' }), AHORA)).toBe(false);
    expect(mostrarEmparejamiento(contrato({ pairingCode: 'AB12', status: 'cancelled' }), AHORA)).toBe(false);
  });

  it('sin código: sólo en la ventana de las 24 horas', () => {
    expect(mostrarEmparejamiento(contrato({ startDate: enHoras(5) }), AHORA)).toBe(true);
    expect(mostrarEmparejamiento(contrato({ startDate: enHoras(50) }), AHORA)).toBe(false);
  });

  it('nunca si las dos partes no aceptaron', () => {
    expect(mostrarEmparejamiento(contrato({ termsAcceptedByClient: false, pairingCode: 'AB12' }), AHORA)).toBe(false);
    expect(ambasPartesAceptaron(contrato({ termsAcceptedByDoer: false }))).toBe(false);
    expect(ambasPartesAceptaron(undefined)).toBe(false);
  });
});

describe('confirmar el código', () => {
  it('cada parte confirma la suya, una sola vez, mientras el contrato está «accepted» y hay código', () => {
    const c = contrato({ pairingCode: 'AB12' });
    expect(puedeConfirmarMiParte(c, true, false)).toBe(true);
    expect(puedeConfirmarMiParte(c, false, true)).toBe(true);
    expect(puedeConfirmarMiParte({ ...c, clientConfirmedPairing: true }, true, false)).toBe(false);
    expect(puedeConfirmarMiParte({ ...c, doerConfirmedPairing: true }, false, true)).toBe(false);
    expect(puedeConfirmarMiParte({ ...c, clientConfirmedPairing: true }, false, true)).toBe(true);
  });

  it('sin código, o con el contrato ya iniciado, o sin ser parte: no', () => {
    expect(puedeConfirmarMiParte(contrato({ pairingCode: null }), true, false)).toBe(false);
    expect(puedeConfirmarMiParte(contrato({ pairingCode: 'AB12', status: 'in_progress' }), true, false)).toBe(false);
    expect(puedeConfirmarMiParte(contrato({ pairingCode: 'AB12' }), false, false)).toBe(false);
  });

  it('el código se escribe en mayúsculas, sin espacios ni símbolos y hasta 8 caracteres', () => {
    expect(normalizarCodigo(' ab-12 ')).toBe('AB12');
    expect(normalizarCodigo('abcdef')).toBe('ABCDEF');
    expect(normalizarCodigo('abcdefghij')).toBe('ABCDEFGH');
    expect(normalizarCodigo(undefined as any)).toBe('');
  });

  it('el código personal que genera el servidor hoy es de 6 caracteres: se puede escribir completo', () => {
    // El servidor genera 6 caracteres desde 2026-05-26 (User.model: generatePersonalPairingCode). Un tope de 4 hacía
    // imposible confirmar: el servidor compara el texto entero.
    expect(largoEsperadoDelCodigo('K7Q2ZM')).toBe(6);
    expect(codigoCompleto('k7q2zm', 'K7Q2ZM')).toBe(true);
    expect(codigoCompleto('k7q2', 'K7Q2ZM')).toBe(false);
    expect(codigoCompleto('k7q2zmx', 'K7Q2ZM')).toBe(false);
  });

  it('un código viejo de 4 caracteres también se confirma; sin código a la vista alcanza con el mínimo', () => {
    expect(largoEsperadoDelCodigo('AB12')).toBe(4);
    expect(codigoCompleto('ab12', 'AB12')).toBe(true);
    expect(codigoCompleto('ab1', 'AB12')).toBe(false);
    expect(largoEsperadoDelCodigo(null)).toBe(8);
    expect(codigoCompleto('ab1')).toBe(false);
    expect(codigoCompleto('ab12')).toBe(true);
  });

  it('confirmarElCodigo manda el código normalizado', async () => {
    mockPost.mockResolvedValueOnce({ success: true, message: 'Pareamiento confirmado.' });
    const r = await confirmarElCodigo('c1', 'ab-12');
    expect(mockPost).toHaveBeenCalledWith('/contracts/c1/confirm-pairing', { code: 'AB12' });
    expect(r.ok).toBe(true);
  });

  it('un contrato que ya estaba iniciado no es un error', async () => {
    mockPost.mockResolvedValueOnce({ success: true, alreadyStarted: true, message: 'El contrato ya está iniciado.' });
    expect(await confirmarElCodigo('c1', 'AB12')).toEqual({ ok: true, mensaje: 'El contrato ya está iniciado.', yaIniciado: true });
  });

  it('código incorrecto o vencido: es un error y se ofrece iniciar sin código', async () => {
    mockPost.mockResolvedValueOnce({ success: false, message: 'Código incorrecto' });
    const r = await confirmarElCodigo('c1', 'ZZZZ');
    expect(r.ok).toBe(false);
    expect(sugerirInicioSinCodigo(r.mensaje)).toBe(true);
    expect(sugerirInicioSinCodigo('El código de pareamiento ha expirado. Genera uno nuevo.')).toBe(true);
    expect(sugerirInicioSinCodigo('Error del servidor')).toBe(false);
    expect(sugerirInicioSinCodigo(undefined)).toBe(false);
  });
});

describe('las otras llamadas', () => {
  it('generar y iniciar sin código usan sus rutas', async () => {
    mockPost.mockResolvedValue({ success: true });
    await generarElCodigo('c9');
    await iniciarSinCodigo('c9');
    expect(mockPost).toHaveBeenCalledWith('/contracts/c9/generate-pairing', {});
    expect(mockPost).toHaveBeenCalledWith('/contracts/c9/force-start-pairing', {});
  });

  it('sin respuesta del servidor es un error con un mensaje, no un éxito', async () => {
    mockPost.mockResolvedValueOnce(undefined);
    const r = await generarElCodigo('c1');
    expect(r.ok).toBe(false);
    expect(r.mensaje.length).toBeGreaterThan(5);
  });
});
