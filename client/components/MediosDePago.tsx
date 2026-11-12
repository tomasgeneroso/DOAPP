/**
 * Medios de pago con los logos de Mercado Pago y de Binance (pedido del dueño, 2026-11-12: «añadir logos de Mercado Pago y Binance»).
 * Cada logo va sobre una pastilla blanca: el de Mercado Pago tiene letras azul oscuro y no se vería sobre el fondo oscuro.
 */
export default function MediosDePago({ className = '', conTitulo = true }: { className?: string; conTitulo?: boolean }) {
  return (
    <div className={`flex flex-col items-center gap-2 sm:flex-row ${className}`} data-testid="medios-de-pago">
      {conTitulo && <span className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Pagá con</span>}
      <ul className="flex items-center gap-2" aria-label="Medios de pago">
        <li className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
          <img src="/MP_RGB_HANDSHAKE_color_horizontal.svg" alt="Mercado Pago" className="h-6 w-auto" loading="lazy" />
        </li>
        <li className="flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 shadow-sm">
          <img src="/binance.svg" alt="Binance" className="h-5 w-auto" loading="lazy" />
        </li>
      </ul>
    </div>
  );
}
