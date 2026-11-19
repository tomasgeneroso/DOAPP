import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { esContraoferta, lugaresDelTrabajo, precioDeUnLugar } from '../shared/jobs/precioDelLugar';
import { contratoCubiertoPorLaPublicacion } from '../shared/pagos/contratoCubierto';

/**
 * Pedidos del dueño, 2026-11-20: trabajos de varios lugares (la «contraoferta» falsa, el segundo pago de $5.000, el aviso antes de postularse y el reparto del total),
 * comprobantes del pago dentro de «Detalles del pago (equipo)», todo el panel en vivo y «El pago está en custodia» plegable.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('precio de un lugar', () => {
  it('un trabajo de $10.000 para 2 trabajadores paga $5.000 a cada uno', () => {
    expect(lugaresDelTrabajo({ maxWorkers: 2 })).toBe(2);
    expect(precioDeUnLugar({ price: 10000, maxWorkers: 2 })).toBe(5000);
    expect(precioDeUnLugar({ price: '10001', maxWorkers: 3 })).toBe(3333.67);
  });

  it('con un solo lugar (o sin dato) es el precio publicado entero', () => {
    expect(lugaresDelTrabajo({})).toBe(1);
    expect(lugaresDelTrabajo({ maxWorkers: 1 })).toBe(1);
    expect(precioDeUnLugar({ price: 7000 })).toBe(7000);
  });

  it('pedir exactamente el precio de un lugar NO es una contraoferta; pedir otro importe sí', () => {
    expect(esContraoferta({ price: 10000, maxWorkers: 2 }, 5000)).toBe(false);
    expect(esContraoferta({ price: 10000, maxWorkers: 2 }, '5000')).toBe(false);
    expect(esContraoferta({ price: 10000, maxWorkers: 2 }, 4000)).toBe(true);
    // un trabajo de un lugar: sigue igual que antes
    expect(esContraoferta({ price: 7000, maxWorkers: 1 }, 7000)).toBe(false);
    expect(esContraoferta({ price: 7000, maxWorkers: 1 }, 8000)).toBe(true);
  });

  it('el servidor, las cotizaciones y la pantalla del trabajo usan la misma cuenta', () => {
    expect(leer('server/routes/proposals.ts')).toContain('esContraoferta(job, proposedPrice)');
    expect(leer('server/routes/quotes.ts')).toContain('esContraoferta(trabajo, total)');
    expect(leer('client/pages/JobDetail.tsx')).toContain('esContraoferta(job, proposal.proposedPrice)');
  });
});

describe('un contrato que sale del presupuesto ya pagado no se cobra otra vez', () => {
  const trabajoPago = { publicationPaid: true, price: 10000 };

  it('cada uno de los 2 contratos de $5.000 está cubierto por la publicación de $10.000', () => {
    expect(contratoCubiertoPorLaPublicacion({ price: 5000, status: 'pending' }, trabajoPago)).toBe(true);
    expect(contratoCubiertoPorLaPublicacion({ price: '5000.00', status: 'accepted' }, trabajoPago)).toBe(true);
  });

  it('no está cubierto si la publicación no se pagó, si el contrato se cayó o si pasa del presupuesto', () => {
    expect(contratoCubiertoPorLaPublicacion({ price: 5000, status: 'pending' }, { publicationPaid: false, price: 10000 })).toBe(false);
    expect(contratoCubiertoPorLaPublicacion({ price: 5000, status: 'cancelled' }, trabajoPago)).toBe(false);
    expect(contratoCubiertoPorLaPublicacion({ price: 12000, status: 'pending' }, trabajoPago)).toBe(false);
    expect(contratoCubiertoPorLaPublicacion(null, trabajoPago)).toBe(false);
  });

  it('la ruta de pago del contrato lo frena, la ficha del contrato lo informa y la pantalla no pide pagar', () => {
    expect(leer('server/routes/payments.ts')).toContain('CUBIERTO_POR_LA_PUBLICACION');
    expect(leer('server/routes/contracts.ts')).toContain('plano.cubiertoPorLaPublicacion');
    const resumen = leer('client/pages/ContractSummary.tsx');
    expect(resumen).toContain('cubiertoPorLaPublicacion');
    expect(resumen).toContain("'contrato-ya-pago'");
    expect(resumen).toContain('{isClient && !cubierto && (');
  });

  it('un trabajador no tiene dos contratos vigentes en el mismo trabajo', () => {
    expect(leer('server/routes/proposals.ts')).toContain("code: 'CONTRATO_YA_EXISTE'");
  });
});

describe('antes de postularse y al elegir', () => {
  it('«Resumen de Aplicación» aclara que es un trabajo de varios trabajadores, el reparto y si puede empezar con menos', () => {
    const f = leer('client/pages/JobApplicationSummary.tsx');
    expect(f).toContain('data-testid="aviso-varios-lugares"');
    expect(f).toContain('data-testid="total-dividido"');
    expect(f).toContain('se divide entre los trabajadores');
    expect(f).toContain('puedeEmpezarConMenos');
    expect(f).toContain('<WorkerNetAmount price={precioPorLugar}');
  });

  it('la pantalla del trabajo avisa lo mismo antes del botón de postularse', () => {
    expect(leer('client/pages/JobDetail.tsx')).toContain('data-testid="aviso-previo-varios-lugares"');
  });

  it('al elegir desde el mensaje de un trabajo de varios lugares hay «elegir y esperar» y «elegir y empezar»', () => {
    const f = leer('client/components/chat/SystemMessageCard.tsx');
    expect(f).toContain('data-testid="elegir-y-esperar"');
    expect(f).toContain('data-testid="elegir-y-empezar"');
    expect(f).toContain('/start-with-current');
  });
});

describe('«Detalles del pago (equipo)» y el panel en vivo', () => {
  it('la vista de la publicación lista todos los comprobantes (del cliente y del equipo) y deja agregar uno', () => {
    const jd = leer('client/pages/JobDetail.tsx');
    expect(jd).toContain('<ComprobantesDelPagoEquipo');
    const c = leer('client/components/jobs/ComprobantesDelPagoEquipo.tsx');
    expect(c).toContain('/api/admin/payments/${paymentId}/proofs');
    expect(c).toContain('/api/admin/payments/upload-proof');
    expect(c).toContain('/admin-proof');
    expect(c).toContain('data-testid="agregar-comprobante"');
    expect(c).toContain('useCambiosDeAdministracion');
  });

  it('una postulación cambia lo que ven el equipo, el dueño y los demás postulantes (propuestas y trabajos avisan)', () => {
    const s = leer('server/services/avisosPorCambios.ts');
    expect(s).toContain("delAdministrador('job', p.jobId)");
    expect(s).toContain("evento: 'job:updated', datos: { jobId: p.jobId }");
    expect(s).toContain("status: ['pending', 'approved']");
  });

  it('la pantalla del trabajo se actualiza sola con las postulaciones y con los cambios del equipo, sin tapar todo con el círculo', () => {
    const jd = leer('client/pages/JobDetail.tsx');
    expect(jd).toContain("useEventoEnVivo('proposal:updated'");
    expect(jd).toContain("useCambiosDeAdministracion(['job', 'contract', 'payment']");
    expect(jd).toContain('const primeraCarga = trabajoYaCargado.current !== id;');
  });

  it('«El pago está en custodia de DOAPP» se despliega con un toque', () => {
    const f = leer('client/components/LiquidacionDelPago.tsx');
    expect(f).toContain('aria-expanded={abierto}');
    expect(f).toContain('data-testid="liquidacion-del-pago-titulo"');
    expect(f).toContain('<Transicion mostrar={abierto}>');
  });
});
