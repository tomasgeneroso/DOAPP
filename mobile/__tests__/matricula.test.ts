/**
 * Profesión y matrícula en la app. Lo que se cuida: las reglas de la web (las mismas profesiones reguladas, los tres datos
 * obligatorios), que cambiar de profesión NO borre una matrícula ya cargada, que se diga «declarada» y no «verificada», y
 * que los archivos (encriptados) solo se pidan por la ruta que decide quién los ve.
 */
jest.mock('../services/api', () => ({
  __esModule: true,
  put: jest.fn(),
  del: jest.fn(),
  upload: jest.fn(),
  API_URL: 'https://doapparg.com/api',
}));

import { del, put, upload } from '../services/api';
import {
  PROFESIONES,
  PROFESIONES_REGULADAS,
  datosDelArchivo,
  direccionDelArchivo,
  esRegulada,
  estadoDeLaMatricula,
  etiquetaDeLaProfesion,
  guardarDatosProfesionales,
  interpretarArchivos,
  quitarArchivoDeMatricula,
  subirArchivoDeMatricula,
  validarDatosProfesionales,
} from '../services/matricula';

const mockPut = put as jest.Mock;
const mockDel = del as jest.Mock;
const mockUpload = upload as jest.Mock;
const ID = '3f2c1b9e-aaaa-4bbb-8ccc-0123456789ab';

describe('profesiones', () => {
  it('son las mismas cinco reguladas que la web, y todas están en la lista', () => {
    expect(PROFESIONES_REGULADAS).toEqual(['gasista', 'electricista', 'plomero', 'maestro_mayor_obras', 'instalador_aire']);
    for (const p of PROFESIONES_REGULADAS) expect(PROFESIONES.map((x) => x.valor)).toContain(p);
    expect(esRegulada('plomero')).toBe(true);
    expect(esRegulada('pintor')).toBe(false);
    expect(esRegulada('')).toBe(false);
    expect(esRegulada(undefined)).toBe(false);
  });

  it('la etiqueta de una profesión desconocida es el mismo valor; sin profesión, «Sin especificar»', () => {
    expect(etiquetaDeLaProfesion('gasista')).toBe('Gasista matriculado');
    expect(etiquetaDeLaProfesion('astronauta')).toBe('astronauta');
    expect(etiquetaDeLaProfesion('')).toBe('Sin especificar');
    expect(etiquetaDeLaProfesion(null)).toBe('Sin especificar');
  });
});

describe('validarDatosProfesionales', () => {
  const regulada = { profession: 'electricista', licenseNumber: ' MP-12345 ', licenseCategory: ' Primera ', licenseCertNumber: ' 9876 ' };

  it('regulada con los tres datos: se mandan recortados', () => {
    expect(validarDatosProfesionales(regulada)).toEqual({
      ok: true,
      cuerpo: { profession: 'electricista', licenseNumber: 'MP-12345', licenseCategory: 'Primera', licenseCertNumber: '9876' },
    });
  });

  it.each([
    ['número', { licenseNumber: '  ' }, /número de matrícula/i],
    ['categoría', { licenseCategory: '' }, /categoría/i],
    ['certificado', { licenseCertNumber: '' }, /certificado/i],
  ])('regulada sin %s: error y no se manda nada', (_n, cambio, esperado) => {
    const r: any = validarDatosProfesionales({ ...regulada, ...cambio });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(esperado);
  });

  it('largos: el número admite 40; los demás 100', () => {
    expect((validarDatosProfesionales({ ...regulada, licenseNumber: 'A'.repeat(41) }) as any).ok).toBe(false);
    expect((validarDatosProfesionales({ ...regulada, licenseNumber: 'A'.repeat(40) }) as any).ok).toBe(true);
    expect((validarDatosProfesionales({ ...regulada, licenseCategory: 'B'.repeat(101) }) as any).ok).toBe(false);
  });

  it('una profesión NO regulada manda solo la profesión: cambiar de profesión no borra una matrícula ya cargada', () => {
    const r: any = validarDatosProfesionales({ profession: 'pintor', licenseNumber: 'MP-1', licenseCategory: 'x', licenseCertNumber: 'y' });
    expect(r).toEqual({ ok: true, cuerpo: { profession: 'pintor' } });
    expect(Object.keys(r.cuerpo)).toEqual(['profession']);
  });

  it('sin profesión se manda null (se quita la profesión) y nada más', () => {
    expect(validarDatosProfesionales({ profession: '', licenseNumber: '', licenseCategory: '', licenseCertNumber: '' })).toEqual({ ok: true, cuerpo: { profession: null } });
  });
});

describe('estadoDeLaMatricula: «declarada», nunca «verificada»', () => {
  it('aprobada por el equipo se cuenta como declarada y aclara que DOAPP no verifica', () => {
    const e = estadoDeLaMatricula({ licenseVerified: true, licenseVerificationStatus: 'approved' });
    expect(e.tipo).toBe('declarada');
    expect(e.texto).toMatch(/declarada/i);
    expect(e.texto).toMatch(/no la verifica/i);
    expect(e.texto).not.toMatch(/verificada por DOAPP/i);
  });

  it('rechazada: lleva el motivo', () => {
    const e: any = estadoDeLaMatricula({ licenseVerificationStatus: 'rejected', licenseRejectedReason: 'La foto no se lee' });
    expect(e.tipo).toBe('rechazada');
    expect(e.motivo).toBe('La foto no se lee');
  });

  it('sin archivos, con archivos y sin usuario', () => {
    expect(estadoDeLaMatricula({ licenseNumber: 'X' }).tipo).toBe('sin_archivos');
    expect(estadoDeLaMatricula({ licenseDocumentUrl: '/api/users/x/license-document/front' }).tipo).toBe('cargada');
    expect(estadoDeLaMatricula(null).tipo).toBe('sin_archivos');
  });
});

