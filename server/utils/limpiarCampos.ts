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

/**
 * Lo que valían esos campos ANTES de vaciarlos, para dejarlo anotado en el historial.
 *
 * Vaciar el campo es necesario (si el dato viejo sigue puesto, sigue mandando: la solicitud rechazada se podía
 * aprobar, el baneo seguía a la vista), pero vaciarlo sin anotar antes qué valía es perder quién, cuándo y por qué.
 * Se llama ANTES de `limpiarCampos` y lo que devuelve va al registro de auditoría o al historial del propio registro.
 * Las fechas salen como texto ISO para que se guarden tal cual en el JSON del historial.
 */
export function valoresAnteriores<T extends Model>(instancia: T, ...campos: Array<keyof T & string>): Record<string, unknown> {
  const fotos: Record<string, unknown> = {};
  for (const campo of campos) {
    const valor = instancia.getDataValue(campo as never) as unknown;
    fotos[campo] = valor instanceof Date ? valor.toISOString() : (valor ?? null);
  }
  return fotos;
}
