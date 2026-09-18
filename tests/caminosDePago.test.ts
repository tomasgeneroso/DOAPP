import { caminosDePago, rangoDelTrabajador } from '../shared/pricing/paymentPaths.js';

/**
 * Los caminos de pago: el cliente paga lo mismo por todos; cambia lo que
 * recibe el trabajador y cuando. Y no se inventan tarifas: un camino sin
 * numero configurado no se muestra.
 */
describe('caminos de pago', () => {
  const config = {
    tarjeta_credito: { rate: 0.0507, liberacionDias: 10 },
    tarjeta_debito: { rate: null, liberacionDias: 0 },
    dinero_en_cuenta: { rate: 0.03, liberacionDias: 0 },
  };

  it('el cliente paga lo mismo por cualquier camino', () => {
    const c = caminosDePago(36000, 3600, 756, config);
    expect(c.length).toBe(2);
    for (const x of c) expect(x.clientePaga).toBeCloseTo(40356, 2);
  });

  it('un camino sin tarifa configurada no se muestra', () => {
    const c = caminosDePago(36000, 3600, 756, config);
    expect(c.map((x) => x.id)).not.toContain('tarjeta_debito');
  });

  it('ordena del que mas le conviene al trabajador al que menos', () => {
    const c = caminosDePago(36000, 3600, 756, config);
    expect(c[0].id).toBe('dinero_en_cuenta');
    expect(c[0].trabajadorRecibe).toBeGreaterThan(c[1].trabajadorRecibe);
    expect(c[0].liberacionDias).toBe(0);
    expect(c[1].liberacionDias).toBe(10);
  });

  it('la pasarela se calcula sobre el total cobrado y la absorbe el trabajador', () => {
    const c = caminosDePago(36000, 3600, 756, config);
    const credito = c.find((x) => x.id === 'tarjeta_credito')!;
    expect(credito.pasarela).toBeCloseTo(40356 * 0.0507, 1);
    expect(credito.trabajadorRecibe).toBeCloseTo(36000 - 40356 * 0.0507, 1);
    expect(credito.ratePct).toBe(5.07);
  });

  it('el rango dice si vale la pena mostrar dos numeros', () => {
    const c = caminosDePago(36000, 3600, 756, config);
    const r = rangoDelTrabajador(c);
    expect(r.varia).toBe(true);
    expect(r.max).toBeGreaterThan(r.min);

    const solo = caminosDePago(36000, 3600, 756, { ...config, dinero_en_cuenta: { rate: null, liberacionDias: 0 } });
    expect(rangoDelTrabajador(solo).varia).toBe(false);
    expect(rangoDelTrabajador([]).varia).toBe(false);
  });
});