describe('direccionDelArchivo', () => {
  it('une la base de la API con la ruta que desencripta el archivo', () => {
    expect(direccionDelArchivo(`/api/users/${ID}/license-document/front`)).toBe(`https://doapparg.com/api/users/${ID}/license-document/front`);
    expect(direccionDelArchivo(`/api/users/${ID}/license-document/back`, 'https://doapparg.com/api/')).toBe(`https://doapparg.com/api/users/${ID}/license-document/back`);
  });

  it('lo que no tiene exactamente esa forma no se abre (otra carpeta, la referencia interna, otro sitio, lado inválido)', () => {
    for (const mala of [
      `/uploads/license-docs/license-1-0123456789ab.jpg.enc`,
      `/api/users/${ID}/license-document/lateral`,
      `/api/users/${ID}/license-document/front/../../x`,
      `https://malo.example/api/users/${ID}/license-document/front`,
      '/api/users/no-es-uuid/license-document/front',
      '', null, undefined, 42,
    ]) {
      expect(direccionDelArchivo(mala as any)).toBeNull();
    }
    expect(direccionDelArchivo(`/api/users/${ID}/license-document/front`, '')).toBeNull();
    expect(direccionDelArchivo(`/api/users/${ID}/license-document/front`, 'javascript:alert(1)')).toBeNull();
  });
});

describe('interpretarArchivos', () => {
  it('éxito: las direcciones que quedan y el mensaje', () => {
    expect(interpretarArchivos({ success: true, message: 'Documento de matrícula subido correctamente.', licenseDocumentUrl: '/a', licenseDocumentBackUrl: null }, 'x')).toEqual({
      ok: true, mensaje: 'Documento de matrícula subido correctamente.', frente: '/a', dorso: null,
    });
  });

  it('sin mensaje usa el de por defecto; con error cuenta el motivo del servidor', () => {
    expect(interpretarArchivos({ success: true }, 'Archivo subido.').mensaje).toBe('Archivo subido.');
    expect(interpretarArchivos({ success: false, message: 'Quitá primero el reverso' }, 'x')).toMatchObject({ ok: false, mensaje: 'Quitá primero el reverso', frente: null, dorso: null });
    expect(interpretarArchivos(null, 'x').ok).toBe(false);
  });
});

describe('llamadas a la API', () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockDel.mockReset();
    mockUpload.mockReset();
  });

  it('guardar: PUT /auth/settings con el cuerpo validado', async () => {
    mockPut.mockResolvedValueOnce({ success: true });
    expect(await guardarDatosProfesionales({ profession: 'plomero' })).toEqual({ ok: true, mensaje: 'Guardado.' });
    expect(mockPut).toHaveBeenCalledWith('/auth/settings', { profession: 'plomero' });
    mockPut.mockResolvedValueOnce({ success: false, message: 'Error del servidor' });
    expect(await guardarDatosProfesionales({ profession: 'plomero' })).toEqual({ ok: false, mensaje: 'Error del servidor' });
  });

  it('subir el frente usa el campo licenseDocument y el reverso licenseDocumentBack, en POST /auth/license-document', async () => {
    mockUpload.mockResolvedValue({ success: true, licenseDocumentUrl: `/api/users/${ID}/license-document/front`, licenseDocumentBackUrl: null });
    const appended: Array<[string, any]> = [];
    const Original = global.FormData;
    (global as any).FormData = class { append(k: string, v: any) { appended.push([k, v]); } };
    try {
      await subirArchivoDeMatricula('front', 'file:///tmp/frente.PNG');
      await subirArchivoDeMatricula('back', 'file:///tmp/dorso.jpg');
    } finally {
      (global as any).FormData = Original;
    }
    expect(mockUpload.mock.calls[0][0]).toBe('/auth/license-document');
    expect(appended[0][0]).toBe('licenseDocument');
    expect(appended[0][1]).toEqual({ uri: 'file:///tmp/frente.PNG', name: 'frente.PNG', type: 'image/png' });
    expect(appended[1][0]).toBe('licenseDocumentBack');
    expect(appended[1][1].type).toBe('image/jpeg');
  });

  it('quitar: DELETE /auth/license-document/<lado>', async () => {
    mockDel.mockResolvedValueOnce({ success: true, licenseDocumentUrl: null, licenseDocumentBackUrl: null });
    const r = await quitarArchivoDeMatricula('back');
    expect(mockDel).toHaveBeenCalledWith('/auth/license-document/back');
    expect(r.ok).toBe(true);
  });

  it('datosDelArchivo: la extensión decide el tipo; lo desconocido va como JPEG', () => {
    expect(datosDelArchivo('file:///a/b/foto.webp?x=1', 'front')).toEqual({ name: 'foto.webp', type: 'image/webp' });
    expect(datosDelArchivo('file:///a/b/sin_extension', 'back')).toEqual({ name: 'sin_extension.jpg', type: 'image/jpeg' });
    expect(datosDelArchivo('', 'front').name).toBe('matricula-front.jpg');
  });
});
