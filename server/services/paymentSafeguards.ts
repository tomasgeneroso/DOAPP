import { Op } from 'sequelize';
import { PaymentAction } from '../models/sql/PaymentAction.model.js';
import { logMoneyEvent } from '../utils/auditLog.js';

/**
 * Controles que se aplican antes de que salga dinero.
 *
 * Todos comparten una idea: el fraude interno y la cuenta tomada no se
 * previenen con buena fe, se previenen con friccion en los puntos donde el
 * dinero sale. Y la friccion tiene que doler lo justo -- si es demasiada, el
 * equipo la evita, y un control que se evita no existe.
 *
 * Ninguno de estos controles impide operar. Todos hacen que operar de mas
 * requiera un acto explicito que queda registrado con nombre y fecha.
 */

/**
 * Desde que monto un pago manual necesita contraseña y 2FA.
 *
 * El numero sale de una pregunta: cuanto puede perderse antes de que duela de
 * verdad. Un contrato tipico de la plataforma esta bien por debajo de esto, asi
 * que la operacion diaria no se ve afectada; lo que cae del otro lado son los
 * pagos grandes y los agrupados, que son exactamente los que hay que mirar dos
 * veces.
 *
 * Se pide contraseña + 2FA y no un codigo corto elegido por el administrador. Un
 * codigo de cuatro cifras fijo es un secreto compartido que no vence: se ve por
 * encima del hombro, se anota en un papel, se lo pasan entre companeros cuando
 * uno esta de licencia, y no prueba nada mas que la sesion que ya estaba
 * abierta. El 2FA cambia cada treinta segundos y esta atado al telefono de una
 * persona concreta.
 */
export const MONTO_DOBLE_CONFIRMACION_ARS = 200_000;

/**
 * Cuanto puede sacar por dia cada rol, en pesos.
 *
 * El criterio no es la confianza sino el daño maximo en un dia malo: cuanto se
 * puede perder antes de que alguien lo note. Los pagos se revisan al menos una
 * vez por dia, asi que el tope es el techo de lo irrecuperable.
 *
 *   support      cero. Soporte atiende gente, no mueve plata. Que tenga tope
 *                cero y no "sin permiso" es deliberado: si algun dia una ruta
 *                se le abre por error, el tope lo frena igual.
 *   admin        alcanza para un dia entero de liberaciones normales con
 *                margen. Si un dia hace falta mas, lo autoriza alguien por
 *                encima, que es exactamente lo que se busca.
 *   super_admin  cubre un pico -- fin de mes, una tanda de retiros acumulados --
 *                sin tener que escalar.
 *   owner        sin tope, pero cada egreso queda registrado. Poner un tope al
 *                dueño solo lo obligaria a saltearselo, y un control que se
 *                saltea rutinariamente ensena que los controles son opcionales.
 *
 * Estos numeros se suben cuando el volumen los haga incomodos. Empezar apretado
 * y aflojar es seguro; empezar flojo y apretar despues es una discusion.
 */
export const TOPE_DIARIO_POR_ROL_ARS: Record<string, number> = {
  support: 0,
  admin: 1_500_000,
  // El doble del de admin. Es una relacion y no un numero suelto: un super_admin
  // cubre lo de un admin mas su propio margen para autorizar lo que el otro no
  // pudo. Si el tope de admin sube, este lo sigue.
  super_admin: 3_000_000,
  owner: Number.POSITIVE_INFINITY,
};

/** Clave donde el dueño guarda los topes editados desde el panel. */
export const CLAVE_TOPES = 'payment.daily_caps';

/**
 * Topes vigentes: los del panel si existen, los de arriba si no.
 *
 * Se leen en cada verificacion y no se cachean. Un tope es justamente lo que hay
 * que poder cambiar en medio de un problema -- un dia de volumen inesperado, una
 * cuenta que hay que frenar ya -- y un cache de cinco minutos convierte ese
 * cambio en cinco minutos de espera con el dueño mirando la pantalla.
 *
 * Si la consulta falla se usan los valores del codigo. Quedarse sin topes
 * porque la base no respondio seria fallar abierto en el peor momento posible.
 */
export async function topesVigentes(): Promise<Record<string, number>> {
  try {
    const { AppSetting } = await import('../models/sql/AppSetting.model.js');
    const fila = await AppSetting.findOne({ where: { key: CLAVE_TOPES } });
    if (!fila?.value) return TOPE_DIARIO_POR_ROL_ARS;

    const guardados = fila.value as Record<string, any>;
    const topes: Record<string, number> = { ...TOPE_DIARIO_POR_ROL_ARS };

    for (const [rol, valor] of Object.entries(guardados)) {
      // null significa "sin tope". JSON no tiene Infinity, asi que se guarda
      // asi y se traduce acá en vez de perderse en la serializacion.
      if (valor === null) topes[rol] = Number.POSITIVE_INFINITY;
      else if (typeof valor === 'number' && valor >= 0) topes[rol] = valor;
    }
    return topes;
  } catch {
    return TOPE_DIARIO_POR_ROL_ARS;
  }
}

