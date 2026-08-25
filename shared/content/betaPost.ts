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
 */

export const BETA_POST_SLUG = 'que-incluye-la-beta-de-doapp';

export const betaPost = {
  slug: BETA_POST_SLUG,
  title: '¿Qué incluye la beta de DoApp y qué cambia después?',
  subtitle:
    'Durante la beta la plataforma no cobra comisión y todas las cuentas tienen SUPER PRO. Acá está el detalle, incluido lo que sí se paga y lo que pasa el 1 de enero de 2027.',
  excerpt:
    'DoApp está en beta hasta el 31 de diciembre de 2026. En esa etapa la plataforma no cobra comisión por los contratos y todas las cuentas tienen la membresía SUPER PRO sin costo. El dinero del trabajo sigue siendo del trabajador: lo que no se cobra es la comisión de DoApp.',
  category: 'Tips',
  tags: ['beta', 'comisiones', 'membresías', 'super pro', 'cómo funciona'],
  metaTitle: '¿Qué incluye la beta de DoApp? Comisiones, SUPER PRO y qué cambia',
  metaDescription:
    'Durante la beta DoApp no cobra comisión y todas las cuentas tienen SUPER PRO. Hasta el 31/12/2026. Qué se paga, qué no, y qué cambia después.',

  keyTakeaways: [
    'Durante la beta DoApp no cobra ninguna comisión: si el trabajo vale $36.000, el cliente paga $36.000 y el trabajador recibe $36.000.',
    'Todas las cuentas tienen la membresía SUPER PRO sin costo mientras dure la beta, con todas las funciones habilitadas.',
    'La beta termina el 31 de diciembre de 2026; a partir del 1 de enero de 2027 se aplican las comisiones según el plan y las membresías pasan a ser pagas.',
    'Lo que sí se paga durante la beta es el trabajo en sí, y ese dinero va íntegro al trabajador, no a la plataforma.',
    'Los contratos hechos durante la beta conservan sus condiciones: al terminar la beta no se les aplica comisión de forma retroactiva.',
  ],

  faq: [
    {
      question: '¿Qué significa que DoApp no cobra comisión durante la beta?',
      answer:
        'Significa que la plataforma no retiene nada del monto del contrato. Si acordás un trabajo por $36.000, el cliente paga $36.000 y el trabajador cobra $36.000 completos. Fuera de la beta, DoApp cobra entre 1% y 8% según el plan del cliente, con un mínimo de $1.000, más IVA sobre esa comisión.',
    },
    {
      question: 'Entonces, ¿qué se paga durante la beta?',
      answer:
        'Se paga el trabajo. Cuando publicás, el monto del contrato queda en custodia y se libera al trabajador cuando ambas partes confirman que se completó. Ese dinero nunca fue de DoApp: es lo que le corresponde a quien hizo el trabajo. Lo que no se cobra durante la beta es la comisión de la plataforma.',
    },
    {
      question: '¿Qué incluye la membresía SUPER PRO que tengo en la beta?',
      answer:
        'Todas las funciones del plan más alto, sin costo: el panel de analíticas con exportación a CSV y PDF, los contratos mensuales sin comisión, y el resto de las herramientas de la cuenta. Es la membresía completa, no una versión recortada. Al terminar la beta tu cuenta vuelve al plan que tengas contratado, que por defecto es FREE.',
    },
    {
      question: '¿Qué pasa exactamente el 1 de enero de 2027?',
      answer:
        'Empiezan a aplicarse las comisiones según el plan de cada cliente: 8% en FREE, 3% en PRO y 1% en SUPER PRO, con un mínimo de $1.000 y con IVA del 21% sobre esa comisión. Las membresías PRO y SUPER PRO pasan a ser pagas. Nadie queda suscripto automáticamente: si no contratás un plan, tu cuenta queda en FREE.',
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

  content: `Durante la beta, DoApp no cobra comisión. Si acordás un trabajo por $36.000, el cliente paga $36.000 y el trabajador recibe $36.000. Además, todas las cuentas tienen la membresía SUPER PRO sin costo. Esto vale hasta el **31 de diciembre de 2026**.

Abajo está el detalle completo: qué incluye, qué se sigue pagando, y qué cambia exactamente el día que la beta termina.

## ¿Qué significa "sin comisión"?

Fuera de la beta, DoApp cobra un porcentaje de cada contrato según el plan del cliente: 8% en FREE, 3% en PRO y 1% en SUPER PRO, con un mínimo de $1.000 y con IVA del 21% aplicado sobre esa comisión.

Durante la beta ese porcentaje es cero. La plataforma no retiene nada del monto acordado.

| | Durante la beta | Desde el 1/1/2027 (plan FREE) |
|---|---|---|
| Trabajo | $36.000 | $36.000 |
| Comisión | $0 | $2.880 |
| IVA sobre la comisión | $0 | $604,80 |
| **Paga el cliente** | **$36.000** | **$39.484,80** |
| **Recibe el trabajador** | **$36.000** | **$36.000** |

Fijate en la última fila: el trabajador cobra lo mismo en los dos casos. La comisión no sale de lo que gana quien trabaja, se suma a lo que paga quien contrata.

## ¿Qué se paga entonces durante la beta?

El trabajo. Cuando un cliente publica, el monto del contrato queda **en custodia**: DoApp lo retiene hasta que ambas partes confirman que se completó, y recién ahí se libera al trabajador.

Ese dinero nunca fue de la plataforma. Es lo que le corresponde a quien hizo el trabajo. Lo que no se cobra durante la beta es la comisión de DoApp.

## ¿Qué incluye el SUPER PRO que tengo ahora?

La membresía completa del plan más alto, sin costo:

- Panel de analíticas de tu actividad, con exportación a CSV y PDF
- Contratos mensuales sin comisión
- El resto de las herramientas de cuenta del plan

No es una versión de prueba recortada: es el plan entero, para que puedas evaluarlo con tu trabajo real antes de que cueste algo.

Al terminar la beta, tu cuenta vuelve al plan que tengas contratado. Si nunca contrataste ninguno, queda en FREE. **Nadie queda suscripto automáticamente.**

## ¿Qué cambia el 1 de enero de 2027?

Tres cosas, y ninguna más:

1. **Las comisiones empiezan a aplicarse** según el plan del cliente, con IVA sobre la comisión.
2. **Las membresías pasan a ser pagas**: PRO a $4.999 por mes y SUPER PRO a $8.999 por mes.
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
