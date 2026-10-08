import express, { Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { BusinessPlan } from '../../models/sql/BusinessPlan.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { User } from '../../models/sql/User.model.js';
import { protect, requireAdminRole } from '../../middleware/auth.js';
import { logAudit } from '../../utils/auditLog.js';
import { validarPlanEnviado } from '../../utils/validarPlan.js';
import currencyExchange from '../../services/currencyExchange.js';
import { getLiveFinancials } from '../../services/liveFinancials.js';
import { getUnitEconomics } from '../../services/unitEconomics.js';
import { ROLES_DE_ANALISIS } from '../../../shared/auth/accesoAnalisis.js';
import {
  META_RUNWAY_FASE1_MESES,
  SUPUESTOS_UE_DE_ARRANQUE,
} from '../../../shared/pricing/unidadEconomica.js';
import {
  ACTIVOS_PCT_POR_DEFECTO,
  coordinarPlan,
  mesesHastaFinDeBeta,
  type PlanCoordinable,
} from '../../../shared/pricing/planCoordinado.js';
import { PRESUPUESTO_DE_ARRANQUE_USD } from '../../../shared/pricing/gastos.js';
import { fechasDeFase } from '../../services/platformPhase.js';
import type { AuthRequest } from '../../types/index.js';

const router = express.Router();

/** Sólo el owner ve y edita la proyección de gastos */
/**
 * Quién ve y edita los números del negocio.
 *
 * El owner, y el rol 'analista' —gente que colabora en proyectar el
 * presupuesto y no tiene por qué ver usuarios, pagos ni documentación de
 * identidad—. Darles 'admin' para que entren a dos pantallas sería darles
 * acceso a treinta, y el acceso se concede por lo que la persona necesita
 * hacer, no por comodidad de quien lo concede.
 */
const analisisOnly = requireAdminRole(...ROLES_DE_ANALISIS);

const PLAN_SLUG = 'constitucion';

/**
 * Valores por defecto del plan. Son orientativos: el owner los ajusta y el
 * plan queda guardado en la base, compartido entre sus dispositivos.
 */
const defaultPlan = () => ({
  baseCurrency: 'EUR',
  rateArs: 1560,
  rateUsd: 1.08,
  ratesUpdatedAt: null as string | null,
  capitalCurrency: 'ARS',
  capitalInicial: 500000,
  constCurrency: 'ARS',
  const: [
    { c: 'Honorarios gestor/contador — constitución integral', d: 'Redacción de estatuto, gestión del trámite TAD, presentación ante el Registro Público y seguimiento hasta la inscripción.', m: 300000, f: '', e: 'Pendiente' },
    { c: 'Tasa Registro Público de Comercio (Corrientes)', d: 'Arancel de inscripción de la sociedad ante el organismo provincial correspondiente.', m: 8000, f: '', e: 'Pendiente' },
    { c: 'Publicación Boletín Oficial', d: 'Edicto obligatorio anunciando la constitución de la sociedad.', m: 20000, f: '', e: 'Pendiente' },
    { c: 'Depósito capital social mínimo (25% de 2 SMVM)', d: 'Integración inicial del capital social en una cuenta bancaria a nombre de la sociedad en formación.', m: 173400, f: '', e: 'Pendiente' },
    { c: 'Certificación de firmas / escribano', d: 'Sólo si el estatuto se firma por instrumento privado con certificación notarial en lugar de firma digital.', m: 30000, f: '', e: 'Pendiente' },
    { c: 'Alta CUIT / ARCA e Ingresos Brutos', d: 'Trámite sin costo, pero necesario para habilitar fiscalmente a la sociedad una vez inscripta.', m: 0, f: '', e: 'Pendiente' },
    { c: 'Apertura cuenta bancaria de la sociedad', d: 'Cuenta corriente a nombre de la SAS para operar y recibir el capital integrado.', m: 0, f: '', e: 'Pendiente' },
    { c: 'Asesoría legal laboral — retainer 1er mes', d: 'Abogado especializado en gig economy para blindar contratos con Doers desde el día 1.', m: 200000, f: '', e: 'Pendiente' },
  ],
  // Gastos de la BETA. Los de la etapa real (`budgetReal`, `budgetRealCurrency`)
  // NO tienen valor por defecto a propósito: nacen como copia de estos, tal como
  // los dejó el owner, en `coordinarPlan`. Un valor por defecto acá le habría
  // puesto a un plan viejo los rubros de fábrica en lugar de los suyos.
  budgetCurrency: 'USD',
  budget: PRESUPUESTO_DE_ARRANQUE_USD.map((fila) => ({ ...fila })),
  // Cuántos meses dura la beta: los que faltan hasta la fecha de cierre publicada.
  betaMeses: mesesHastaFinDeBeta(new Date(), fechasDeFase().betaEndsAt),
  checklist: [
    { t: 'Validaste el problema con 20+ entrevistas reales a Doers y Clientes', w: 15, on: false },
    { t: 'Tenés abogado laboral especializado en gig economy consultado', w: 20, on: false },
    { t: 'Revisaste que el modelo no configure relación de dependencia encubierta (Art. 23/24/25 LCT)', w: 20, on: false },
    { t: 'Conseguiste compromiso de 20-50 Doers verificados para el barrio piloto', w: 15, on: false },
    { t: 'Diseñaste el flujo de disputas (meta: 80% resuelto sin humano en <72hs)', w: 10, on: false },
    { t: 'Validaste la integración con MercadoPago como PSP para la sociedad', w: 10, on: false },
    { t: `Tenés capital para cubrir ${META_RUNWAY_FASE1_MESES}+ meses de runway de Fase 1`, w: 5, on: false },
    { t: 'Tenés al menos un socio/cofundador comprometido full-time', w: 5, on: false },
  ],
  timeline: [
    { h: 'MVP validado (barrio piloto)', d: '', s: 'Pendiente' },
    { h: 'Constitución de la SAS', d: '', s: 'Pendiente' },
    { h: 'Product-Market Fit (40%+ retención M3)', d: '', s: 'Pendiente' },
    { h: 'Unit economics positivos (LTV/CAC > 3x)', d: '', s: 'Pendiente' },
    { h: 'Tracción Argentina (10K MAU)', d: '', s: 'Pendiente' },
    { h: 'Seed round ready', d: '', s: 'Pendiente' },
    { h: 'Serie A ready (3 países)', d: '', s: 'Pendiente' },
  ],
  ueCurrency: 'USD',
  /**
   * Unidad economica, POR USUARIO ACTIVO Y POR MES.
   *
   * `soporte` es un importe fijo; `disputas` y `fraude` son porcentajes del
   * volumen (ticket x contratos), porque escalan con la plata que pasa y no
   * con la cantidad de gente. La cuenta vive en
   * shared/pricing/unidadEconomica.ts, una sola vez.
   *
   * Los valores de arranque, y por que:
   *
   *  comision 10  Es la del codigo (COMMISSION_RATES.free). Estuvo en 12 y eso
   *               sobreestimaba el ingreso un 20% en toda proyeccion hecha con
   *               este plan.
   *  ticket 21    ~ARS 34.700 al cambio, que es el precio donde el piso de
   *               comision deja de morder (precioDondeElPisoDejaDeMorder en
   *               shared/pricing/minimums.ts). Por debajo de ese numero la
   *               comision minima se come una proporcion grande del trabajo,
   *               asi que es el ticket mas chico que tiene sentido modelar.
   *               Estuvo en 85 (ARS 132.600), que es un trabajo grande y no el
   *               tipico.
   *  soporte, disputas y fraude: supuestos MINIMOS, no mediciones (no hay
   *               volumen para medirlos). El porque de cada valor esta en
   *               SUPUESTOS_UE_DE_ARRANQUE (shared/pricing/unidadEconomica.ts).
   *
   * Con estos valores el costo por contrato queda en el mismo orden que
   * MARGINAL_COST_PER_CONTRACT_ARS, que es lo que el codigo ya usa para
   * calcular el minimo de ampliacion. Antes daba 39 veces mas.
   */
  // Los valores viven en shared/pricing/unidadEconomica.ts (SUPUESTOS_UE_DE_ARRANQUE)
  // para que la guía del análisis arme su ejemplo con los mismos números.
  ue: { ...SUPUESTOS_UE_DE_ARRANQUE },

  // Proyección mes a mes: crecimiento, monetización, costos e impuestos.
  // Las alícuotas son las de una SAS argentina inscripta en IVA.
  // Caso base deliberadamente pesimista: la idea es que si se cumple ESTO, los
  // gastos igual se cubren. Los costos son los reales contratados; los
  // supuestos de demanda son los conservadores.
  //
  // OJO: varios de estos campos NO son entradas. `coordinarPlan` (shared/pricing/
  // planCoordinado.ts) los pisa cada vez que se lee el plan con lo que viene de
  // los otros bloques: ticket, comisión, contratos por usuario, soporte, disputas,
  // fraude y costos fijos salen de la economía unitaria y de los gastos de la
  // etapa real; las altas, de la publicidad ÷ CAC; la beta, de los gastos de la
  // beta. Los valores de abajo sólo importan si esa derivación falla. Lo que sí es
  // una entrada: churn, techo, CAC, % de usuarios activos, infraestructura,
  // membresía, publicidad cobrada, crecimiento de los fijos e impuestos.
  projectionCurrency: 'EUR',
  projection: {
    growth: {
      // Arranca de cero: la beta todavía no salió.
      usuariosIniciales: 0,
      modoCrecimiento: 'absoluto',
      crecimientoPct: 0,
      // 100 altas al mes es lo que razonablemente compran EUR 400 de pauta.
      altasPorMes: 100,
      // Churn alto a propósito: a un plomero no se lo llama todos los meses,
      // así que mucha gente se registra, usa una vez y no vuelve.
      churnPct: 12,
      techoUsuarios: 20000,
      // De cada 100 usuarios registrados, cuántos contratan en un mes. Pasa de la
      // economía unitaria (por usuario ACTIVO) a la proyección (por registrado).
      activosPct: ACTIVOS_PCT_POR_DEFECTO,
      // La proyección corre 120 meses y la pantalla muestra 1, 3, 5 o 10 años.
      horizonteMeses: 120,
      mesInicio: new Date().toISOString().slice(0, 7),
    },
    revenue: {
      // EUR 22 ≈ ARS 40.000, el ticket medio esperado de un trabajo de oficio.
      ticket: 22,
      // 0,15 contratos por usuario por mes. El valor de referencia del sector
      // para marketplaces de servicios del hogar, no el de una app de delivery:
      // la frecuencia de uso es baja por naturaleza.
      contratosPorUsuario: 0.15,
      // 8%: la comisión del plan FREE, que es donde va a estar casi todo el
      // mundo. Durante la beta es 0.
      comisionPct: 8,
      // Nadie paga membresía todavía. Suponer que sí infla el modelo entero.
      membresiaPct: 0,
      membresiaPrecio: 5,
      publicidadMensual: 0,
      ingresosConIva: true,
    },
    costs: {
      // Didit cobra EUR 1,50 por verificación de identidad, gratis hasta 500.
      // Se carga completo igual: el plan gratis se acaba justo cuando empieza
      // a haber volumen.
      soportePorUsuario: 1.5,
      infraPorUsuario: 0,
      // 0: el costo de la pasarela se le traslada al cliente como línea
      // separada (ver shared/pricing/processingCost.ts), así que no es un
      // costo de la plataforma.
      pspPct: 0,
      disputasPct: 1,
      fraudePct: 0.5,
      // EUR 400 de pauta / 100 altas.
      cac: 4,
      // VPS 29 + dominio 1,50 + publicidad 400.
      //
      // Sin sueldo: el primer año el dueño no retira. Eso baja el equilibrio de
      // 5.587 usuarios a 1.687, y es la diferencia entre un objetivo alcanzable
      // y uno que no lo es. No significa que el soporte sea gratis: significa
      // que lo paga con su tiempo en vez de con caja. El costo reaparece cuando
      // el volumen supere lo que una persona sola puede atender (ver el techo
      // de capacidad mas abajo).
      fijosMensuales: 430.5,
      // Compuesto: 2% por mes son +27% por año y x10,8 a los diez años, que con la
      // proyección a 5 y 10 años convertía un supuesto de "alguna contratación" en
      // una estructura once veces más grande que no se decidió contratar. 0,5% por
      // mes (~6% anual) deja los fijos creciendo sin inventar un equipo. Un plan ya
      // guardado conserva el valor que tenga.
      fijosCrecimientoPct: 0.5,
      costosConIvaPct: 70,
    },
    // Alícuotas de una SAS inscripta en Corrientes. Ganancias al 35%, el tramo
    // más alto: en un caso base pesimista no corresponde suponer el más bajo.
    taxes: { ivaPct: 21, iibbPct: 4, chequePct: 0.6, gananciasPct: 35 },
  },
});

/** Completa el guardado con los valores por defecto que le falten */
function mergeDeep(defaults: any, saved: any): any {
  const out: Record<string, any> = { ...defaults, ...saved };
  for (const [key, value] of Object.entries(defaults)) {
    if (out[key] === undefined || out[key] === null) out[key] = value;
    else if (
      value && typeof value === 'object' && !Array.isArray(value) &&
      out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])
    ) {
      out[key] = mergeDeep(value, out[key]);
    }
  }
  return out;
}

