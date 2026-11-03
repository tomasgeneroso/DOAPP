/**
 * Aviso en vivo de que el muro cambió.
 *
 * Una publicación que aparece o desaparece (se aprueba, se paga, se cancela, se pausa, se completa) tiene que verse al instante en las pantallas que ya
 * están abiertas, no recién cuando la persona recarga. El servidor ya vaciaba su caché en cada cambio de un trabajo (hook del modelo), pero el aviso en
 * vivo salía solo de algunas rutas: el resto cambiaba el muro y las pantallas abiertas se quedaban con la lista vieja.
 *
 * Este módulo no importa nada a propósito: lo llama el modelo del trabajo (que no puede importar el socket sin un ciclo) y el servidor registra acá
 * cómo avisar cuando arranca. Sin servidor (pruebas, scripts) no hay nadie registrado y no hace nada.
 */
type Emisor = () => void;

let emisor: Emisor | null = null;
let pendiente: unknown = null;

/** El servidor dice cómo avisarles a las pantallas abiertas (`server/index.ts`). */
export function registrarAvisoDelMuro(fn: Emisor): void {
  emisor = fn;
}

/** El muro cambió. Varios cambios seguidos (aprobar, publicar, avisar…) salen como un solo aviso. */
export function avisarQueCambioElMuro(): void {
  if (!emisor || pendiente) return;
  pendiente = setTimeout(() => {
    pendiente = null;
    try {
      emisor?.();
    } catch {
      /* sin conexión en vivo: la pantalla lo ve en su próxima carga */
    }
  }, 250);
  // Que el aviso pendiente no mantenga vivo el proceso (pruebas, scripts).
  (pendiente as { unref?: () => void }).unref?.();
}
