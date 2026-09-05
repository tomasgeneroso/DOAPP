import { Contract } from '../models/sql/Contract.model.js';

/**
 * Control diario del contrato.
 *
 * Un tablero de dias donde cualquiera de las dos partes puede marcar "se
 * trabajo". Nadie esta obligado: es un control pasivo, no un parte diario.
 *
 * Hace dos cosas y ninguna es burocratica. Frena la alerta de ausencia, asi
 * que dos personas que se estan entendiendo bien dejan de recibir avisos que
 * no necesitan. Y queda como evidencia: un contracargo sobre un contrato donde
 * el cliente marco doce dias como trabajados es muy dificil de sostener.
 */

/** AAAA-MM-DD en horario local, que es como la gente piensa un dia. */
function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Los dias que abarca el contrato.
 *
 * Se corta en 120 dias por las dudas: un contrato con fechas mal cargadas no
 * puede hacer que la pantalla intente dibujar diez anios de casilleros.
 */
export function diasDelContrato(contrato: Contract): string[] {
  const inicio = new Date((contrato as any).startDate);
  const fin = new Date((contrato as any).endDate);
  if (isNaN(inicio.getTime()) || isNaN(fin.getTime())) return [];

  const dias: string[] = [];
  const cursor = new Date(inicio);
  cursor.setHours(0, 0, 0, 0);

  while (cursor <= fin && dias.length < 120) {
    dias.push(ymd(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return dias;
}

export type DayState = 'sin_marcar' | 'pendiente' | 'confirmado';

export interface DailyLogView {
  dias: Array<{
    date: string;
    estado: DayState;
    marcoTrabajador: boolean;
    marcoCliente: boolean;
    /** Si quien mira puede marcar este dia: sólo hasta hoy. */
    editable: boolean;
  }>;
  confirmados: number;
  total: number;
  /** Dias seguidos sin ninguna marca hasta hoy. */
  diasSinMarcar: number;
  /** A partir de cuantos dias seguidos se avisa, segun la duracion. */
  umbralAusencia: number;
  hayAlerta: boolean;
}

/**
 * El umbral de ausencia depende de cuanto dura el trabajo.
 *
 * Dos dias de silencio en un contrato de un mes es normal; en uno de dos dias
 * es abandono total. Se toma el 20% de la duracion, acotado entre 1 y 4 dias:
 * mas de 4 seguidos ya es demasiado para cualquier trabajo.
 */
export function umbralAusencia(totalDias: number): number {
  return Math.min(4, Math.max(1, Math.round(totalDias * 0.2)));
}

export function buildDailyLog(contrato: Contract, quienMira: 'client' | 'worker'): DailyLogView {
  const dias = diasDelContrato(contrato);
  const log: any[] = (contrato as any).dailyLog || [];
  const porFecha = new Map(log.map((d) => [d.date, d]));
  const hoy = ymd(new Date());

  const filas = dias.map((date) => {
    const m = porFecha.get(date);
    const marcoTrabajador = Boolean(m?.markedByWorkerAt);
    const marcoCliente = Boolean(m?.markedByClientAt);

    // La marca del cliente confirma sola: es quien recibe el servicio, su
    // palabra alcanza. La del trabajador queda pendiente de que el cliente
    // la acompanie.
    const estado: DayState = marcoCliente
      ? 'confirmado'
      : marcoTrabajador
        ? 'pendiente'
        : 'sin_marcar';

    return {
      date,
      estado,
      marcoTrabajador,
      marcoCliente,
      // No se marcan dias que todavia no ocurrieron.
      editable: date <= hoy,
    };
  });

  // Dias seguidos sin ninguna marca, contando hacia atras desde hoy. Sólo se
  // miran dias ya transcurridos: los futuros no son ausencia.
  const pasados = filas.filter((f) => f.date <= hoy);
  let diasSinMarcar = 0;
  for (let i = pasados.length - 1; i >= 0; i--) {
    if (pasados[i].estado === 'sin_marcar') diasSinMarcar++;
    else break;
  }

  const umbral = umbralAusencia(dias.length);

  return {
    dias: filas,
    confirmados: filas.filter((f) => f.estado === 'confirmado').length,
    total: filas.length,
    diasSinMarcar,
    umbralAusencia: umbral,
    // Sólo se avisa si el contrato esta corriendo: uno que ya termino o que no
    // arranco no tiene ausencias que reportar.
    hayAlerta:
      diasSinMarcar >= umbral &&
      ['accepted', 'in_progress'].includes(String(contrato.status)),
  };
}
