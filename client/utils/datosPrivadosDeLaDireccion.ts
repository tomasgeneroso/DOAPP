/**
 * Lo puro de «la dirección no muestra identificadores» (ver `datosDeLaDireccion.tsx`, que lo usa): qué datos se sacan de la dirección y cómo se separan.
 * Está aparte, sin React, para poder probarlo solo.
 */
export const CLAVES_PRIVADAS_DE_LA_DIRECCION = ['jobId', 'contractId', 'recipientId', 'conversationId', 'userId', 'jobTitle', 'nombre'] as const;

export function separarDatosPrivados(search: string): { publica: string; privados: Record<string, string> } {
  const entrada = new URLSearchParams(search);
  const publica = new URLSearchParams();
  const privados: Record<string, string> = {};
  entrada.forEach((valor, clave) => {
    if ((CLAVES_PRIVADAS_DE_LA_DIRECCION as readonly string[]).includes(clave)) privados[clave] = valor;
    else publica.append(clave, valor);
  });
  const texto = publica.toString();
  return { publica: texto ? `?${texto}` : '', privados };
}
