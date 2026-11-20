import { FileText, Undo2 } from 'lucide-react';
import { getImageUrl } from '../../utils/imageUrl';

/**
 * Las devoluciones de un pago, con todo lo que las explica (pedido del dueño, 2026-11-20): si fue una cancelación a tiempo o no, si se descontó la comisión, el monto, el
 * medio, el comprobante y quién la hizo. Es lo que se ve en «Pagos → Devueltos». Las devoluciones anteriores a este registro solo traen el monto.
 */
export interface DevolucionAnotada {
  id: string;
  fecha?: string | null;
  monto: number;
  opcion?: string | null;
  cancelacion?: 'a_tiempo' | 'con_trabajador' | null;
  comisionDescontada?: boolean | null;
  comision?: number;
  ivaComision?: number;
  procesamientoRetenido?: number | null;
  cierraElPago?: boolean;
  medio?: string | null;
  idDeLaDevolucionEnMercadoPago?: string | null;
  comprobanteUrl?: string | null;
  referencia?: string | null;
  motivo?: string | null;
  porNombre?: string | null;
  anterior?: boolean;
}

const pesos = (n: number) => `$${Number(n || 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function tipoDeLaDevolucion(d: DevolucionAnotada): string {
  if (d.anterior) return 'Devolución anterior (sin detalle)';
  if (d.cancelacion === 'a_tiempo') return 'Cancelado a tiempo';
  if (d.cancelacion === 'con_trabajador') return 'Cancelado con trabajador asignado o fuera de plazo';
  if (d.opcion === 'total') return 'Devolución total';
  if (d.opcion === 'personalizado') return 'Monto personalizado';
  return 'Devolución';
}

export function comisionDeLaDevolucion(d: DevolucionAnotada): string {
  if (d.anterior || d.comisionDescontada === null || d.comisionDescontada === undefined) return '—';
  if (!(Number(d.comision) > 0)) return 'Sin comisión (no se cobró)';
  const conIva = Math.round(((Number(d.comision) || 0) + (Number(d.ivaComision) || 0)) * 100) / 100;
  return d.comisionDescontada ? `Comisión descontada (${pesos(conIva)} con IVA)` : `Comisión no descontada (se devolvió ${pesos(conIva)} con IVA)`;
}

export function medioDeLaDevolucion(d: DevolucionAnotada): string {
  if (d.medio === 'mercadopago') return 'Mercado Pago (al medio de pago original)';
  if (d.medio === 'saldo') return 'Saldo del cliente';
  if (d.medio === 'banco') return 'Transferencia al banco del cliente';
  return 'Sin dato';
}

export default function DevolucionesDelPago({ devoluciones }: { devoluciones: DevolucionAnotada[] }) {
  if (!devoluciones.length) return null;
  return (
    <div className="ml-6 space-y-2 border-l-2 border-sky-300 pl-3 dark:border-sky-700" data-testid="devoluciones-del-pago">
      <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400">
        <Undo2 className="h-3.5 w-3.5" aria-hidden="true" /> {devoluciones.length === 1 ? '1 devolución de este pago' : `${devoluciones.length} devoluciones de este pago`}
      </p>
      {[...devoluciones].reverse().map((d) => (
        <div key={d.id} data-testid="devolucion" className="rounded-md border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-sm font-semibold text-gray-900 dark:text-white" data-testid="tipo-de-devolucion">{tipoDeLaDevolucion(d)}</span>
            <span className="text-sm font-bold text-gray-900 dark:text-white" data-testid="monto-de-devolucion">{pesos(d.monto)}</span>
          </div>
          <dl className="mt-1 grid grid-cols-1 gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <div><dt className="inline text-gray-500">Comisión: </dt><dd className="inline" data-testid="comision-de-devolucion">{comisionDeLaDevolucion(d)}</dd></div>
            <div><dt className="inline text-gray-500">Medio: </dt><dd className="inline">{medioDeLaDevolucion(d)}</dd></div>
            {d.procesamientoRetenido != null && <div><dt className="inline text-gray-500">Procesamiento retenido: </dt><dd className="inline">{pesos(d.procesamientoRetenido)} (la pasarela ya lo cobró)</dd></div>}
            {d.fecha && <div><dt className="inline text-gray-500">Fecha: </dt><dd className="inline">{new Date(d.fecha).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</dd></div>}
            {d.porNombre && <div><dt className="inline text-gray-500">La hizo: </dt><dd className="inline">{d.porNombre}</dd></div>}
            {d.referencia && <div><dt className="inline text-gray-500">N° de operación: </dt><dd className="inline">{d.referencia}</dd></div>}
            {d.idDeLaDevolucionEnMercadoPago && <div><dt className="inline text-gray-500">Reembolso en Mercado Pago: </dt><dd className="inline">{d.idDeLaDevolucionEnMercadoPago}</dd></div>}
            {d.cierraElPago !== undefined && !d.anterior && <div><dt className="inline text-gray-500">Pago: </dt><dd className="inline">{d.cierraElPago ? 'cerrado con esta devolución' : 'sigue abierto'}</dd></div>}
          </dl>
          {d.motivo && <p className="mt-1">Motivo: {d.motivo}</p>}
          <p className="mt-1">
            {d.comprobanteUrl ? (
              <a href={getImageUrl(d.comprobanteUrl)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sky-600 hover:underline dark:text-sky-400" data-testid="comprobante-de-devolucion-enlace">
                <FileText className="h-3.5 w-3.5" /> Ver comprobante
              </a>
            ) : (
              <span className="text-amber-700 dark:text-amber-400">Sin comprobante (devolución anterior a que se pidiera)</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
