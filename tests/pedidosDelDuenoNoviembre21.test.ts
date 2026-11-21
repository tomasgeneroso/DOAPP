import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pedidos del dueño, 2026-11-21: menú de Marketing, tickets (estado, respuestas y avisos en vivo), reclamos entre partes visibles en el panel con su plazo y pasaje a mediación,
 * el reclamo de cada trabajador en «Trabajadores del proyecto» y la devolución manual bloqueada cuando la cancelación ya devolvió el pago.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('menú de administración: Marketing', () => {
  const m = leer('client/pages/admin/AdminLayout.tsx');
  const grupo = m.slice(m.indexOf('label: "marketing"'), m.indexOf('label: "padrones"'));

  it('Correos a usuarios, Agente de contenido y Códigos e invitaciones están en el grupo Marketing', () => {
    expect(grupo).toContain('/admin/correos');
    expect(grupo).toContain('/admin/content-agent');
    expect(grupo).toContain('/admin/codigos');
  });

  it('ya no están en Operaciones ni en Finanzas', () => {
    const operaciones = m.slice(m.indexOf('label: "operations"'), m.indexOf('label: "marketing"'));
    const finanzas = m.slice(m.indexOf('label: "finance"'), m.indexOf('label: "support"'));
    for (const ruta of ['/admin/correos', '/admin/content-agent', '/admin/codigos']) {
      expect(operaciones).not.toContain(ruta);
      expect(finanzas).not.toContain(ruta);
    }
    expect(m).toContain("marketing: t('admin.sections.marketing', 'Marketing')");
  });
});

describe('tickets', () => {
  it('la respuesta del equipo se guarda con una lista nueva y avisa a Sequelize (antes el aviso salía pero el mensaje no se guardaba)', () => {
    const r = leer('server/routes/admin/tickets.ts');
    expect(r).toContain("ticket.changed('messages', true)");
    expect(r).not.toContain('messages.push(');
  });

  it('el aviso de respuesta y el de cierre llevan a la pantalla de quien abrió el ticket, no a la del panel', () => {
    const r = leer('server/routes/admin/tickets.ts');
    expect(r).not.toContain('actionUrl: `/admin/tickets/${ticket.id}`');
    expect(r).toContain('actionUrl: `/tickets/${ticket.id}`');
  });

  it('el ticket avisa en vivo a quien lo abrió y a quien lo atiende, y las dos pantallas escuchan', () => {
    expect(leer('server/services/avisosPorCambios.ts')).toContain("evento: 'ticket:updated'");
    expect(leer('client/pages/TicketDetail.tsx')).toContain("'ticket:updated'");
    expect(leer('mobile/app/tickets/[id].tsx')).toContain("'ticket:updated'");
  });

  it('el panel muestra un solo modo de escritura que sigue a la pestaña (antes había dos «notas internas») y avisa si el servidor rechaza un cambio', () => {
    const t = leer('client/pages/admin/TicketDetail.tsx');
    expect(t).toContain('const isInternal = activeTab === "notes"');
    expect(t).not.toContain('setIsInternal');
    expect(t).toContain('data-testid="modo-de-escritura"');
    expect(t).toContain('if (!res?.success) alert(');
    expect(leer('client/lib/adminApi.ts')).toContain("cache: 'no-store'");
  });
});

describe('reclamos', () => {
  it('el panel ve los reclamos entre las partes: tarjeta, filtro, tiempo que queda y «Pasar a mediación»', () => {
    const d = leer('client/pages/admin/AdminDisputeManager.tsx');
    expect(d).toContain('data-testid="tarjeta-entre-las-partes"');
    expect(d).toContain('<option value="negotiation">');
    expect(d).toContain('PlazoEntreLasPartes');
    expect(d).toContain('data-testid="pasar-a-mediacion"');
    expect(d).toContain('/intervenir');
  });

  it('en «Trabajadores del proyecto» cada trabajador tiene el enlace a SU reclamo (web y app)', () => {
    expect(leer('server/routes/contracts.ts')).toContain("disputeId: (c as any).disputeId ?? null");
    expect(leer('client/pages/JobDetail.tsx')).toContain('data-testid="reclamo-de-este-trabajador"');
    expect(leer('mobile/app/job/[id].tsx')).toContain('testID="reclamo-de-este-trabajador"');
  });
});

describe('devolver dinero después de una cancelación', () => {
  it('el servidor no deja devolver a mano un pago que la cancelación ya devolvió, y el modal lo explica', () => {
    const p = leer('server/routes/admin/payments.ts');
    expect(p).toContain('YA_DEVUELTO_POR_CANCELACION');
    expect((p.match(/devolucionPorCancelacion\(/g) || []).length).toBeGreaterThanOrEqual(4); // definición + /refund + refund-info + refund-transfer
    const m = leer('client/components/admin/RefundModal.tsx');
    expect(m).toContain('data-testid="devolucion-bloqueada"');
    expect(m).toContain('!!info?.bloqueo');
  });
});

describe('vista del trabajo y del contrato (segundo pedido del 2026-11-21)', () => {
  it('«Detalles de Pago»: un lugar sin trabajador muestra su parte automática (el total en partes iguales), no $0', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('const automatico = precioDeUnLugar(job as any)');
    expect(j).toContain('data-testid="reparto-automatico-ayuda"');
    expect(j).toContain('monto automático');
  });

  it('con equipo pero sin contrato propio, «Información del trabajo» muestra quién terminó y quién tiene reclamo', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('data-testid="confirmaciones-del-equipo"');
    expect(j).toContain('data-testid="en-reclamo-de-este-trabajador"');
  });

  it('quien contrató puede confirmar a todos los trabajadores de una vez («todo el trabajo terminó») además de uno por uno', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('handleConfirmarTodos');
    expect(j).toContain('data-testid="confirmar-todo-el-trabajo-boton"');
    // solo los que están en marcha y todavía no confirmó quien contrató
    expect(j).toContain('!c.clientConfirmed');
  });

  it('el reclamo se ve también desde el contrato (web y app)', () => {
    expect(leer('client/pages/ContractDetail.tsx')).toContain('data-testid="ver-el-reclamo-del-contrato"');
    expect(leer('mobile/app/contracts/[id].tsx')).toContain('testID="ver-el-reclamo-del-contrato"');
  });

  it('«Puntuación total» se despliega (y no anida un botón dentro de otro)', () => {
    const m = leer('client/components/user/MultipleRatings.tsx');
    expect(m).toContain('data-testid="puntuacion-total"');
    expect(m).toContain('aria-expanded={abierto}');
    expect(m).toContain('{abierto && (');
    expect(m).toContain('role="button"');
  });

  it('los mensajes de reclamos y de tickets avisan con una notificación a quien no los escribió', () => {
    const s = leer('server/services/avisosDeMensajes.ts');
    expect(s).toContain('avisarMensajeDeReclamo');
    expect(s).toContain('avisarMensajeDeTicket');
    expect(leer('server/routes/disputes.ts')).toContain('avisarMensajeDeReclamo');
    expect(leer('server/routes/admin/disputes.ts')).toContain('avisarMensajeDeReclamo');
    expect(leer('server/routes/tickets.ts')).toContain('avisarMensajeDeTicket');
    expect(leer('server/routes/admin/tickets.ts')).toContain('avisarMensajeDeTicket');
  });
});
