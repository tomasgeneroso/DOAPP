import { describe, it, expect } from '@jest/globals';
import { validarDatosDeTransferencia, documentoNormalizado, DIAS_MAXIMOS_DE_ANTIGUEDAD } from '../shared/pagos/transferencia.js';
import { datosBancarios, esCbuValido } from '../server/services/datosBancarios.js';

const ahora = new Date('2026-10-20T15:00:00');
const buenos = { numero: 'OP-123456', nombre: 'Tomás Generoso', documento: '40.182.662', banco: 'Banco Galicia', fecha: '2026-10-19' };
const archivoOk = { nombre: 'comprobante.pdf', tamano: 120_000 };

describe('«Ya pagué»: datos de la transferencia', () => {
  it('con todo en orden pasa', () => {
    expect(validarDatosDeTransferencia(buenos, { ahora, archivo: archivoOk })).toEqual({ ok: true, errores: {} });
  });

  it('cada dato faltante se marca por separado', () => {
    const r = validarDatosDeTransferencia({}, { ahora, archivo: null });
    expect(Object.keys(r.errores).sort()).toEqual(['archivo', 'banco', 'documento', 'fecha', 'nombre', 'numero']);
    expect(r.ok).toBe(false);
  });

  it('el documento acepta DNI (con o sin puntos) y CUIL/CUIT; rechaza lo que no lo es', () => {
    expect(documentoNormalizado('40.182.662')).toBe('40182662');
    expect(documentoNormalizado('27-40182662-3')).toBe('27401826623');
    expect(documentoNormalizado('1234')).toBeNull();
    expect(documentoNormalizado('99999999999')).toBeNull(); // 11 dígitos pero prefijo que no existe
    expect(documentoNormalizado('abc')).toBeNull();
  });

  it('la fecha no puede ser futura ni de hace más de 30 días, y hoy sí vale', () => {
    expect(validarDatosDeTransferencia({ ...buenos, fecha: '2026-10-20' }, { ahora, exigirArchivo: false }).ok).toBe(true);
    expect(validarDatosDeTransferencia({ ...buenos, fecha: '2026-10-21' }, { ahora, exigirArchivo: false }).errores.fecha).toContain('futura');
    expect(validarDatosDeTransferencia({ ...buenos, fecha: '2026-08-01' }, { ahora, exigirArchivo: false }).errores.fecha).toContain(String(DIAS_MAXIMOS_DE_ANTIGUEDAD));
    expect(validarDatosDeTransferencia({ ...buenos, fecha: '20/10/2026' }, { ahora, exigirArchivo: false }).errores.fecha).toBeTruthy();
  });

  it('el comprobante: solo pdf, jpg o png, de hasta 5 MB y no vacío', () => {
    const v = (archivo: { nombre: string; tamano: number }) => validarDatosDeTransferencia(buenos, { ahora, archivo }).errores.archivo;
    expect(v({ nombre: 'a.png', tamano: 10 })).toBeUndefined();
    expect(v({ nombre: 'a.JPG', tamano: 10 })).toBeUndefined();
    expect(v({ nombre: 'a.exe', tamano: 10 })).toContain('PDF');
    expect(v({ nombre: 'a.pdf', tamano: 6 * 1024 * 1024 })).toContain('5 MB');
    expect(v({ nombre: 'a.pdf', tamano: 0 })).toContain('vacío');
  });

  it('el número de operación no admite símbolos raros ni es demasiado corto', () => {
    expect(validarDatosDeTransferencia({ ...buenos, numero: '12' }, { ahora, exigirArchivo: false }).errores.numero).toBeTruthy();
    expect(validarDatosDeTransferencia({ ...buenos, numero: "1234'; DROP" }, { ahora, exigirArchivo: false }).errores.numero).toBeTruthy();
  });
});

describe('cuenta para transferir: solo la del entorno', () => {
  it('toma BANK_CBU y BANK_ALIAS (y lo opcional si está)', () => {
    const d = datosBancarios({ BANK_CBU: '0000003100148518910535', BANK_ALIAS: 'doapppagos', BANK_NAME: 'Mercado Pago', BANK_ACCOUNT_HOLDER: 'DOAPP S.R.L.' });
    expect(d).toEqual({ cbu: '0000003100148518910535', alias: 'doapppagos', bank: 'Mercado Pago', accountHolder: 'DOAPP S.R.L.' });
  });

  it('sin cuenta real no inventa una: null (la transferencia no se ofrece)', () => {
    expect(datosBancarios({})).toBeNull();
    // los valores de ejemplo del .env.example cuentan como «sin configurar»
    expect(datosBancarios({ BANK_CBU: '0000000000000000000000', BANK_ALIAS: 'tu.alias', BANK_CUIT: '00-00000000-0' })).toBeNull();
    // el CUIT de ejemplo que tenía el código escrito a mano no se muestra aunque esté en el .env, pero la cuenta real sí
    expect(datosBancarios({ BANK_CBU: '0000003100148518910535', BANK_ALIAS: 'doapppagos', BANK_CUIT: '30-12345678-9', BANK_ACCOUNT_HOLDER: 'DOAPP S.R.L.' })).toEqual({ cbu: '0000003100148518910535', alias: 'doapppagos', accountHolder: 'DOAPP S.R.L.' });
    // un CBU mal escrito se ignora, pero un alias real alcanza
    expect(datosBancarios({ BANK_CBU: '12345', BANK_ALIAS: 'doapppagos' })).toEqual({ alias: 'doapppagos' });
    expect(datosBancarios({ BANK_CBU: '12345' })).toBeNull();
  });

  it('el CBU son 22 dígitos y no todo ceros', () => {
    expect(esCbuValido('0000003100148518910535')).toBe(true);
    expect(esCbuValido('0'.repeat(22))).toBe(false);
    expect(esCbuValido('00000031001485189105')).toBe(false);
  });
});
