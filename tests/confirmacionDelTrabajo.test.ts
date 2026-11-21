import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Pedidos del dueño, 2026-11-21: la tarjeta «Trabajo en curso» deja de ofrecer «Completé el trabajo» cuando ya se confirmó y se actualiza en vivo; la lista de tareas compartida
 * no da error por pedir un estado que ya tiene; recordatorio al trabajador (al ser elegido, al empezar y en pantalla) y «Hubo problemas durante el trabajo» para quien contrató.
 */
const leer = (ruta: string) => readFileSync(join(process.cwd(), ruta), 'utf8').replace(/\r\n/g, '\n');

describe('confirmar el trabajo', () => {
  it('el servidor dice a cada trabajador cuál es SU contrato y si ya confirmó', () => {
    const s = leer('server/routes/jobs.ts');
    expect(s).toContain('miContrato:');
    expect(s).toContain("doerConfirmed: Boolean(miContrato.doerConfirmed)");
  });

  it('la tarjeta no vuelve a ofrecer el botón cuando ya confirmó, se actualiza en vivo y recarga sin tapar todo', () => {
    const f = leer('client/components/jobs/WorkInProgress.tsx');
    expect(f).toContain('miContrato?.doerConfirmed ?');
    expect(f).toContain('data-testid="trabajo-ya-confirmado"');
    expect(f).toContain("useEventoEnVivo(['job:updated', 'contract:updated', 'socket:reconectado']");
    expect(f).toContain('if (!silencioso) setLoading(true)');
  });

  it('pedir a una tarea el estado que ya tiene no es un error (la lista la comparten todos los trabajadores)', () => {
    const t = leer('server/routes/tasks.ts');
    expect(t).toContain('task.status === status');
    expect(t).toContain('sinCambios: true');
  });

  it('cambiar una tarea avisa en vivo al dueño y a todos los trabajadores del trabajo', () => {
    const s = leer('server/services/avisosPorCambios.ts');
    expect(s).toContain('const TAREAS: Fuente');
    expect(s).toContain("action: 'task_updated'");
    expect(leer('client/components/jobs/JobTasks.tsx')).toContain("data.action === 'task_updated'");
  });
});

describe('la vista del trabajo: una sola lista de trabajadores y el botón de quien contrató', () => {
  it('quien ve «Trabajadores del proyecto» no ve también «Trabajando en este proyecto»', () => {
    const jd = leer('client/pages/JobDetail.tsx');
    expect(jd).toContain('!((isOwnJob || isWorkerOnJob) && allContractsData && allContractsData.totalContracts > 1)');
  });

  it('la lista «Trabajadores del proyecto» de la barra lateral solo aparece con un trabajador (con más, ya está arriba)', () => {
    expect(leer('client/pages/JobDetail.tsx')).toContain('!(allContractsData.totalContracts > 1) && (');
  });

  it('quien contrató confirma a cada trabajador desde la lista, y puede confirmar en cuanto el trabajador avisó que terminó', () => {
    const jd = leer('client/pages/JobDetail.tsx');
    expect(jd).toContain('data-testid="confirmar-trabajo-de-este-trabajador"');
    expect(jd).toContain('handleConfirmarContratoDe');
    expect(jd).toContain('if (isOwnJob && (contractData.doerConfirmed || contractData.status === "awaiting_confirmation")) return true;');
  });
});

describe('recordatorio al trabajador y «Hubo problemas durante el trabajo»', () => {
  it('se recuerda al ser elegido y al empezar el trabajo que hay que tocar «Completé el trabajo» (se confirma solo a las 24 h si nadie se opone)', () => {
    expect(leer('server/routes/proposals.ts')).toContain('tocá «Completé el trabajo»');
    const c = leer('server/services/cicloDelContrato.ts');
    expect(c).toContain('tocá «Completé el trabajo»');
    expect(c).toContain('Hubo problemas durante el trabajo');
    expect(leer('client/components/contracts/RecordatorioDeConfirmacion.tsx')).toContain('Completé el trabajo');
  });

  it('el recordatorio se ve en la tarjeta, en el contrato y en el trabajo; el botón de problemas lo ve quien contrató', () => {
    expect(leer('client/components/jobs/WorkInProgress.tsx')).toContain('<RecordatorioDeConfirmacion');
    const cd = leer('client/pages/ContractDetail.tsx');
    expect(cd).toContain('<RecordatorioDeConfirmacion');
    expect(cd).toContain('{isClient && [');
    expect(cd).toContain('<HuboProblemas');
    const jd = leer('client/pages/JobDetail.tsx');
    expect(jd).toContain('<HuboProblemas');
    expect(jd).toContain('<RecordatorioDeConfirmacion');
  });

  it('«Hubo problemas durante el trabajo» abre el reclamo con la categoría elegida (lo que detiene la confirmación automática)', () => {
    const h = leer('client/components/contracts/HuboProblemas.tsx');
    expect(h).toContain('Hubo problemas durante el trabajo');
    expect(h).toContain('/disputes/create?contractId=');
    for (const c of ['incomplete_work', 'service_not_delivered', 'quality_issues', 'other']) expect(h).toContain(c);
    expect(leer('client/pages/CreateDispute.tsx')).toContain("searchParams.get('category')");
    // la confirmación automática solo mira contratos «esperando confirmación»: un reclamo pasa el contrato a «disputed»
    expect(leer('server/jobs/autoConfirmContracts.ts')).toContain("status: 'awaiting_confirmation'");
    expect(leer('server/routes/disputes.ts')).toContain('contract.status = "disputed"');
  });
});
