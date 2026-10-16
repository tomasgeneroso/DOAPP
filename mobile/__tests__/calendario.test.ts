import { semanasDelMes, textoDeFecha, formatearDia, diaParaElServidor } from '../services/calendario';

describe('calendario de la pantalla de publicar', () => {
  it('semanasDelMes: semanas de lunes a domingo, con huecos antes y después', () => {
    // Noviembre de 2026 empieza un domingo y tiene 30 días.
    const semanas = semanasDelMes(2026, 10);
    expect(semanas.every((s) => s.length === 7)).toBe(true);
    expect(semanas[0].slice(0, 6).every((d) => d === null)).toBe(true); // lunes a sábado vacíos
    expect(semanas[0][6]?.getDate()).toBe(1); // el domingo 1
    const dias = semanas.flat().filter(Boolean) as Date[];
    expect(dias).toHaveLength(30);
    expect(dias[29].getDate()).toBe(30);
    expect(dias.every((d) => d.getMonth() === 10)).toBe(true);
  });

  it('semanasDelMes: un mes que empieza lunes no tiene huecos al principio', () => {
    const semanas = semanasDelMes(2026, 5); // junio de 2026 empieza lunes
    expect(semanas[0][0]?.getDate()).toBe(1);
    expect(semanas.flat().filter(Boolean)).toHaveLength(30);
  });

  it('febrero de un año bisiesto tiene 29 días', () => {
    expect(semanasDelMes(2028, 1).flat().filter(Boolean)).toHaveLength(29);
    expect(semanasDelMes(2027, 1).flat().filter(Boolean)).toHaveLength(28);
  });

  it('textoDeFecha: día/mes/año y hora, o vacío', () => {
    expect(textoDeFecha(new Date(2026, 10, 4, 9, 5))).toBe('04/11/2026 09:05');
    expect(textoDeFecha(null)).toBe('');
  });

  it('formatearDia: pone las barras mientras se escribe y descarta lo que no es número', () => {
    expect(formatearDia('1')).toBe('1');
    expect(formatearDia('150')).toBe('15/0');
    expect(formatearDia('15062026')).toBe('15/06/2026');
    expect(formatearDia('15/06/2026 extra')).toBe('15/06/2026');
    expect(formatearDia('ab')).toBe('');
  });

  it('diaParaElServidor: solo fechas reales y completas', () => {
    expect(diaParaElServidor('15/06/2026')).toBe('2026-06-15');
    expect(diaParaElServidor('31/02/2026')).toBe(''); // no existe
    expect(diaParaElServidor('15/06/26')).toBe('');
    expect(diaParaElServidor('')).toBe('');
    expect(diaParaElServidor('29/02/2028')).toBe('2028-02-29');
    expect(diaParaElServidor('29/02/2027')).toBe('');
  });
});
