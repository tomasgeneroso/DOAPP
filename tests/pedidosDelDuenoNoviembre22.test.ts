import { describe, it, expect } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { cierreDeReclamo, etiquetaDelEstadoDelReclamo } from '../shared/disputes/estadoDeCierre.js';
import { leerIds, puedeSerEtiquetado } from '../server/services/etiquetasDePublicaciones.js';

/**
 * Pedidos del dueño del 2026-11-22 (segunda tanda): una sola sección del contrato, «confirmaste el trabajo de X», puntuación en tres pasos (primero la persona, después DoApp),
 * subpuntajes visibles, etiquetas en las publicaciones, estados de las tarjetas de trabajo, guía de inicio y reclamos (resolución arriba, quién subió cada prueba, estado de cierre).
 */
const leer = (ruta: string) => fs.readFileSync(path.join(process.cwd(), ruta), 'utf8');

describe('cómo se llama un reclamo cerrado', () => {
  it('un acuerdo o un retiro están RESUELTOS; solo el cierre del equipo es «sin decisión»', () => {
    expect(cierreDeReclamo('Acuerdo directo entre las partes: Ana propuso y Beto aceptó. Rehacer el trabajo.')).toEqual({ texto: 'Resuelta por acuerdo de las partes', resuelto: true });
    expect(cierreDeReclamo('Reclamo retirado por quien lo abrió.')).toEqual({ texto: 'Retirada por quien reclamó', resuelto: true });
    expect(cierreDeReclamo('Se descarta por falta de pruebas')).toEqual({ texto: 'Cerrada sin decisión', resuelto: false });
    expect(cierreDeReclamo(null).resuelto).toBe(false);
  });

  it('solo los cancelados cambian de nombre', () => {
    expect(etiquetaDelEstadoDelReclamo('open', 'x')).toBeNull();
    expect(etiquetaDelEstadoDelReclamo('resolved_released', 'x')).toBeNull();
    expect(etiquetaDelEstadoDelReclamo('cancelled', 'Reclamo retirado')).toBe('Retirada por quien reclamó');
  });

  it('las pantallas lo usan (panel, detalle, vista de las partes, lista y ayuda) y la resolución va arriba', () => {
    for (const f of ['client/pages/admin/AdminDisputeManager.tsx', 'client/pages/admin/AdminDisputeDetail.tsx', 'client/pages/DisputeDetail.tsx', 'client/pages/MyDisputes.tsx', 'client/pages/HelpPage.tsx']) {
      expect(leer(f)).toContain('cierreDeReclamo');
    }
    expect(leer('client/pages/DisputeDetail.tsx')).toContain('<ResolucionDelReclamo');
    expect(leer('client/pages/admin/AdminDisputeDetail.tsx')).toContain('<ResolucionDelReclamo');
    expect(leer('server/routes/disputes.ts')).toContain('resolution: dispute.resolution');
  });

  it('la lista del panel muestra una sola prioridad (sin «Importancia») y «con pago» cuenta el pago de la publicación', () => {
    expect(leer('client/pages/admin/AdminDisputeManager.tsx')).not.toContain('getImportanceBadge(dispute.importanceLevel)');
    expect(leer('server/routes/admin/disputes.ts')).toContain('publicationPaid: true');
  });
});

