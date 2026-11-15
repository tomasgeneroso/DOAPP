/**
 * Desplazamiento suave y natural (pedido del dueño, 2026-11-15: «scroll natural smooth, tanto para navegar como cuando clickeo en "Cómo funciona"»).
 *
 * Por qué no alcanza con `scroll-behavior: smooth` de CSS: depende de cada navegador y, sobre todo, de que el sistema NO tenga activado «reducir movimiento» (en Windows,
 * «Mostrar animaciones» apagado). Con eso apagado la página saltaba de golpe, y lo mismo les pasaba a las animaciones de la portada. Acá el movimiento es propio: una
 * curva suave (arranca y frena despacio), corta (entre 0,35 y 0,9 segundos según la distancia) y que se corta al instante apenas la persona toca la rueda, la pantalla
 * o una tecla, para que nunca pelee con ella.
 *
 * Es una decisión del producto ignorar «reducir movimiento» SOLO para este desplazamiento corto y sin giros ni rebotes. Lo que se mueve solo y sin pedirlo (el teléfono de la
 * portada) tiene su botón de pausa.
 */
let cuadro: number | null = null;
let limpiarEscuchas: (() => void) | null = null;

export function cancelarDesplazamiento(): void {
  if (cuadro !== null) cancelAnimationFrame(cuadro);
  cuadro = null;
  limpiarEscuchas?.();
  limpiarEscuchas = null;
}

const curva = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Cuánto dura el movimiento según la distancia: nunca menos de 0,35 s ni más de 0,9 s. */
export const duracionPara = (distancia: number): number => Math.min(900, Math.max(350, Math.abs(distancia) * 0.45));

/** Lleva la página a `destino` (en píxeles desde arriba) con la curva suave. */
export function desplazarSuave(destino: number): void {
  cancelarDesplazamiento();
  const inicio = window.scrollY;
  const tope = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const objetivo = Math.min(Math.max(0, destino), tope);
  const distancia = objetivo - inicio;
  if (Math.abs(distancia) < 2) return;

  const duracion = duracionPara(distancia);
  const t0 = performance.now();

  // La persona manda: si toca la rueda, la pantalla o una tecla, el movimiento se corta ahí.
  const parar = () => cancelarDesplazamiento();
  const eventos: Array<keyof WindowEventMap> = ['wheel', 'touchstart', 'mousedown', 'keydown'];
  eventos.forEach((e) => window.addEventListener(e, parar, { passive: true, once: true }));
  limpiarEscuchas = () => eventos.forEach((e) => window.removeEventListener(e, parar));

  const paso = (ahora: number) => {
    const t = Math.min(1, (ahora - t0) / duracion);
    // 'instant' para que el CSS `scroll-behavior: smooth` no sume su propia animación a cada cuadro.
    window.scrollTo({ top: inicio + distancia * curva(t), left: 0, behavior: 'instant' as ScrollBehavior });
    if (t < 1) {
      cuadro = requestAnimationFrame(paso);
    } else {
      cancelarDesplazamiento();
    }
  };
  cuadro = requestAnimationFrame(paso);
}

/** Lleva la página hasta un elemento, dejando el margen que ese elemento pide (`scroll-margin-top`, por ejemplo por el encabezado fijo). */
export function desplazarAElemento(el: Element): void {
  const margen = parseFloat(getComputedStyle(el).scrollMarginTop || '0') || 0;
  desplazarSuave(el.getBoundingClientRect().top + window.scrollY - margen);
}