/**
 * Cuantas horas hay que esperar para retirar despues de cambiar el CBU.
 *
 * Es la defensa contra la cuenta tomada. El ataque es siempre igual: alguien
 * entra con la contraseña robada, cambia la cuenta bancaria de destino y retira.
 * Sin demora, entre las dos cosas pasan segundos y no hay nada que hacer.
 *
 * Veinticuatro horas es el numero habitual en bancos y billeteras, y la razon es
 * que cubre un ciclo completo de sueño y trabajo: el dueño real ve el mail de
 * "cambiaste tu cuenta" y tiene tiempo de reaccionar antes de que la plata se
 * vaya. Mas que eso empieza a molestar a quien simplemente cambio de banco.
 */
export const ENFRIAMIENTO_CBU_HORAS = 24;

export interface ResultadoControl {
  permitido: boolean;
  motivo?: string;
  /** Para que la interfaz pueda decir cuanto falta, no solo que no se puede. */
  detalle?: Record<string, any>;
}

/**
 * Cuanto egreso lleva ejecutado hoy este administrador.
 *
 * Cuenta las operaciones reservadas ademas de las exitosas. Una operacion en
 * vuelo puede terminar bien, y no contarla dejaria pasar dos pagos grandes
 * lanzados con segundos de diferencia -- que es como se evade un tope.
 */
export async function egresoDelDia(adminId: string): Promise<number> {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);

  const acciones = await PaymentAction.findAll({
    where: {
      executedById: adminId,
      actionType: { [Op.in]: ['PAYOUT', 'REFUND_TOTAL', 'REFUND_PARTIAL'] },
      status: { [Op.ne]: 'FAILED' },
      createdAt: { [Op.gte]: desde },
    },
    attributes: ['amount'],
  });

  return acciones.reduce((t, a) => t + (Number(a.amount) || 0), 0);
}

/**
 * Verifica el tope diario antes de dejar salir plata.
 *
 * Un intento por encima del tope se registra aunque se rechace: puede ser
 * alguien trabajando en un dia cargado, o puede ser el sintoma de que una
 * cuenta esta comprometida. La diferencia se ve en el patron, y el patron solo
 * existe si los rechazos quedan.
 */
export async function verificarTopeDiario(
  adminId: string,
  rol: string,
  monto: number,
): Promise<ResultadoControl> {
  const topes = await topesVigentes();
  const tope = topes[rol];

  if (tope === undefined) {
    return {
      permitido: false,
      motivo: `El rol "${rol}" no tiene un tope de egresos definido, así que no puede mover dinero.`,
    };
  }

  if (tope === Number.POSITIVE_INFINITY) return { permitido: true };

  const yaHoy = await egresoDelDia(adminId);
  const disponible = Math.max(0, tope - yaHoy);

  if (monto > disponible) {
    await logMoneyEvent({
      action: 'DAILY_CAP_EXCEEDED',
      actor: `admin:${adminId}`,
      severity: 'high',
      description:
        `Se intentó un egreso de $${monto.toLocaleString('es-AR')} con $${disponible.toLocaleString('es-AR')} ` +
        `disponibles del tope diario del rol ${rol}. Se rechazó.`,
      monto,
      metadata: { adminId, rol, tope, yaHoy, disponible },
    });

    return {
      permitido: false,
      motivo:
        `Este movimiento supera tu tope diario. Llevás $${yaHoy.toLocaleString('es-AR')} de ` +
        `$${tope.toLocaleString('es-AR')} y te quedan $${disponible.toLocaleString('es-AR')}. ` +
        'Pedile a alguien con más permisos que lo autorice.',
      detalle: { tope, yaHoy, disponible, monto },
    };
  }

  return { permitido: true, detalle: { tope, yaHoy, disponible: disponible - monto } };
}

/** Si el pago necesita contraseña y 2FA por su monto. */
export function requiereDobleConfirmacion(monto: number): boolean {
  return Number(monto) >= MONTO_DOBLE_CONFIRMACION_ARS;
}

/**
 * Verifica el enfriamiento posterior a un cambio de CBU.
 *
 * Se mide contra el momento del cambio y no contra el del ultimo retiro: lo que
 * importa es cuanto hace que la cuenta de destino es la que es.
 */
export function verificarEnfriamientoCbu(cambiadoEl?: Date | null): ResultadoControl {
  if (!cambiadoEl) return { permitido: true };

  const horas = (Date.now() - new Date(cambiadoEl).getTime()) / 3_600_000;
  if (horas >= ENFRIAMIENTO_CBU_HORAS) return { permitido: true };

  const faltan = Math.ceil(ENFRIAMIENTO_CBU_HORAS - horas);
  return {
    permitido: false,
    motivo:
      `Cambiaste tu cuenta bancaria hace poco. Por seguridad, los retiros se habilitan ` +
      `${ENFRIAMIENTO_CBU_HORAS} horas después de un cambio de cuenta: faltan ${faltan} ` +
      `${faltan === 1 ? 'hora' : 'horas'}. Si no fuiste vos quien la cambió, escribinos ahora.`,
    detalle: { horasFaltantes: faltan, cambiadoEl },
  };
}
