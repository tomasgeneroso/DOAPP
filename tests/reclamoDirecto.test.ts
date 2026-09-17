import { estadoDelReclamo, plazoDeReclamo, TIPOS_DE_ACUERDO } from '../shared/disputes/reclamo.js';
import { POLITICAS } from '../shared/constants/policies.js';
import { termsEs } from '../shared/legal/terms.es.js';
import { termsEn } from '../shared/legal/terms.en.js';
import { disputesEs } from '../shared/legal/disputes.es.js';
import { TERMS_BODY_KEYS } from '../shared/legal/terms.structure.js';

/**
 * Reclamo directo: 72 h entre las partes antes de que intervenga un admin.
 * Lo que se prueba es la regla, no la base: quien puede escalar, cuando, y
 * que el texto legal diga el mismo numero que el codigo.
 */
describe('reclamo directo: reloj y permisos', () => {
  const CLIENTE = 'c1';
  const TRABAJADOR = 't1';
  const abierto = new Date('2026-09-10T12:00:00Z');
  const h = (n: number) => new Date(abierto.getTime() + n * 3_600_000);

  const base = {
    status: 'negotiation',
    initiatedBy: CLIENTE,
    against: TRABAJADOR,
    createdAt: abierto,
    messages: [] as any[],
    agreementProposal: null,
  };

  it('el plazo es RECLAMO_DIRECTO_HORAS desde la apertura', () => {
    expect(plazoDeReclamo(abierto).getTime()).toBe(h(POLITICAS.RECLAMO_DIRECTO_HORAS).getTime());
    expect(POLITICAS.RECLAMO_DIRECTO_HORAS).toBe(72);
  });

  it('el reclamante no puede escalar mientras la otra parte no respondio y hay tiempo', () => {
    const e = estadoDelReclamo(base, CLIENTE, h(10));
    expect(e.enReclamoDirecto).toBe(true);
    expect(e.laOtraRespondio).toBe(false);
    expect(e.puedeEscalar).toBe(false);
    expect(e.motivoNoEscalar).toMatch(/todavia tiene/);
    expect(e.esReclamante).toBe(true);
  });

  it('el reclamado tampoco puede escalar sin haber respondido: primero cuenta su version', () => {
    const e = estadoDelReclamo(base, TRABAJADOR, h(10));
    expect(e.puedeEscalar).toBe(false);
    expect(e.motivoNoEscalar).toMatch(/Responde primero/);
  });

  it('en cuanto la otra parte responde, cualquiera puede pedir que intervenga un admin', () => {
    const conRespuesta = { ...base, messages: [{ from: TRABAJADOR, createdAt: h(2) }] };
    expect(estadoDelReclamo(conRespuesta, CLIENTE, h(3)).puedeEscalar).toBe(true);
    expect(estadoDelReclamo(conRespuesta, TRABAJADOR, h(3)).puedeEscalar).toBe(true);
  });

  it('un mensaje de un admin no cuenta como respuesta de la parte', () => {
    const conAdmin = { ...base, messages: [{ from: 'admin1', isAdmin: true, createdAt: h(2) }] };
    expect(estadoDelReclamo(conAdmin, CLIENTE, h(3)).laOtraRespondio).toBe(false);
  });

  it('vencido el plazo se puede escalar aunque nadie haya respondido', () => {
    const e = estadoDelReclamo(base, CLIENTE, h(73));
    expect(e.vencido).toBe(true);
    expect(e.textoRestante).toBe('vencido');
    expect(e.puedeEscalar).toBe(true);
  });

  it('un tercero no puede escalar ni aceptar', () => {
    const e = estadoDelReclamo({ ...base, agreementProposal: { propuestoPor: CLIENTE } }, 'otro', h(1));
    expect(e.puedeEscalar).toBe(false);
    expect(e.puedeAceptarPropuesta).toBe(false);
  });

  it('solo la parte que NO propuso puede aceptar', () => {
    const conPropuesta = { ...base, agreementProposal: { propuestoPor: CLIENTE } };
    expect(estadoDelReclamo(conPropuesta, CLIENTE, h(1)).puedeAceptarPropuesta).toBe(false);
    expect(estadoDelReclamo(conPropuesta, TRABAJADOR, h(1)).puedeAceptarPropuesta).toBe(true);
  });

  it('si ya escalo, nadie acepta ni escala desde el reclamo', () => {
    const escalada = { ...base, status: 'open', agreementProposal: { propuestoPor: CLIENTE } };
    const e = estadoDelReclamo(escalada, TRABAJADOR, h(80));
    expect(e.enReclamoDirecto).toBe(false);
    expect(e.puedeEscalar).toBe(false);
    expect(e.puedeAceptarPropuesta).toBe(false);
  });

  it('el texto del reloj se lee', () => {
    expect(estadoDelReclamo(base, CLIENTE, h(0)).textoRestante).toBe('3 d');
    expect(estadoDelReclamo(base, CLIENTE, h(50)).textoRestante).toBe('22 h');
    expect(estadoDelReclamo(base, CLIENTE, h(30)).textoRestante).toBe('1 d 18 h');
  });

  it('cada tipo de acuerdo explica que pasa con la plata y el contrato', () => {
    for (const k of Object.keys(TIPOS_DE_ACUERDO) as Array<keyof typeof TIPOS_DE_ACUERDO>) {
      expect(TIPOS_DE_ACUERDO[k].titulo.length).toBeGreaterThan(10);
      expect(TIPOS_DE_ACUERDO[k].explicacion.length).toBeGreaterThan(40);
    }
    expect(TIPOS_DE_ACUERDO.reembolso_total.explicacion).toMatch(/comision de publicacion no se devuelve/i);
  });
});

describe('reclamo directo: el texto legal dice lo mismo que el codigo', () => {
  it('T&C 10.11 existe en los dos idiomas, esta en la estructura y nombra las horas', () => {
    expect(TERMS_BODY_KEYS).toContain('s10p11');
    for (const t of [termsEs.s10p11, termsEn.s10p11]) {
      expect(t).toBeTruthy();
      expect(t).toContain(String(POLITICAS.RECLAMO_DIRECTO_HORAS));
      expect(t).toMatch(/7\.5/);
      expect(t).toMatch(/10\.2/);
    }
  });

  it('la pagina de resolucion de disputas ya no promete 48 horas ni 3-5 dias habiles', () => {
    const todo = Object.values(disputesEs).join(' ');
    expect(todo).not.toMatch(/48 horas/);
    expect(todo).not.toMatch(/3-5 d[ií]as h[aá]biles/);
    expect(disputesEs.step2p).toContain(String(POLITICAS.RECLAMO_DIRECTO_HORAS));
    expect(disputesEs.step3note).toContain(String(POLITICAS.DISPUTA_OBJETIVO_RESOLUCION_DIAS));
  });
});
