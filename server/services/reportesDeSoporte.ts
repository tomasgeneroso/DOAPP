import { Contract } from '../models/sql/Contract.model.js';
import { User } from '../models/sql/User.model.js';
import { esUuid } from '../../shared/tickets/reportes.js';

/**
 * A qué contrato y a qué usuario se refiere un ticket de soporte.
 *
 * NO mira el estado de ninguno de los dos: un contrato pendiente, cancelado, rechazado, en disputa o terminado se reporta igual, y un usuario
 * suspendido, sin verificar o dado de baja también (regla del dueño: siempre se puede escribir a soporte; ver shared/tickets/reportes.ts). Lo único que
 * se comprueba es que existan y, para un contrato, que quien reporta participe en él: un contrato ajeno no se enlaza (ni se confirma que existe). El
 * equipo de administración puede enlazar cualquiera.
 */
export class ErrorDeReporte extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = 'ErrorDeReporte';
  }
}

const texto = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

export async function relacionesDelTicket(
  quien: { id: string | number; adminRole?: string | null },
  cuerpo: Record<string, unknown>,
): Promise<{ relatedUser?: string; relatedContract?: string }> {
  const usuarioId = texto(cuerpo.relatedUser ?? cuerpo.relatedUserId);
  const contratoId = texto(cuerpo.relatedContract ?? cuerpo.relatedContractId);
  const relaciones: { relatedUser?: string; relatedContract?: string } = {};

  if (usuarioId) {
    if (!esUuid(usuarioId)) throw new ErrorDeReporte(400, 'El usuario del reporte no es válido');
    const existe = await User.findByPk(usuarioId, { attributes: ['id'] });
    if (!existe) throw new ErrorDeReporte(404, 'No encontramos a ese usuario');
    relaciones.relatedUser = usuarioId;
  }

  if (contratoId) {
    if (!esUuid(contratoId)) throw new ErrorDeReporte(400, 'El contrato del reporte no es válido');
    // paranoid: false — un contrato dado de baja también se reporta.
    const contrato = (await Contract.findByPk(contratoId, { attributes: ['id', 'clientId', 'doerId'], paranoid: false })) as { clientId?: unknown; doerId?: unknown } | null;
    const esParte = !!contrato && [contrato.clientId, contrato.doerId].some((id) => String(id) === String(quien.id));
    if (!contrato || (!esParte && !quien.adminRole)) throw new ErrorDeReporte(404, 'No encontramos ese contrato entre los tuyos');
    relaciones.relatedContract = contratoId;
  }

  return relaciones;
}
