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

describe('quién terminó, quién aceptó y reclamos en la vista del trabajo y del contrato (tercer pedido del 2026-11-21)', () => {
  it('«Trabajando en este proyecto», «Partes del contrato» y el contrato muestran si terminó, si aceptó y si hay reclamo', () => {
    const e = leer('client/components/contracts/EstadoDeConfirmaciones.tsx');
    expect(e).toContain('Terminó el trabajo');
    expect(e).toContain('Aceptó el trabajo');
    expect(e).toContain('data-testid="estado-en-reclamo"');
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('contratoDeTrabajador(worker.id)');
    expect(j).toContain('data-testid="partes-del-equipo"');
    expect(j).toContain('data-testid="cliente-acepto-n-de-n"');
    expect(leer('client/pages/ContractDetail.tsx')).toContain('<EstadoDeConfirmaciones');
    expect(leer('mobile/app/contracts/[id].tsx')).toContain('<EstadoDeConfirmaciones');
  });

  it('el trabajador llega a su contrato desde la vista del trabajo (el enlace es solo del contrato propio; quien contrató abre cualquiera)', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('const puedeAbrirElContrato');
    expect(j).toContain('contractId={puedeAbrirElContrato(');
  });

  it('el aviso «el contrato va a aparecer» solo sale si de verdad no hay trabajador; con equipo elegido y el trabajo en curso se dice que no se pudo cargar y se puede reintentar', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('data-testid="contrato-no-cargo"');
    expect(j).toContain('data-testid="reintentar-contrato"');
  });

  it('«Confirmar que todo el trabajo terminó» también está donde se ve el equipo sin contrato propio', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('const renderConfirmarTodo');
    expect((j.match(/renderConfirmarTodo\(\)/g) || []).length).toBeGreaterThanOrEqual(2);
  });

  it('el lugar libre dice qué es: «libre / todavía sin trabajador elegido» (antes «sin asignar» no se entendía)', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('todavía sin trabajador elegido · monto automático');
    expect(j).not.toContain('" · sin asignar"');
  });

  it('un error al leer los avisos de problemas no rompe el contrato ni la lista del equipo', () => {
    const s = leer('server/services/problemasDelTrabajo.ts');
    expect((s.match(/\} catch \(error\) \{/g) || []).length).toBeGreaterThanOrEqual(3);
  });
});

describe('reclamos, código de emparejamiento, vista única y chat del equipo (cuarto pedido, 2026-11-22)', () => {
  it('cerrar un reclamo por acuerdo o retirarlo deja quién lo cerró (la base lo exige: chk_resolution_fields), y «No acepto» pasa a un administrador', () => {
    const r = leer('server/services/reclamoDirecto.ts');
    expect(r).toContain('d.resolvedBy = String(userId)');
    expect(r).not.toContain('d.resolvedBy = null as any');
    expect(r).toContain("escalarReclamo(d, { sistema: 'propuesta_rechazada' })");
    // si se cierra el cuadro de «No acepto» sin responder, no se rechaza nada
    expect(leer('client/components/disputes/ReclamoDirectoPanel.tsx')).toContain('if (n === null) return;');
  });

  it('el panel de reclamos muestra las partes (el servidor manda initiator/defendant) y los nombres llevan al perfil', () => {
    const m = leer('client/pages/admin/AdminDisputeManager.tsx');
    expect(m).toContain('normalizarReclamo');
    expect(m).toContain('data-testid="parte-que-reclama"');
    expect(leer('client/pages/DisputeDetail.tsx')).toContain('data-testid="perfil-de-quien-reclama"');
    expect(leer('client/pages/admin/AdminDisputeDetail.tsx')).toContain('data-testid="perfil-de-quien-es-reclamado"');
    expect(leer('client/pages/admin/TicketDetail.tsx')).toContain('data-testid="perfil-de-quien-abrio-el-ticket"');
  });

  it('el código de emparejamiento lo ven todas las partes en el contrato y en el trabajo (web y app); cada trabajador solo el suyo en la lista del equipo', () => {
    expect(leer('client/components/contracts/CodigoDeEmparejamiento.tsx')).toContain('data-testid="codigo-de-emparejamiento"');
    expect(leer('client/pages/ContractDetail.tsx')).toContain('<CodigoDeEmparejamiento');
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('data-testid="codigos-del-equipo"');
    expect(leer('mobile/app/contracts/[id].tsx')).toContain('<CodigoDeEmparejamiento');
    expect(leer('server/routes/contracts.ts')).toContain("(isClient || isAdmin || String(c.doerId) === userId) ? ((c as any).pairingCode ?? null) : null");
  });

  it('una sola vista: el contrato vive dentro de la vista del trabajo y /contracts/:id lleva ahí a las partes', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('data-testid="seguimiento-del-contrato"');
    expect(j).toContain('<ContractDetail key={contratoDelSeguimiento.id} embebido');
    expect(j).toContain('data-testid="confirmar-trabajo-de-este-trabajador-seguimiento"');
    // los hooks del seguimiento van antes de los return tempranos
    expect(j.indexOf('useSearchParams()')).toBeLessThan(j.indexOf('  if (loading) {'));
    const c = leer('client/pages/ContractDetail.tsx');
    expect(c).toContain('embebido = false');
    expect(c).toContain('data-testid={embebido ?');
    expect(leer('client/pages/ContratoEnElTrabajo.tsx')).toContain('/jobs/${jobId}?contrato=');
    expect(leer('client/App.tsx')).toContain('./pages/ContratoEnElTrabajo');
  });

  it('chat del equipo: se crea al elegir, trae las novedades (también reclamos), se cierra al terminar el trabajo y se borra pasado el plazo', () => {
    const s = leer('server/services/chatDelEquipo.ts');
    for (const f of ['avisarAlChatDelEquipo', 'sincronizarChatDelEquipo', 'cerrarChatDelEquipo', 'barrerChatsDelEquipo', 'chatDelEquipoCerrado']) expect(s).toContain(f);
    expect(s).toContain('POLITICAS.DIAS_PARA_DISPUTAR');
    expect(leer('server/index.ts')).toContain('startChatsDelEquipoJob()');
    // las novedades salen de donde pasan las cosas
    for (const archivo of ['server/routes/contracts.ts', 'server/routes/disputes.ts', 'server/services/reclamoDirecto.ts', 'server/services/disputeResolution.ts', 'server/services/problemasDelTrabajo.ts', 'server/services/cicloDelContrato.ts', 'server/jobs/autoConfirmContracts.ts', 'server/routes/proposals.ts']) {
      expect(leer(archivo)).toContain('avisarContratoAlChatDelEquipo');
    }
    expect(leer('server/services/trabajoTerminado.ts')).toContain("cerrarChatDelEquipo(jobId, 'completado')");
    // cerrado: no se escribe (API y socket)
    expect(leer('server/routes/chat.ts')).toContain("code: 'CHAT_CERRADO'");
    expect(leer('server/services/socket.ts')).toContain('chatDelEquipoCerrado(conversation');
  });
});
