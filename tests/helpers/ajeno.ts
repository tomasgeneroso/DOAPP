/**
 * Qué responde una ruta cuando quien pide NO es parte del contrato o de la cotización.
 *
 * Con Row Level Security encendida (`RLS_ACTIVO`, la de los tests de integración) la base no le muestra la fila a quien no participa: la ruta no la
 * encuentra y responde 404, como si no existiera (no revela que existe). Con RLS apagada es la comprobación de la ruta la que responde 403.
 */
export const ESTADO_PARA_UN_AJENO: number = process.env.RLS_ACTIVO === 'false' ? 403 : 404;
