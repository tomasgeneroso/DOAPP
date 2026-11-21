jest.mock('../services/api', () => ({ post: jest.fn(), get: jest.fn() }));

import { readFileSync } from 'fs';
import { join } from 'path';
import { puedePagarElContrato } from '../services/pagos';
import { esContraoferta, precioDeUnLugar } from '../../shared/jobs/precioDelLugar';

/**
 * La app del celular al día con la web (pedido del dueño, 2026-11-21): trabajos de varios lugares, contrato ya pago, custodia plegable, recordatorio de confirmar y «Hubo problemas
 * durante el trabajo». Lo que decide el servidor ya llegaba solo; esto es lo que faltaba dibujar en la app.
 */
const RAIZ = join(__dirname, '..');
const leer = (ruta: string) => readFileSync(join(RAIZ, ruta), 'utf8').split('\r\n').join('\n');

describe('contrato cubierto por la publicación', () => {
  const contrato = (over: Record<string, unknown> = {}) => ({ status: 'accepted', paymentStatus: 'pending', paymentMode: 'escrow', ...over });

  it('si el presupuesto ya se pagó al publicar, la app NO ofrece pagar el contrato (antes pedía $5.000 más)', () => {
    expect(puedePagarElContrato(contrato({ cubiertoPorLaPublicacion: true }), true)).toBe(false);
    expect(puedePagarElContrato(contrato({ cubiertoPorLaPublicacion: false }), true)).toBe(true);
    expect(puedePagarElContrato(contrato(), true)).toBe(true);
  });

  it('la pantalla del contrato dice que el pago ya está hecho', () => {
    const f = leer('app/contracts/[id].tsx');
    expect(f).toContain("testID=\"contrato-ya-pago\"");
    expect(f).toContain('cubiertoPorLaPublicacion');
  });
});

describe('precio de un lugar', () => {
  it('un trabajo de $10.000 para 2 trabajadores: $5.000 cada uno y pedirlo no es contraoferta', () => {
    expect(precioDeUnLugar({ price: 10000, maxWorkers: 2 })).toBe(5000);
    expect(esContraoferta({ price: 10000, maxWorkers: 2 }, 5000)).toBe(false);
    expect(esContraoferta({ price: 10000, maxWorkers: 2 }, 10000)).toBe(true);
  });

  it('la pantalla de postulación arranca con el precio de un lugar y avisa el reparto y si puede empezar con menos', () => {
    const f = leer('app/job/apply/[id].tsx');
    expect(f).toContain('setProposedPrice(precioDeUnLugar(res.job)');
    expect(f).toContain('testID="aviso-varios-lugares"');
    expect(f).toContain('se divide entre los trabajadores');
    expect(f).toContain('partialStartAllowed');
  });

  it('al elegir a un trabajador de un trabajo de varios lugares hay «elegir y esperar» y «elegir y empezar»', () => {
    const f = leer('app/proposals/[id].tsx');
    expect(f).toContain("'Elegir y esperar al resto'");
    expect(f).toContain("'Elegir y empezar con los elegidos'");
    expect(f).toContain('/start-with-current');
  });
});

describe('confirmar el trabajo y problemas', () => {
  it('la custodia se despliega con un toque', () => {
    const f = leer('components/LiquidacionDelPago.tsx');
    expect(f).toContain('accessibilityState={{ expanded: abierto }}');
    expect(f).toContain('testID="liquidacion-del-pago-titulo"');
    expect(f).toContain('{abierto && (');
  });

  it('el trabajador ve el recordatorio y quien contrató ve «Hubo problemas durante el trabajo»', () => {
    expect(leer('components/RecordatorioDeConfirmacion.tsx')).toContain('Completé el trabajo');
    const h = leer('components/HuboProblemas.tsx');
    expect(h).toContain('Hubo problemas durante el trabajo');
    expect(h).toContain("pathname: '/disputes/create'");
    for (const c of ['incomplete_work', 'service_not_delivered', 'quality_issues', 'other']) expect(h).toContain(c);
    const contrato = leer('app/contracts/[id].tsx');
    expect(contrato).toContain('<RecordatorioDeConfirmacion />');
    expect(contrato).toContain('<HuboProblemas');
    expect(leer('app/disputes/create.tsx')).toContain('categoriaDeLaUrl');
  });

  it('en el trabajo hay una sola lista «Trabajadores del proyecto» con la confirmación de cada uno', () => {
    const f = leer('app/job/[id].tsx');
    expect(f).toContain('Trabajadores del proyecto (');
    expect(f).toContain('testID="confirmar-trabajo-de-este-trabajador"');
    expect(f).toContain('getAllContractsByJob');
    expect(f).toContain('testID="confirmar-trabajo"');
  });
});
