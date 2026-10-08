import { COMMISSION_RATES, MEMBERSHIP_PRICES_EUR } from '../constants/membershipPricing.js';
import { MINIMUM_COMMISSION_EUR } from '../pricing/minimums.js';
import { IVA, MP_FEE_BY_RELEASE_DAYS, splitFees } from '../pricing/processingCost.js';

/**
 * The article the beta banner links to.
 *
 * Lives in shared/ for the same reason the legal texts do: the banner makes a
 * commercial claim ("gratis") and this is where its limits are spelled out, so
 * the two must not be able to drift apart. The seed script reads it from here.
 *
 * Written to be quotable by answer engines — takeaways and FAQ as data, each
 * answer standing on its own — and, more importantly, to be honest about the
 * two things a reader will actually want to know: what "gratis" does not cover,
 * and what happens the day the beta ends.
 *
 * Cada número que el artículo dice sale del código (comisión, precio de la
 * membresía, piso, tasa de procesamiento) y el ejemplo de $36.000 se calcula con
 * la misma cuenta que usa el cobro (`splitFees`). El artículo decía 8% / 3% / 1%,
 * un SUPER PRO y que el cliente pagaba $36.000 en la beta, y nada de eso era lo que
 * se cobraba: ver tests/comisionesSincronizadas.test.ts.
 */

export const BETA_POST_SLUG = 'que-incluye-la-beta-de-doapp';

/* ------------------------------------------------------------------ *
 * Los números del artículo, calculados
 * ------------------------------------------------------------------ */

const COMISION = COMMISSION_RATES.free;
const PRECIO_PRO = MEMBERSHIP_PRICES_EUR.pro;
const PISO = MINIMUM_COMMISSION_EUR;

/**
 * La tasa de procesamiento del ejemplo: la de base. La vigente se configura desde el
 * panel y se publica en la plataforma, así que el ejemplo lo aclara en vez de
 * prometerla.
 */
const TASA = MP_FEE_BY_RELEASE_DAYS[0].base;
const TRABAJO = 36000;

