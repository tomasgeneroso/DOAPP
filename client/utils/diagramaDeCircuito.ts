/** Lo que necesita el dibujo de un circuito, sin nada de pantalla (se prueba aparte): los tipos, el corte de texto en renglones y el cálculo de columnas. */
export type Quien = 'cliente' | 'trabajador' | 'plataforma' | 'equipo' | 'externo';
export type Forma = 'paso' | 'decision' | 'inicio' | 'fin' | 'espera';

export interface PasoDeCircuito {
  id: string;
  texto: string;
  quien?: Quien;
  forma?: Forma;
}

export interface FlechaDeCircuito {
  de: string;
  a: string;
  texto?: string;
  /** La flecha vuelve a un paso anterior (un bucle): se dibuja por debajo. */
  atras?: boolean;
}

/** Parte un texto en renglones de hasta `max` caracteres, sin cortar palabras. */
export function renglones(texto: string, max = 20): string[] {
  const salida: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (actual && (actual + ' ' + palabra).length > max) {
      salida.push(actual);
      actual = palabra;
    } else {
      actual = actual ? actual + ' ' + palabra : palabra;
    }
  }
  if (actual) salida.push(actual);
  return salida.slice(0, 5);
}

/** La columna de cada paso: el camino más largo desde el primero siguiendo solo las flechas que avanzan. */
export function columnasDelCircuito(pasos: PasoDeCircuito[], flechas: FlechaDeCircuito[]): Record<string, number> {
  const nivel: Record<string, number> = {};
  pasos.forEach((p, i) => {
    if (i === 0) nivel[p.id] = 0;
  });
  const hacia = flechas.filter((f) => !f.atras);
  for (let vuelta = 0; vuelta < pasos.length + 1; vuelta++) {
    let cambio = false;
    for (const f of hacia) {
      if (nivel[f.de] === undefined) continue;
      const candidato = nivel[f.de] + 1;
      if (nivel[f.a] === undefined || nivel[f.a] < candidato) {
        nivel[f.a] = candidato;
        cambio = true;
      }
    }
    if (!cambio) break;
  }
  // Un paso al que no llega ninguna flecha queda en la columna 0.
  for (const p of pasos) if (nivel[p.id] === undefined) nivel[p.id] = 0;
  return nivel;
}

