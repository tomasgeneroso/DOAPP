import { describe, it, expect } from '@jest/globals';
import { fechaYHoraLocal, instanteDeLoEscrito, valorDelCampoLocal } from '../shared/fechas/horaLocal';

/** Las horas trabajadas se cargan y se mandan con la hora del reloj de la persona, en cualquier zona (2026-11-28: salían 3 horas corridas). */
describe('horas en el reloj de la persona', () => {
  it('lo que se carga en el campo es la hora local, y volver a mandarlo da el mismo instante', () => {
    for (const instante of ['2026-11-27T22:30:00.000Z', '2026-12-31T23:59:00.000Z', '2026-01-01T00:05:00.000Z']) {
      const d = new Date(instante);
      const campo = valorDelCampoLocal(instante);
      expect(campo.slice(11)).toBe(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
      expect(Number(campo.slice(8, 10))).toBe(d.getDate());
      expect(instanteDeLoEscrito(campo)).toBe(instante);
    }
  });

  it('sin fecha o con algo que no se entiende, queda vacío', () => {
    expect([valorDelCampoLocal(null), fechaYHoraLocal('cualquier cosa').fecha, instanteDeLoEscrito('')]).toEqual(['', '', '']);
  });

  it('la web y la app cargan y mandan las horas con esta conversión', async () => {
    const fs = await import('node:fs');
    const web = fs.readFileSync('client/pages/ContractDetail.tsx', 'utf8');
    expect(web).not.toMatch(/setProposed(Start|End)\(contract\.\w+Date\?\.slice/);
    expect(web).toContain('proposedStartTime: instanteDeLoEscrito(proposedStart)');
    const app = fs.readFileSync('mobile/app/contracts/[id].tsx', 'utf8');
    expect(app).toContain('proposedStartTime: instanteDeLoEscrito(startISO)');
  });
});