const redondear = (n: number) => Math.round(n * 100) / 100;
const pesos = (n: number) =>
  `$${n.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const porcentaje = (fraccion: number) =>
  `${(fraccion * 100).toLocaleString('es-AR', { maximumFractionDigits: 2 })}%`;

const comisionEjemplo = redondear((TRABAJO * COMISION) / 100);
const ivaComisionEjemplo = redondear(comisionEjemplo * IVA);

/** Lo que paga cada parte en el mismo trabajo, durante la beta y después. */
export const EJEMPLO_DE_LA_BETA = splitFees(TRABAJO, 0, 0, TASA);
export const EJEMPLO_DESPUES_DE_LA_BETA = splitFees(TRABAJO, comisionEjemplo, ivaComisionEjemplo, TASA);

const enBeta = EJEMPLO_DE_LA_BETA;
const despues = EJEMPLO_DESPUES_DE_LA_BETA;

const tablaDelEjemplo = `| | Durante la beta | Desde el 1/1/2027 |
|---|---|---|
| Trabajo | ${pesos(enBeta.jobPrice)} | ${pesos(despues.jobPrice)} |
| Comisión de DoApp (${COMISION}%) | ${pesos(enBeta.commission)} | ${pesos(despues.commission)} |
| Costo de procesamiento del pago (${porcentaje(TASA)}) | ${pesos(enBeta.processingCharge)} | ${pesos(despues.processingCharge)} |
| IVA (21% sobre la comisión y el procesamiento) | ${pesos(enBeta.totalVat)} | ${pesos(despues.totalVat)} |
| **Paga el cliente** | **${pesos(enBeta.clientPays)}** | **${pesos(despues.clientPays)}** |
| **Recibe el trabajador** | **${pesos(enBeta.workerReceives)}** | **${pesos(despues.workerReceives)}** |`;

export const betaPost = {
  slug: BETA_POST_SLUG,
  title: '¿Qué incluye la beta de DoApp y qué cambia después?',
  subtitle:
    'Durante la beta la plataforma no cobra comisión y todas las cuentas tienen las funciones de la membresía PRO. Acá está el detalle, incluido lo que sí se paga y lo que pasa el 1 de enero de 2027.',
  excerpt:
    'DoApp está en beta hasta el 31 de diciembre de 2026. En esa etapa la plataforma no cobra comisión por los contratos y todas las cuentas tienen las funciones de la membresía PRO sin costo. El trabajador recibe el precio del trabajo entero: lo que no se cobra es la comisión de DoApp.',
  category: 'Tips',
  tags: ['beta', 'comisiones', 'membresías', 'membresía pro', 'cómo funciona'],
  metaTitle: '¿Qué incluye la beta de DoApp? Comisiones, membresía PRO y qué cambia',
  metaDescription:
    'Durante la beta DoApp no cobra comisión y todas las cuentas tienen las funciones PRO. Hasta el 31/12/2026. Qué se paga, qué no, y qué cambia después.',

  keyTakeaways: [
    `Durante la beta DoApp no cobra ninguna comisión: si el trabajo vale ${pesos(TRABAJO)}, el trabajador recibe ${pesos(enBeta.workerReceives)} y el cliente paga ese precio más el costo de procesamiento del pago.`,
    'Todas las cuentas tienen las funciones de la membresía PRO sin costo mientras dure la beta.',
    `La beta termina el 31 de diciembre de 2026. A partir del 1 de enero de 2027 se cobra una comisión del ${COMISION}%, a cargo del cliente y la misma para todos los planes, y la membresía PRO pasa a ser paga (€${PRECIO_PRO} por mes).`,
    'El dinero del trabajo va íntegro al trabajador, no a la plataforma: ni la comisión ni el costo de procesamiento se le descuentan.',
    'Los contratos hechos durante la beta conservan sus condiciones: al terminar la beta no se les aplica comisión de forma retroactiva.',
  ],

  faq: [
    {
      question: '¿Qué significa que DoApp no cobra comisión durante la beta?',
      answer: `Significa que la plataforma no retiene nada del monto del contrato. Si acordás un trabajo por ${pesos(TRABAJO)}, el trabajador cobra ${pesos(enBeta.workerReceives)} completos. Fuera de la beta, DoApp cobra una comisión del ${COMISION}% sobre el precio del trabajo, a cargo del cliente, con un piso de EUR ${PISO} (convertido a pesos al cambio del día) y IVA del 21% sobre esa comisión. Es la misma para todos los planes.`,
    },
    {
      question: 'Entonces, ¿qué se paga durante la beta?',
      answer:
        'Se paga el trabajo y el costo de procesamiento del pago. Cuando publicás, el monto del contrato queda en custodia y se libera al trabajador cuando ambas partes confirman que se completó. Ese dinero nunca fue de DoApp: es lo que le corresponde a quien hizo el trabajo. El costo de procesamiento es lo que cobra la pasarela por procesar el pago: lo paga el cliente, se informa con su IVA antes de confirmar el pago y no es una ganancia de DoApp. Lo que no se cobra durante la beta es la comisión de la plataforma.',
    },
    {
      question: '¿Qué incluye la membresía PRO que tengo en la beta?',
      answer:
        'Todas las funciones de la membresía, sin costo: promoción del perfil, insignia, prioridad en las búsquedas y estadísticas de tu actividad. La membresía da visibilidad: no modifica la comisión. Al terminar la beta tu cuenta vuelve al plan que tengas contratado, que por defecto es FREE.',
    },
    {
      question: '¿Qué pasa exactamente el 1 de enero de 2027?',
      answer: `Empieza a cobrarse la comisión del ${COMISION}% sobre el precio de cada contrato nuevo, a cargo del cliente, con un piso de EUR ${PISO} y con IVA del 21% sobre esa comisión. La membresía PRO pasa a estar a la venta: €${PRECIO_PRO} por mes, cobrados en pesos al cambio del día, con renovación mensual. Nadie queda suscripto automáticamente: si no contratás un plan, tu cuenta queda en FREE.`,
    },
    {
      question: '¿La membresía PRO baja la comisión?',
      answer: `No. La comisión es del ${COMISION}% para todos, con o sin membresía, porque la paga el cliente. La membresía PRO (€${PRECIO_PRO} por mes) da visibilidad: promoción del perfil, insignia, prioridad en las búsquedas y estadísticas.`,
    },
    {
      question: '¿Los contratos que hice durante la beta van a pagar comisión después?',
      answer:
        'No. Cada contrato guarda su comisión en el momento en que se crea, así que un contrato hecho durante la beta queda con comisión cero para siempre, incluso si se completa o se cobra después del 31 de diciembre. El cambio de etapa afecta sólo a los contratos nuevos.',
    },
    {
      question: '¿Qué NO cambia al terminar la beta?',
      answer:
        'Todo lo que hace al funcionamiento: la verificación de identidad, el sistema de custodia de pagos, la resolución de disputas, las reseñas y los retiros a CBU siguen igual. La beta afecta al precio, no a cómo funciona la plataforma.',
    },
    {
      question: '¿DoApp verifica a los trabajadores?',
      answer:
        'DoApp verifica la identidad de todos los usuarios mediante un proveedor externo que analiza el documento y hace una prueba de vida. No verifica matrículas profesionales ni pólizas de seguro: esos datos son declarados por el propio trabajador y se muestran como tales. Si contratás un oficio regulado, como gas o electricidad, confirmá la matrícula ante el registro oficial correspondiente.',
    },
    {
      question: '¿Por qué DoApp regala esto durante la beta?',
      answer:
        'Porque necesitamos que la plataforma se use de verdad antes de cobrarla. Los contratos, los pagos y las disputas reales muestran problemas que ninguna prueba interna encuentra. La beta es el período en que corregimos eso, y no nos parece correcto cobrar comisión mientras lo hacemos.',
    },
  ],

  content: `Durante la beta, DoApp no cobra comisión. Si acordás un trabajo por ${pesos(TRABAJO)}, el trabajador recibe ${pesos(enBeta.workerReceives)} y el cliente paga ese precio más el costo de procesamiento del pago. Además, todas las cuentas tienen las funciones de la membresía PRO sin costo. Esto vale hasta el **31 de diciembre de 2026**.

