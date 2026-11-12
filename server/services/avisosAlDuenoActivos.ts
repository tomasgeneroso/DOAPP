/**
 * ¿Están encendidos los avisos al dueño por correo? Solo en producción (staging corre como producción); en desarrollo y pruebas no se manda nada.
 *
 * Es un módulo aparte y mínimo, sin imports, para que quien lo consulta (cada respuesta 5xx, el arranque) NO cargue `avisoAlDueno.ts` —que arrastra el modelo de usuarios y el servicio
 * de correo, y este último escribe en el registro al importarse— cuando los avisos están apagados: en las pruebas ese import tardío escribía «después de terminar» y hacía fallar a otra prueba.
 */
let activo = process.env.NODE_ENV === 'production';

export const avisosAlDuenoActivos = (): boolean => activo;

/** Para las pruebas: enciende o apaga los avisos (por defecto solo están encendidos en producción). */
export function __activarAvisos(valor: boolean): void {
  activo = valor;
}
