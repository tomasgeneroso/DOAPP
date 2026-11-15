/**
 * Las guías paso a paso (pedido del dueño, 2026-11-15: «mejorar el onboarding: por ahora solo debe mostrar el camino para publicar el trabajo y el menú del usuario;
 * si clickeo en la guía "ir a configuración", hacer el paso a paso para que el usuario vaya manualmente y con ayuda»).
 *
 * Una guía NO lleva a la persona de la mano ni navega por ella: marca con un aro el lugar exacto y le dice qué tocar. La persona toca el botón de verdad (así aprende
 * dónde está) y la guía pasa sola al paso siguiente. Los pasos de «leer» (un campo de un formulario) se pasan con un botón «Siguiente».
 */

export type IdDeGuia = 'publicar' | 'menu';

export interface PasoDeGuia {
  id: string;
  titulo: string;
  texto: string;
  /** Selector CSS del elemento que se marca. */
  objetivo: string;
  /** Si se indica, el paso solo se muestra en esa ruta (la guía espera a que la persona llegue). */
  ruta?: RegExp;
  /** `click`: pasa sola cuando la persona toca el elemento marcado. `boton`: la persona toca «Siguiente». */
  avanzaCon: 'click' | 'boton';
  posicion: 'abajo' | 'arriba' | 'izquierda' | 'derecha';
  /** Si el elemento marcado desaparece (por ejemplo, la persona cerró el menú), la guía vuelve al paso anterior en vez de quedarse buscando. */
  volverSiFalta?: boolean;
}

export interface Guia {
  id: IdDeGuia;
  titulo: string;
  pasos: PasoDeGuia[];
}

export const GUIAS: Record<IdDeGuia, Guia> = {
  publicar: {
    id: 'publicar',
    titulo: 'Publicá tu primer trabajo',
    pasos: [
      {
        id: 'boton-publicar',
        titulo: 'Empezá acá',
        texto: 'Tocá «Publicar trabajo» para abrir el formulario.',
        objetivo: '[data-onboarding="create-job"]',
        avanzaCon: 'click',
        posicion: 'abajo',
      },
      {
        id: 'titulo',
        titulo: 'Poné un título claro',
        texto: 'Decí en pocas palabras qué necesitás. Por ejemplo: «Arreglar la canilla de la cocina».',
        objetivo: 'form input[name="title"]',
        ruta: /^\/contracts\/create/,
        avanzaCon: 'boton',
        posicion: 'abajo',
      },
      {
        id: 'descripcion',
        titulo: 'Contá los detalles',
        texto: 'Escribí qué hay que hacer. Con más detalle, las propuestas llegan más precisas.',
        objetivo: 'form textarea[name="description"]',
        ruta: /^\/contracts\/create/,
        avanzaCon: 'boton',
        posicion: 'abajo',
      },
      {
        id: 'precio',
        titulo: 'Indicá cuánto querés pagar',
        texto: 'Poné el presupuesto del trabajo. Después completás las fechas y el lugar.',
        objetivo: '[data-guia="campo-budget"]',
        ruta: /^\/contracts\/create/,
        avanzaCon: 'boton',
        posicion: 'abajo',
      },
      {
        id: 'enviar',
        titulo: 'Y listo para publicar',
        texto: 'Cuando tengas todo completo, tocá este botón y tu trabajo queda en camino.',
        objetivo: 'form button[type="submit"]',
        ruta: /^\/contracts\/create/,
        avanzaCon: 'boton',
        posicion: 'arriba',
      },
    ],
  },
  menu: {
    id: 'menu',
    titulo: 'Conocé el menú de tu cuenta',
    pasos: [
      {
        id: 'abrir-menu',
        titulo: 'Abrí tu menú',
        texto: 'Tocá tu nombre para abrir el menú de tu cuenta.',
        objetivo: '[data-guia="menu-usuario"]',
        avanzaCon: 'click',
        posicion: 'abajo',
      },
      {
        id: 'configuracion',
        titulo: 'Acá está Configuración',
        texto: 'Tocá «Configuración»: ahí completás tu foto, tu biografía y tus datos.',
        objetivo: '[data-guia="menu-configuracion"]',
        avanzaCon: 'click',
        posicion: 'izquierda',
        volverSiFalta: true,
      },
      {
        id: 'pestana-perfil',
        titulo: 'Tu perfil',
        texto: 'Esta pestaña reúne lo básico de tu perfil. Tocala para verlo.',
        objetivo: '[data-guia="pestana-basic"]',
        ruta: /^\/settings/,
        avanzaCon: 'click',
        posicion: 'derecha',
      },
      {
        id: 'foto',
        titulo: 'Sumá tu foto',
        texto: 'Con una foto tu perfil genera más confianza. Podés subirla desde acá cuando quieras.',
        objetivo: '[data-guia="perfil-foto"]',
        ruta: /^\/settings/,
        avanzaCon: 'boton',
        posicion: 'abajo',
      },
      {
        id: 'bio',
        titulo: 'Contá quién sos',
        texto: 'Escribí una biografía corta con tu experiencia. Así las personas te conocen antes de contratarte.',
        objetivo: '[data-guia="perfil-bio"]',
        ruta: /^\/settings/,
        avanzaCon: 'boton',
        posicion: 'arriba',
      },
    ],
  },
};

/** Las guías que se ofrecen en la lista «Tu guía de inicio», en orden. */
export const ORDEN_DE_GUIAS: IdDeGuia[] = ['publicar', 'menu'];

const clave = (usuarioId: string, guia: IdDeGuia) => `guia_hecha_${guia}_${usuarioId}`;

export function guiaHecha(usuarioId: string | undefined | null, guia: IdDeGuia): boolean {
  if (!usuarioId) return false;
  try {
    return localStorage.getItem(clave(usuarioId, guia)) === '1';
  } catch {
    return false;
  }
}

export function marcarGuiaHecha(usuarioId: string | undefined | null, guia: IdDeGuia): void {
  if (!usuarioId) return;
  try {
    localStorage.setItem(clave(usuarioId, guia), '1');
  } catch {
    /* sin almacenamiento: la guía se podrá ver de nuevo, no pasa nada */
  }
}
