/**
 * Dónde poner el globo de explicación de un concepto.
 *
 * Es una función aparte, sin tocar el DOM, porque es la parte que se rompe: un
 * globo mal puesto queda cortado por el borde de la pantalla o tapa justo el
 * concepto que explica, y desde afuera sólo se ve "no se lee". El cliente no tiene
 * entorno de DOM para probar componentes, así que la cuenta vive acá, donde se
 * puede probar.
 *
 * Todas las medidas son coordenadas de ventana (lo que da `getBoundingClientRect`),
 * porque el globo se dibuja con `position: fixed` fuera de la tabla o del
 * contenedor con scroll que contiene al concepto; adentro de uno de esos
 * contenedores el globo quedaría recortado.
 */

export interface Caja {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface Medida {
  width: number;
  height: number;
}

export interface PosicionDelGlobo {
  top: number;
  left: number;
  lado: 'abajo' | 'arriba';
}

export function posicionarGlobo(
  disparador: Caja,
  globo: Medida,
  ventana: Medida,
  separacion = 8,
  margen = 8,
): PosicionDelGlobo {
  const debajo = disparador.top + disparador.height + separacion;
  const encima = disparador.top - separacion - globo.height;

  const cabeAbajo = debajo + globo.height <= ventana.height - margen;
  const cabeArriba = encima >= margen;

  // Preferencia: abajo, como se lee. Si no entra, arriba. Si no entra en ninguno,
  // del lado con más lugar, y se acota para que al menos arranque visible.
  let lado: PosicionDelGlobo['lado'];
  if (cabeAbajo) lado = 'abajo';
  else if (cabeArriba) lado = 'arriba';
  else {
    const lugarAbajo = ventana.height - (disparador.top + disparador.height);
    const lugarArriba = disparador.top;
    lado = lugarAbajo >= lugarArriba ? 'abajo' : 'arriba';
  }

  const topIdeal = lado === 'abajo' ? debajo : encima;
  const topMaximo = Math.max(margen, ventana.height - globo.height - margen);
  const top = Math.min(Math.max(topIdeal, margen), topMaximo);

  // Centrado sobre el concepto, sin salirse por ningún borde. Si el globo es más
  // ancho que la ventana, manda el borde izquierdo: es por donde se empieza a leer.
  const centrado = disparador.left + disparador.width / 2 - globo.width / 2;
  const leftMaximo = ventana.width - globo.width - margen;
  const left = leftMaximo < margen ? margen : Math.min(Math.max(centrado, margen), leftMaximo);

  return { top, left, lado };
}
