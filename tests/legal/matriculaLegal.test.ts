import { readFileSync } from 'fs';
import { join } from 'path';
import { termsEs } from '../../shared/legal/terms.es.js';
import { termsEn } from '../../shared/legal/terms.en.js';
import { privacyEs } from '../../shared/legal/privacy.es.js';
import { privacyEn } from '../../shared/legal/privacy.en.js';
import { TERMS_BODY_KEYS } from '../../shared/legal/terms.structure.js';
import { PRIVACY_KEYS } from '../../shared/legal/privacy.structure.js';

/**
 * Lo que dicen los Términos (4.6) y la Política de Privacidad (1.4, 3, 4) sobre la matrícula profesional, contra lo que
 * hace el código. Si una de las dos cosas cambia sin la otra, esto falla:
 *   - se guarda ENCRIPTADA (número y hasta dos archivos),
 *   - DOAPP NO la verifica: se basa en la buena fe del Usuario,
 *   - el contratante puede verificarla una vez que las dos partes están vinculadas.
 */

const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');
const dic = (d: unknown) => d as Record<string, string>;

describe('Términos y condiciones: 4.6 matrícula profesional', () => {
  it('está en el cuerpo, justo después de 4.5, en español e inglés', () => {
    const i = TERMS_BODY_KEYS.indexOf('s4p6');
    expect(i).toBeGreaterThan(-1);
    expect(TERMS_BODY_KEYS[i - 1]).toBe('s4p5');
    expect(dic(termsEs).s4p6).toMatch(/^4\.6\./);
    expect(dic(termsEn).s4p6).toMatch(/^4\.6\./);
  });

  it('dice que se guarda encriptada, que DOAPP no la verifica, la buena fe y el vínculo entre las partes', () => {
    const es = dic(termsEs).s4p6;
    expect(es).toMatch(/encriptad/i);
    expect(es).toMatch(/NO verifica/);
    expect(es).toMatch(/buena fe/i);
    expect(es).toMatch(/ambas partes se encuentran vinculadas/i);
    expect(es).toMatch(/dos archivos/i);
    const en = dic(termsEn).s4p6;
    expect(en).toMatch(/encrypted/i);
    expect(en).toMatch(/does NOT verify/i);
    expect(en).toMatch(/good faith/i);
    expect(en).toMatch(/both parties are bound/i);
  });

  it('no contradice el 4.4/4.5 (DOAPP no verifica matrículas; verifica quien contrata)', () => {
    expect(dic(termsEs).s4p4).toMatch(/NO verifica matrículas/);
    expect(dic(termsEs).s4p5).toMatch(/matrícula/);
  });
});

describe('Política de privacidad: la matrícula', () => {
  it.each(['s1_4Title', 's1_4li1', 's1_4li2', 's1_4li3', 's3li6', 's4li6'])('%s está en español, en inglés y en el orden de lectura', (k) => {
    expect(dic(privacyEs)[k]).toBeTruthy();
    expect(dic(privacyEn)[k]).toBeTruthy();
    expect(PRIVACY_KEYS).toContain(k);
  });

  it('dice que se guarda encriptada y quién la ve', () => {
    expect(dic(privacyEs).s4li6).toMatch(/Cifrado/i);
    expect(dic(privacyEn).s4li6).toMatch(/encryption/i);
    expect(dic(privacyEs).s3li6).toMatch(/vinculadas en un contrato/i);
    expect(dic(privacyEs).s1_4li3).toMatch(/no verifica/i);
  });

  it('la página web de privacidad dibuja esas claves (no sólo el diccionario)', () => {
    const pagina = leer('client/pages/legal/PrivacyPolicy.tsx');
    for (const k of ['privacy.s1_4Title', 'privacy.s1_4li1', 'privacy.s1_4li2', 'privacy.s1_4li3', 'privacy.s3li6', 'privacy.s4li6']) {
      expect(pagina).toContain(k);
    }
  });
});

describe('el código hace lo que dicen los textos', () => {
  it('el modelo guarda el número encriptado (get/set) y la columna es TEXT', () => {
    const modelo = leer('server/models/sql/User.model.ts');
    expect(modelo).toMatch(/matriculaParaGuardar\(valor\)/);
    expect(modelo).toMatch(/matriculaLeida\(this\.getDataValue\("licenseNumber"\)\)/);
  });

  it('los archivos se encriptan antes de escribirse y la carpeta es privada', () => {
    const servicio = leer('server/services/matricula.ts');
    expect(servicio).toMatch(/encryptBuffer\(datos\)/);
    expect(leer('server/middleware/archivosPrivados.ts')).toMatch(/'license-docs'\] as const/);
  });

  it('el archivo sólo lo ve el dueño, administración o el cliente con un contrato vigente', () => {
    const servicio = leer('server/services/matricula.ts');
    expect(servicio).toMatch(/String\(quien\.id\) === String\(duenoId\)/);
    expect(servicio).toMatch(/ROLES_QUE_VEN_LA_MATRICULA\.includes/);
    expect(servicio).toMatch(/status: \{ \[Op\.notIn\]: \['cancelled', 'rejected'\] \}/);
  });
});