/**
 * El plan guardado, completo y con los bloques coordinados.
 *
 * TODO lo que lee el plan —la pantalla, el estado real, la economía unitaria— lo
 * recibe por acá. Antes cada uno leía lo que había en la base, y la base tenía
 * dos tickets y dos costos fijos distintos que cada lector resolvía a su manera.
 *
 * Si la coordinación falla se devuelve el plan sin coordinar, y se registra: una
 * pantalla con números a medio derivar es mejor que una pantalla que no abre,
 * pero no puede pasar callado.
 */
/**
 * Qué claves le faltan al plan guardado y se completaron con el valor por defecto.
 *
 * Importa porque algunos valores por defecto dependen del reloj —el mes de inicio de
 * la proyección y cuántos meses de beta quedan— y mientras no estén GUARDADOS se
 * recalculan en cada lectura: el número cambiaba solo, mes a mes, sin que nadie lo
 * tocara. La pantalla guarda lo que le falta apenas lo recibe, y desde ahí el número
 * es el guardado y sólo cambia cuando alguien lo modifica y guarda.
 *
 * Las claves cuyo valor por defecto es `null` no cuentan (no hay nada que fijar), y
 * tampoco las derivadas por `coordinarPlan`, que salen siempre de lo guardado.
 */
function clavesCompletadasConDefectos(guardado: unknown, defaults: unknown, prefijo = ''): string[] {
  const esObjeto = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);
  if (!esObjeto(defaults)) return [];
  const faltan: string[] = [];
  for (const [clave, porDefecto] of Object.entries(defaults)) {
    const valor = esObjeto(guardado) ? guardado[clave] : undefined;
    const ruta = prefijo + clave;
    if (valor === undefined || valor === null) {
      if (porDefecto !== null && porDefecto !== undefined) faltan.push(ruta);
    } else if (esObjeto(porDefecto) && esObjeto(valor)) {
      faltan.push(...clavesCompletadasConDefectos(valor, porDefecto, `${ruta}.`));
    }
  }
  return faltan;
}

