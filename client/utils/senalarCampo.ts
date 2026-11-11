/**
 * Señalar el campo que falta en un formulario.
 *
 * El navegador se encarga de los campos con `required`: los marca y les da foco
 * al intentar enviar. Pero las validaciones propias de un formulario —una fecha
 * incoherente, una dirección que no se pudo ubicar, una tarea sin cargar— sólo
 * muestran un texto, y en un formulario largo ese texto queda fuera de la vista:
 * la persona ve que no avanza y no sabe por qué.
 *
 * Esto lleva la atención al campo: lo trae a la vista, le da foco y lo resalta
 * con el mismo rojo que usa el navegador para los obligatorios (ver
 * `.campo-senalado` en global.css). El resaltado se va en cuanto la persona
 * toca el campo, para no quedar en rojo sobre algo ya corregido.
 */

const esVisible = (el: HTMLElement): boolean =>
  el.offsetParent !== null && (el as HTMLInputElement).type !== 'hidden';

/** El ancestro más cercano que la persona puede ver */
function contenedorVisible(el: HTMLElement): HTMLElement | null {
  let actual = el.parentElement;
  while (actual && !esVisible(actual)) actual = actual.parentElement;
  return actual;
}

/** Cuánto dura el resaltado si la persona no toca el campo */
const DURACION_MS = 6000;

interface Opciones {
  /** Dónde buscar; por defecto, todo el documento */
  dentroDe?: HTMLElement | null;
  /** Darle foco además de traerlo a la vista. Por defecto sí. */
  enfocar?: boolean;
}

/**
 * Busca el campo por su atributo `name` y lo señala.
 * Devuelve true si lo encontró, para que quien llama sepa si alcanza con el
 * mensaje general.
 */
export function senalarCampo(nombre: string, opciones: Opciones = {}): boolean {
  if (typeof document === 'undefined') return false;

  const raiz: ParentNode = opciones.dentroDe ?? document;
  const escapado = CSS.escape(nombre);
  // Por `name` o `id` cuando el campo es un input; por `data-campo` cuando lo
  // dibuja un componente propio (un calendario, un autocompletado de calles)
  // que no expone un input con nombre.
  let campo = raiz.querySelector<HTMLElement>(
    `[name="${escapado}"], #${escapado}, [data-campo="${escapado}"]`
  );
  if (!campo) return false;

  // Un componente propio puede guardar el valor en un campo oculto (así lo hace
  // el rango de fechas). Resaltar algo invisible no le sirve a nadie: se sube al
  // contenedor visible más cercano, que es lo que la persona ve.
  const visible = esVisible(campo) ? campo : contenedorVisible(campo);
  if (!visible) return false;
  if (visible !== campo) opciones = { ...opciones, enfocar: false };
  campo = visible;

  campo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  campo.classList.add('campo-senalado');

  if (opciones.enfocar !== false) {
    // Después del scroll: enfocar primero lo cancela en algunos navegadores
    window.setTimeout(() => {
      try {
        (campo as HTMLInputElement).focus({ preventScroll: true });
      } catch {
        /* un campo que no se puede enfocar igual quedó resaltado */
      }
    }, 300);
  }

  const limpiar = () => {
    campo.classList.remove('campo-senalado');
    campo.removeEventListener('input', limpiar);
    campo.removeEventListener('change', limpiar);
    campo.removeEventListener('focus', limpiar);
  };
  campo.addEventListener('input', limpiar);
  campo.addEventListener('change', limpiar);
  campo.addEventListener('focus', limpiar);
  window.setTimeout(limpiar, DURACION_MS);

  return true;
}

/**
 * Señala el primer campo obligatorio que el navegador considera inválido.
 *
 * Sirve cuando el envío se hace desde el código y la validación nativa no
 * llegó a correr, o cuando hay varios campos vacíos y conviene llevar a la
 * persona al primero en lugar de dejarla buscar.
 */
export function senalarPrimerCampoInvalido(form: HTMLFormElement | null): boolean {
  if (!form) return false;
  const invalido = form.querySelector<HTMLElement>(':invalid');
  if (!invalido) return false;

  invalido.scrollIntoView({ behavior: 'smooth', block: 'center' });
  window.setTimeout(() => {
    try {
      (invalido as HTMLInputElement).focus({ preventScroll: true });
      // La burbuja del navegador dice qué falta, con su propio texto traducido
      (form as HTMLFormElement).reportValidity();
    } catch {
      /* sin burbuja, el resaltado de :user-invalid ya lo marca */
    }
  }, 300);
  return true;
}