Abajo está el detalle completo: qué incluye, qué se sigue pagando, y qué cambia exactamente el día que la beta termina.

## ¿Qué significa "sin comisión"?

Fuera de la beta, DoApp cobra una comisión del ${COMISION}% sobre el precio del trabajo. La paga el cliente, es la misma para todos los planes, tiene un piso de EUR ${PISO} (convertido a pesos al cambio del día) y lleva IVA del 21%.

Durante la beta esa comisión es cero. La plataforma no retiene nada del monto acordado.

${tablaDelEjemplo}

Fijate en la última fila: el trabajador cobra lo mismo en los dos casos. Ni la comisión ni el costo de procesamiento salen de lo que gana quien trabaja: se suman a lo que paga quien contrata.

El costo de procesamiento del ejemplo usa una tasa de ${porcentaje(TASA)}. La tasa vigente se publica en la plataforma y se informa, con su IVA, antes de confirmar cada pago.

## ¿Qué se paga entonces durante la beta?

El trabajo y el costo de procesamiento del pago. Cuando un cliente publica, el monto del contrato queda **en custodia**: DoApp lo retiene hasta que ambas partes confirman que se completó, y recién ahí se libera al trabajador.

Ese dinero nunca fue de la plataforma. Es lo que le corresponde a quien hizo el trabajo. El costo de procesamiento es lo que cobra la pasarela de pago y no es una ganancia de DoApp. Lo que no se cobra durante la beta es la comisión de DoApp.

## ¿Qué incluye la membresía PRO que tengo ahora?

Las funciones de la membresía, sin costo:

- Promoción de tu perfil
- Insignia en el perfil
- Prioridad en las búsquedas
- Estadísticas de tu actividad

No es una versión de prueba recortada: es la membresía entera, para que puedas evaluarla con tu trabajo real antes de que cueste algo.

Al terminar la beta, tu cuenta vuelve al plan que tengas contratado. Si nunca contrataste ninguno, queda en FREE. **Nadie queda suscripto automáticamente.**

## ¿Qué cambia el 1 de enero de 2027?

Tres cosas, y ninguna más:

1. **Empieza a cobrarse la comisión**: ${COMISION}% sobre el precio del trabajo, a cargo del cliente, con IVA sobre la comisión.
2. **La membresía PRO pasa a ser paga**: €${PRECIO_PRO} por mes, cobrados en pesos al cambio del día. Da visibilidad y no modifica la comisión.
3. **El aviso de beta desaparece** y en su lugar avisamos que la plataforma pasó a su versión estable.

## ¿Y qué NO cambia?

Todo lo que hace al funcionamiento:

- La verificación de identidad
- El sistema de custodia de pagos
- La resolución de disputas
- Las reseñas y calificaciones
- Los retiros a CBU

La beta afecta el precio, no cómo funciona la plataforma.

## ¿Los contratos de la beta pagan comisión después?

No. Cada contrato guarda su comisión en el momento de crearse. Un contrato hecho durante la beta queda con comisión cero **para siempre**, aunque se complete o se cobre en 2027.

El cambio de etapa afecta sólo a los contratos nuevos.

## Una aclaración sobre las matrículas

DoApp verifica la **identidad** de todos los usuarios: un proveedor externo analiza el documento y hace una prueba de vida.

**No verifica matrículas profesionales ni pólizas de seguro.** Cuando un trabajador muestra una matrícula en su perfil, ese dato fue declarado por él y se identifica como tal.

Si vas a contratar un oficio regulado —gas, electricidad, obra— confirmá la matrícula ante el registro oficial correspondiente. Es un chequeo de dos minutos que ninguna plataforma reemplaza hoy.

## ¿Por qué hacemos esto?

Porque necesitamos que la plataforma se use de verdad antes de cobrarla.

Los contratos reales, los pagos reales y las disputas reales muestran problemas que ninguna prueba interna encuentra. La beta es el período en que los corregimos, y no nos parece bien cobrar comisión mientras lo hacemos.

Cuando llegue el 31 de diciembre lo vamos a avisar con tiempo, acá y dentro de la aplicación. La fecha está fijada desde el primer día justamente para que no sea una sorpresa.`,
};
