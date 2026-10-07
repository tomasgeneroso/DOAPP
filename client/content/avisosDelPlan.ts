import type { Aviso } from '../../shared/pricing/planCoordinado';
import { N } from './seccionesDelPlan';

/**
 * Lo que el plan avisa cuando dos bloques no encajan.
 *
 * `coordinarPlan` detecta las situaciones y devuelve códigos con su monto; el texto
 * está acá, donde puede nombrar las secciones por su número real (`N`) y donde un
 * test puede comprobar que cada código tiene su mensaje. Un aviso sin texto sería
 * un cartel vacío justo en el momento en que el plan dice que algo no cierra.
 */

export function textoDelAviso(aviso: Aviso, fmt: (n: number) => string): string {
  switch (aviso.codigo) {
    case 'publicidad-sin-cac':
      return `Hay ${fmt(aviso.monto)} de publicidad por mes pero el costo de adquirir un usuario (CAC) está en 0: el modelo no puede saber cuántos usuarios compra y cuenta 0 altas. Cargá el CAC en la sección ${N.supuestos}.`;
    case 'publicidad-sin-uso':
      return `La publicidad de la etapa real (${fmt(aviso.monto)} por mes) no se usa mientras la base crezca "% sobre la base": en ese modo el costo de adquirir usuarios sale de altas × CAC. Para que la publicidad compre usuarios, elegí "altas fijas" en la sección ${N.supuestos}.`;
    case 'soporte-sin-sumar':
      return `Hay ${fmt(aviso.monto)} por mes de soporte cargado como monto fijo que el modelo NO suma a los costos de la etapa real: ahí el soporte se calcula por usuario (sección ${N.unitEconomics}). Si en realidad es un sueldo o un servicio que se paga igual, cambiale el tipo a "Fijo".`;
    case 'etapa-real-vacia':
      return 'La etapa real no tiene gastos cargados: la proyección supone que operar no cuesta nada desde que termina la beta.';
  }
}
