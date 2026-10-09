import type { Model } from 'sequelize-typescript';

/**
 * Pone en NULL los campos indicados de una instancia, para que el próximo `save()` los borre de verdad.
 *
 * Por qué existe: `instancia.campo = undefined; await instancia.save()` NO limpia la columna. Sequelize ignora los
 * `undefined` al guardar, así que el dato viejo queda en la base. Pasó con el id de Facebook (los avisos legítimos de
 * "desvincular" nunca borraban nada), con los datos del baneo, con el secreto y los códigos de respaldo del 2FA y con
 * la solicitud de extensión de un contrato (una extensión rechazada se podía aprobar después). Un campo que se
 * "limpia" se escribe en null, y esta función es el único lugar donde se hace.
 */
export function limpiarCampos<T extends Model>(instancia: T, ...campos: Array<keyof T & string>): void {
  for (const campo of campos) {
    instancia.setDataValue(campo as never, null as never);
  }
}