describe('pruebas del reclamo: quién las subió, cuándo y notas', () => {
  it('el servidor guarda quién subió cada prueba y tiene la ruta de notas', () => {
    const r = leer('server/routes/disputes.ts');
    expect((r.match(/uploadedBy: String\(userId\)/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(r).toContain('"/:id/evidence/:index/notes"');
    expect(leer('server/models/sql/Dispute.model.ts')).toContain('uploadedBy?: string');
  });

  it('las dos pantallas usan el mismo componente de pruebas', () => {
    expect(leer('client/pages/DisputeDetail.tsx')).toContain('<PruebasDelReclamo');
    expect(leer('client/pages/admin/AdminDisputeDetail.tsx')).toContain('<PruebasDelReclamo');
    const c = leer('client/components/disputes/PruebasDelReclamo.tsx');
    expect(c).toContain('Subida por');
    expect(c).toContain('data-testid="agregar-nota"');
  });
});

describe('etiquetar a los trabajadores en la publicación', () => {
  it('lee ids de un arreglo o de un texto JSON, sin repetidos ni basura', () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    expect(leerIds(JSON.stringify([a, b, a, 'hola']))).toEqual([a, b]);
    expect(leerIds([a])).toEqual([a]);
    expect(leerIds(undefined)).toEqual([]);
  });

  it('sin valor en la configuración se puede etiquetar; apagado, no', () => {
    expect(puedeSerEtiquetado(undefined)).toBe(true);
    expect(puedeSerEtiquetado({})).toBe(true);
    expect(puedeSerEtiquetado({ canBeTagged: true })).toBe(true);
    expect(puedeSerEtiquetado({ canBeTagged: false })).toBe(false);
  });

  it('la publicación sale con sus fotos (campo gallery) y a quién se etiqueta; la configuración tiene el interruptor', () => {
    const p = leer('client/pages/CreatePortfolioPost.tsx');
    expect(p).toContain("postFormData.append('gallery'");
    expect(p).toContain("postFormData.append('taggedUsers'");
    expect(p).not.toContain('/api/posts/upload-images');
    expect(leer('client/pages/UserSettings.tsx')).toContain('data-testid="permitir-etiquetas-casilla"');
    expect(leer('server/routes/posts.ts')).toContain('resolverEtiquetas');
    expect(leer('server/routes/portfolio.ts')).toContain('"/:id/images"');
    expect(leer('server/config/ensureSchema.ts')).toContain('posts.tagged_users');
  });
});

describe('puntuación en tres pasos y subpuntajes', () => {
  it('primero todo lo de la persona (puntaje y reseña), al final lo de DoApp', () => {
    const m = leer('client/components/user/PostWorkRatingModal.tsx');
    expect(m).toContain('type Step = 1 | 2 | 3');
    expect(m.indexOf('review.postWork.noteLabel')).toBeLessThan(m.indexOf('review.postWork.recommendApp'));
  });

  it('el trabajo y la propuesta traen el desglose de puntaje de cada persona', () => {
    expect(leer('server/services/userRatings.ts')).toContain('ATRIBUTOS_DE_PUNTUACION');
    expect(leer('server/routes/jobs.ts')).toContain('...ATRIBUTOS_DE_PUNTUACION');
    expect(leer('server/routes/proposals.ts')).toContain('...ATRIBUTOS_DE_PUNTUACION');
  });
});

describe('pedidos del 2026-11-23', () => {
  it('la sección única la ve toda parte del contrato (también administración que es quien contrató) y trae fechas y chat personal', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('const seguimientoUnico = Boolean((isOwnJob || isWorkerOnJob) && contratoDelSeguimiento);');
    expect(j).toContain('terminoEl={c.doerConfirmedAt}');
    expect(j).toContain('data-testid="chatear-con-el-trabajador"');
    expect(leer('server/routes/contracts.ts')).toContain('clientConfirmedAt: (c as any).clientConfirmedAt ?? null');
    expect(leer('client/components/contracts/EstadoDeConfirmaciones.tsx')).toContain('terminoEl');
  });

  it('«Enviar mensaje» a quien publicó no pasa por la negociación (solo existe con el trabajo abierto): es un chat personal', () => {
    const j = leer('client/pages/JobDetail.tsx');
    expect(j).toContain('if (job.status !== "open") {');
    expect(j).toContain('abrirChatDirecto(destino)');
  });

  it('un contrato con las dos confirmaciones no queda «esperando confirmación»: se cierra solo y la lista no lo dice', () => {
    expect(leer('server/jobs/autoConfirmContracts.ts')).toContain('{ clientConfirmed: true, doerConfirmed: true }');
    expect(leer('client/pages/JobDetail.tsx')).toContain('Contrato terminado');
  });

  it('las fotos de entrega aceptan notas con autor y hora', () => {
    expect(leer('server/routes/contracts.ts')).toContain('"/:id/delivery-photos/:index/notes"');
    expect(leer('client/components/contracts/FotosDeEntrega.tsx')).toContain('data-testid="agregar-nota-de-foto"');
  });

  it('se puede etiquetar después de publicar (solo quien publicó)', () => {
    const p = leer('server/routes/posts.ts');
    expect(p).toContain('"/:id/etiquetables"');
    expect(p).toContain('"/:id/etiquetas"');
    expect(leer('client/pages/PostDetail.tsx')).toContain('<EtiquetasDeLaPublicacion');
  });
});

describe('pedidos del 2026-11-23 (segunda parte)', () => {
  it('compartir un trabajo: la categoría es la del trabajo (+ una opcional), sin «Reputación y opinión» escrita; copia la opinión del final y se puede sacar', () => {
    const p = leer('client/pages/CreatePortfolioPost.tsx');
    expect(p).toContain('data-testid="categoria-del-trabajo"');
    expect(p).toContain('data-testid="categoria-adicional"');
    expect(p).toContain('data-testid="incluir-comentario"');
    expect(p).not.toContain("t('portfolio.reputationTitle'");
    expect(p).toContain('/api/posts/job/${jobId}/participantes');
  });

  it('un trabajador también puede etiquetar (a sus compañeros y a quien contrató)', () => {
    const s = leer('server/services/etiquetasDePublicaciones.ts');
    expect(s).toContain('[String(c.doerId), String(c.clientId)]');
    expect(leer('server/routes/posts.ts')).toContain('"/job/:jobId/participantes"');
  });

  it('un trabajo eliminado se guarda: modelo con deleted_at, papelera de 30 días, el equipo lo ve y solo se borra con nombre y motivo', () => {
    expect(leer('server/models/sql/Job.model.ts')).toContain('paranoid: true');
    const r = leer('server/routes/jobs.ts');
    expect(r).toContain('"/my-jobs/papelera"');
    expect(r).toContain('DIAS_EN_LA_PAPELERA = 30');
    expect(r).not.toContain('await job.destroy();\n\n    // Invalidate');
    const a = leer('server/routes/admin/jobs.ts');
    expect(a).toContain("'/:id/permanent'");
    expect(a).toContain('NOMBRE_NO_COINCIDE');
    expect(a).toContain("action: 'job.permanent_delete'");
    expect(leer('server/config/ensureSchema.ts')).toContain('jobs.deleted_at');
    expect(leer('client/pages/MyJobsScreen.tsx')).toContain('data-testid="ver-papelera"');
    expect(leer('client/pages/admin/JobManager.tsx')).toContain('EliminarTrabajoDefinitivamente');
  });

  it('«Gestión de Pagos»: un trabajo con N trabajadores tiene N pagos (una fila por contrato, «Pago 1 de 2»)', () => {
    const s = leer('server/routes/admin/pendingPayments.ts');
    expect(s).toContain('jobContractsMap.set(String(contract.id), [contract])');
    expect(s).toContain('pagoNumero');
    expect(leer('client/pages/admin/PendingPayments.tsx')).toContain('data-testid="pago-n-de-n"');
  });

  it('el saldo a favor pendiente se puede abrir para ver de dónde sale', () => {
    expect(leer('client/pages/Dashboard.tsx')).toContain('data-testid="ver-de-donde-sale"');
  });
});

describe('avisos y tarjetas', () => {
  it('«Confirmaste el trabajo de X» dice de quién es el trabajo confirmado', () => {
    expect(leer('client/pages/JobDetail.tsx')).toContain('Confirmaste el trabajo de ${quien}');
    expect(leer('client/components/jobDetail/ConfirmationSuccessModal.tsx')).toContain('titulo?: string');
  });

  it('«Completado» y «Pago aprobado» no se ven juntos cuando el trabajo ya empezó o terminó', () => {
    const t = leer('client/pages/MyJobsScreen.tsx');
    expect(t).toContain('estadoAvanzado');
    expect(t).toContain('{!estadoAvanzado(job.status) && getPaymentStatusBadge(job)}');
  });

  it('la guía de inicio muestra solo lo que falta', () => {
    expect(leer('client/components/FirstContractGuide.tsx')).toContain('ORDEN_DE_GUIAS.filter((_, i) => !hechas[i])');
  });

  it('un reclamo abierto pone un globo rojo en «Ayuda y Soporte» que lleva a «Mis disputas»', () => {
    const h = leer('client/components/app/Header.tsx');
    expect(h).toContain('data-testid="globo-de-disputas"');
    expect(h).toContain('/help?tab=disputes');
  });

  it('no se usa un servicio externo de dibujitos para la foto de perfil: va la inicial', () => {
    for (const f of ['client/pages/JobDetail.tsx', 'client/components/jobs/WorkInProgress.tsx', 'client/pages/JobApplicationSummary.tsx', 'client/components/jobDetail/SelectWorkerConfirmModal.tsx', 'client/pages/admin/RoleManagement.tsx']) {
      expect(leer(f)).not.toContain('dicebear');
    }
  });
});