/**
 * Igual que `planCompleto`, pero dice si la coordinación falló.
 *
 * La coordinación se hace sobre una COPIA: `coordinarPlan` muta el plan, y si falla a mitad de camino
 * dejaría números a medio derivar mezclados con los guardados. Con la copia, un fallo devuelve el plan
 * tal como estaba guardado (completo con los valores por defecto) y no una mezcla. Y se avisa: antes el
 * error sólo iba a la consola y la pantalla mostraba números sin coordinar como si estuvieran bien.
 */
function planCompletoConEstado(guardado: unknown): { data: any; coordinacionFallida: boolean } {
  const data = mergeDeep(defaultPlan(), guardado || {});
  try {
    const coordinado = JSON.parse(JSON.stringify(data));
    coordinarPlan(coordinado as PlanCoordinable);
    return { data: coordinado, coordinacionFallida: false };
  } catch (error) {
    console.error('[business-plan] No se pudieron coordinar los bloques del plan:', error);
    return { data, coordinacionFallida: true };
  }
}

function planCompleto(guardado: unknown): any {
  return planCompletoConEstado(guardado).data;
}

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

/**
 * Números reales de la plataforma, para contrastar los supuestos de la
 * proyección con lo que efectivamente está pasando. Todo en ARS.
 */
async function platformActuals() {
  const last30 = daysAgo(30);
  const last90 = daysAgo(90);

  const [recentContracts, completedRecent, revenueRow, ticketRow, commissionRow] =
    await Promise.all([
      Contract.findAll({
        where: { createdAt: { [Op.gte]: last30 } },
        attributes: ['clientId', 'doerId'],
        raw: true,
      }),
      Contract.count({ where: { createdAt: { [Op.gte]: last30 } } }),
      Payment.findOne({
        where: { status: 'completed', createdAt: { [Op.gte]: last30 } },
        attributes: [[fn('SUM', col('platform_fee')), 'total']],
        raw: true,
      }) as any,
      Contract.findOne({
        where: { status: 'completed', updatedAt: { [Op.gte]: last90 } },
        attributes: [[fn('AVG', col('price')), 'avg']],
        raw: true,
      }) as any,
      Payment.findOne({
        where: {
          status: 'completed',
          createdAt: { [Op.gte]: last90 },
          amount: { [Op.gt]: 0 },
        },
        attributes: [
          [literal('AVG(platform_fee / NULLIF(amount, 0)) * 100'), 'avgPct'],
        ],
        raw: true,
      }) as any,
    ]);

  // MAU: personas distintas con al menos un contrato en los últimos 30 días
  const activeUsers = new Set<string>();
  for (const contract of recentContracts as any[]) {
    if (contract.clientId) activeUsers.add(contract.clientId.toString());
    if (contract.doerId) activeUsers.add(contract.doerId.toString());
  }

  const mau = activeUsers.size;

  return {
    currency: 'ARS',
    mau,
    contratosUltimos30: completedRecent,
    contratosPorUsuario: mau > 0 ? Math.round((completedRecent / mau) * 100) / 100 : 0,
    ticketPromedio: Math.round(Number(ticketRow?.avg) || 0),
    comisionPromedio: Math.round((Number(commissionRow?.avgPct) || 0) * 10) / 10,
    ingresoUltimos30: Math.round(Number(revenueRow?.total) || 0),
    usuariosTotales: await User.count({ where: { isBanned: false } }),
    calculadoEn: new Date().toISOString(),
  };
}

