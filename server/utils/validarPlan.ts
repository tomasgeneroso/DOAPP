/**
 * Validación de la FORMA del plan de negocio que llega por PUT /api/admin/business-plan.
 *
 * Por qué existe: la ruta aceptaba cualquier objeto y lo guardaba tal cual. Pueden escribirla el owner
 * y el rol "analista" (que colabora con la proyección, pero no es dueño de nada más), y el plan lo lee
 * la pantalla del owner, el estado real y la economía unitaria. Un `projection: "x"` donde se espera un
 * objeto, un `NaN`/`1e999` en un monto o un arreglo donde va un número dejaba la pantalla del owner sin
 * abrir hasta que alguien arreglara la base a mano.
 *
 * Qué NO hace: no decide qué números son razonables (eso es del dueño del negocio) ni exige que estén
 * todas las claves (lo que falta lo completa `mergeDeep` con los valores por defecto). Sólo exige que lo
 * que llegue tenga el MISMO TIPO que su valor por defecto y que no traiga valores imposibles.
 */

export interface ProblemaDelPlan {
  ruta: string;
  motivo: string;
}

const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);
export const LIMITES_DEL_PLAN = {
  profundidad: 12,
  numeroMaximo: 1e15,
  textoMaximo: 20_000,
  elementosMaximos: 5_000,
  problemasQueSeInforman: 8,
} as const;

type Clase = 'numero' | 'texto' | 'booleano' | 'lista' | 'objeto' | 'nulo' | 'otro';

function claseDe(v: unknown): Clase {
  if (v === null || v === undefined) return 'nulo';
  if (Array.isArray(v)) return 'lista';
  switch (typeof v) {
    case 'number': return 'numero';
    case 'string': return 'texto';
    case 'boolean': return 'booleano';
    case 'object': return 'objeto';
    default: return 'otro';
  }
}

export function validarPlanEnviado(enviado: unknown, porDefecto: unknown): ProblemaDelPlan[] {
  const problemas: ProblemaDelPlan[] = [];
  const informar = (ruta: string, motivo: string) => {
    if (problemas.length < LIMITES_DEL_PLAN.problemasQueSeInforman) problemas.push({ ruta: ruta || '(raíz)', motivo });
  };

  const recorrer = (valor: unknown, defecto: unknown, ruta: string, profundidad: number): void => {
    if (profundidad > LIMITES_DEL_PLAN.profundidad) {
      informar(ruta, 'anidado demasiado profundo');
      return;
    }
    const clase = claseDe(valor);
    // `null` es "sin valor": el servidor lo reemplaza por el valor por defecto al leer.
    if (clase === 'nulo') return;
    if (clase === 'otro') {
      informar(ruta, 'tipo de dato no permitido');
      return;
    }

    const claseEsperada = claseDe(defecto);
    if (claseEsperada !== 'nulo' && clase !== claseEsperada) {
      informar(ruta, `se esperaba ${claseEsperada} y llegó ${clase}`);
      return;
    }

    if (clase === 'numero') {
      const n = valor as number;
      if (!Number.isFinite(n)) informar(ruta, 'número no válido (NaN o infinito)');
      else if (Math.abs(n) > LIMITES_DEL_PLAN.numeroMaximo) informar(ruta, 'número fuera de rango');
    } else if (clase === 'texto') {
      if ((valor as string).length > LIMITES_DEL_PLAN.textoMaximo) informar(ruta, 'texto demasiado largo');
    } else if (clase === 'lista') {
      const lista = valor as unknown[];
      if (lista.length > LIMITES_DEL_PLAN.elementosMaximos) {
        informar(ruta, 'lista demasiado larga');
        return;
      }
      lista.forEach((el, i) => recorrer(el, undefined, `${ruta}[${i}]`, profundidad + 1));
    } else if (clase === 'objeto') {
      for (const [clave, hijo] of Object.entries(valor as Record<string, unknown>)) {
        const rutaHijo = ruta ? `${ruta}.${clave}` : clave;
        if (CLAVES_PROHIBIDAS.has(clave)) {
          informar(rutaHijo, 'nombre de campo no permitido');
          continue;
        }
        const defectoHijo = claseEsperada === 'objeto' ? (defecto as Record<string, unknown>)[clave] : undefined;
        recorrer(hijo, defectoHijo, rutaHijo, profundidad + 1);
      }
    }
  };

  if (claseDe(enviado) !== 'objeto') {
    informar('', 'el plan tiene que ser un objeto');
    return problemas;
  }
  recorrer(enviado, porDefecto, '', 0);
  return problemas;
}