/**
 * @route   GET /api/admin/business-plan
 * @desc    Plan guardado + números reales de la plataforma
 * @access  Owner only
 */
router.get('/', protect, analisisOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plan = await BusinessPlan.findOne({
      where: { slug: PLAN_SLUG },
      include: [{ model: User, as: 'updatedBy', attributes: ['id', 'name'] }],
    });

    const actuals = await platformActuals().catch((error) => {
      console.warn('No se pudieron calcular los datos reales:', error.message);
      return null;
    });

    // Un plan guardado antes de agregar una sección no tiene esa clave:
    // se completa con el valor por defecto en vez de romper la pantalla.
    const guardado = plan?.data && Object.keys(plan.data).length > 0 ? plan.data : {};
    const { data, coordinacionFallida } = planCompletoConEstado(guardado);
    // Lo que no estaba guardado y salió del valor por defecto: la pantalla lo guarda
    // al recibirlo, para que no vuelva a cambiar solo. `budgetReal` no tiene valor por
    // defecto (nace como copia de la beta), así que se pregunta aparte.
    const completadoConDefectos = [
      ...clavesCompletadasConDefectos(guardado, defaultPlan()),
      ...['budgetReal', 'budgetRealCurrency'].filter(
        (k) => (guardado as Record<string, unknown>)[k] === undefined || (guardado as Record<string, unknown>)[k] === null,
      ),
    ];

    res.json({
      success: true,
      data,
      coordinacionFallida,
      completadoConDefectos,
      isDefault: !plan,
      updatedAt: plan?.updatedAt || null,
      updatedBy: (plan as any)?.updatedBy?.name || null,
      actuals,
    });
  } catch (error: any) {
    console.error('Error obteniendo el plan de negocio:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * @route   GET /api/admin/business-plan/live
 * @desc    Estado financiero real, medido contra el plan guardado
 * @access  Owner only
 *
 * Va aparte del GET del plan porque son dos preguntas distintas: el plan es
 * "si pasa X, cuanto gano" y esto es "que esta pasando y cuanto me falta".
 * Separarlas ademas permite refrescar los numeros reales sin recargar toda la
 * hoja de supuestos.
 */
router.get('/live', protect, analisisOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plan = await BusinessPlan.findOne({ where: { slug: PLAN_SLUG } });
    const data = planCompleto(plan?.data);
    const live = await getLiveFinancials(data);
    res.json({ success: true, data: live });
  } catch (error: any) {
    console.error('Error calculando el estado financiero real:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/admin/business-plan
 * @desc    Guardar el plan
 * @access  Owner only
 */
/**
 * @route   GET /api/admin/business-plan/unit-economics
 * @desc    CAC, LTV, LTV/CAC, payback, runway y retencion por cohorte
 * @access  Owner only
 *
 * Va aparte de /live porque responde otra pregunta. /live dice cuanto entro
 * este mes y cuanto falta para cubrir los gastos; esto dice si el negocio
 * cierra: si conseguir un cliente cuesta menos de lo que ese cliente deja.
 * Con la primera se opera; con la segunda se decide si poner mas plata en
 * pauta, que es una decision distinta y mas cara de equivocar.
 *
 * Los supuestos salen del mismo plan guardado, asi que corregir el plan
 * corrige estas metricas sin tocar codigo.
 */
router.get('/unit-economics', protect, analisisOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plan = await BusinessPlan.findOne({ where: { slug: PLAN_SLUG } });
    const data = planCompleto(plan?.data);
    res.json({ success: true, data: await getUnitEconomics(data) });
  } catch (error: any) {
    console.error('Error calculando unit economics:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * @route   PUT /api/admin/business-plan
 * @desc    Guardar el plan
 * @access  Owner only
 */
router.put('/', protect, analisisOnly, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { data } = req.body;

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      res.status(400).json({ success: false, message: 'El plan enviado no es válido' });
      return;
    }

    // Cota de tamaño: el plan es una hoja de trabajo, no un depósito de datos
    if (JSON.stringify(data).length > 512 * 1024) {
      res.status(413).json({ success: false, message: 'El plan es demasiado grande' });
      return;
    }

    // La forma: cada campo con el mismo tipo que su valor por defecto, sin NaN/infinitos ni nombres
    // peligrosos. Antes se guardaba cualquier objeto y uno mal formado dejaba sin abrir la pantalla.
    const problemas = validarPlanEnviado(data, defaultPlan());
    if (problemas.length > 0) {
      res.status(400).json({
        success: false,
        code: 'PLAN_INVALID',
        message: `El plan tiene datos que no corresponden: ${problemas.map((p) => `${p.ruta} (${p.motivo})`).join('; ')}`,
        problemas,
      });
      return;
    }

    // Control de versión: el cliente manda el `updatedAt` que cargó. Si alguien guardó después,
    // este guardado pisaría su trabajo (el PUT reemplaza el plan entero), así que se rechaza.
    // Un cliente que no manda `baseUpdatedAt` (versión vieja de la pantalla) se acepta como antes.
    const mandaBase = Object.prototype.hasOwnProperty.call(req.body, 'baseUpdatedAt');
    let base: number | null = null;
    if (mandaBase && req.body.baseUpdatedAt !== null) {
      base = new Date(req.body.baseUpdatedAt).getTime();
      if (!Number.isFinite(base)) {
        res.status(400).json({ success: false, message: 'baseUpdatedAt no es una fecha válida' });
        return;
      }
    }

    // La fila se bloquea mientras se compara y se escribe: sin eso, dos guardados simultáneos
    // pasan la comparación los dos y el segundo pisa al primero igual.
    const resultado = await BusinessPlan.sequelize!.transaction(async (t) => {
      const existing = await BusinessPlan.findOne({ where: { slug: PLAN_SLUG }, transaction: t, lock: t.LOCK.UPDATE });
      if (existing && mandaBase && existing.updatedAt.getTime() !== base) {
        return { conflicto: existing.updatedAt as Date };
      }
      if (existing) {
        await existing.update({ data, updatedById: req.user!.id }, { transaction: t });
        return { plan: existing };
      }
      return { plan: await BusinessPlan.create({ slug: PLAN_SLUG, data, updatedById: req.user!.id }, { transaction: t }) };
    });

    if ('conflicto' in resultado) {
      res.status(409).json({
        success: false,
        code: 'PLAN_CONFLICT',
        message: 'Otra persona guardó cambios en el plan mientras lo editabas. Recargá la página para ver su versión.',
        updatedAt: resultado.conflicto,
      });
      return;
    }
    const plan = resultado.plan;

    await logAudit({
      req,
      action: 'business_plan.update',
      category: 'system',
      severity: 'low',
      description: 'Actualizó la proyección de gastos y constitución',
      targetModel: 'BusinessPlan',
      targetId: plan.id,
    });

    res.json({ success: true, updatedAt: plan.updatedAt });
  } catch (error: any) {
    console.error('Error guardando el plan de negocio:', error);
    res.status(500).json({ success: false, message: error.message || 'Error del servidor' });
  }
});

/**
 * @route   GET /api/admin/business-plan/rates
 * @desc    Cotización del día para no cargarla a mano
 * @access  Owner only
 */
router.get('/rates', protect, analisisOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const [usdArs, eurArs] = await Promise.all([
      currencyExchange.getUSDtoARSRate(),
      currencyExchange.getEURtoARSRate(),
    ]);

    // El plan carga "1 EUR = X ARS" y "1 EUR = Y USD"
    const rateUsd = usdArs > 0 ? Math.round((eurArs / usdArs) * 10000) / 10000 : null;

    res.json({
      success: true,
      rateArs: Math.round(eurArs * 100) / 100,
      rateUsd,
      usdArs: Math.round(usdArs * 100) / 100,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('Error obteniendo cotizaciones:', error);
    res.status(502).json({
      success: false,
      message: 'No pudimos traer la cotización del día. Cargala a mano.',
    });
  }
});

export default router;
