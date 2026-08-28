import express, { Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { BusinessPlan } from '../../models/sql/BusinessPlan.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { User } from '../../models/sql/User.model.js';
import { protect, requireAdminRole } from '../../middleware/auth.js';
import { logAudit } from '../../utils/auditLog.js';
import currencyExchange from '../../services/currencyExchange.js';
import { getLiveFinancials } from '../../services/liveFinancials.js';
import type { AuthRequest } from '../../types/index.js';

const router = express.Router();

/** Sólo el owner ve y edita la proyección de gastos */
const ownerOnly = requireAdminRole('owner');

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
  budgetCurrency: 'USD',
  budget: [
    { c: 'Meta Ads / adquisición', m: 3000, n: 'Fase 1: 500 MAU meta' },
    { c: 'Retainer abogado laboral', m: 1800, n: 'gig economy' },
    { c: 'Infraestructura tech (hosting, dominio, APIs)', m: 900, n: '' },
    { c: 'Soporte y resolución de disputas (manual)', m: 1200, n: 'antes de automatizar' },
    { c: 'Sueldos / founders', m: 0, n: '' },
    { c: 'Contingencia (10%)', m: 700, n: '' },
  ],
  checklist: [
    { t: 'Validaste el problema con 20+ entrevistas reales a Doers y Clientes', w: 15, on: false },
    { t: 'Tenés abogado laboral especializado en gig economy consultado', w: 20, on: false },
    { t: 'Revisaste que el modelo no configure relación de dependencia encubierta (Art. 23/24/25 LCT)', w: 20, on: false },
    { t: 'Conseguiste compromiso de 20-50 Doers verificados para el barrio piloto', w: 15, on: false },
    { t: 'Diseñaste el flujo de disputas (meta: 80% resuelto sin humano en <72hs)', w: 10, on: false },
    { t: 'Validaste la integración con MercadoPago como PSP para la sociedad', w: 10, on: false },
    { t: 'Tenés capital para cubrir 4+ meses de runway de Fase 1', w: 5, on: false },
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
  ue: { comision: 12, ticket: 85, contratos: 0.8, disputas: 2.5, soporte: 8, fijos: 18000, fraude: 0.8, mauActual: 0 },

  // Proyección mes a mes: crecimiento, monetización, costos e impuestos.
  // Las alícuotas son las de una SAS argentina inscripta en IVA.
  // Caso base deliberadamente pesimista: la idea es que si se cumple ESTO, los
  // gastos igual se cubren. Los costos son los reales contratados; los
  // supuestos de demanda son los conservadores.
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
      horizonteMeses: 36,
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
      fijosCrecimientoPct: 2,
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
router.get('/', protect, ownerOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
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
    const defaults = defaultPlan();
    const saved = plan?.data && Object.keys(plan.data).length > 0 ? plan.data : {};
    const data: Record<string, any> = { ...defaults, ...saved };
    for (const [key, value] of Object.entries(defaults)) {
      if (data[key] === undefined || data[key] === null) data[key] = value;
      // Los bloques de supuestos se completan campo por campo
      else if (
        value && typeof value === 'object' && !Array.isArray(value) &&
        data[key] && typeof data[key] === 'object' && !Array.isArray(data[key])
      ) {
        data[key] = mergeDeep(value, data[key]);
      }
    }

    res.json({
      success: true,
      data,
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
router.get('/live', protect, ownerOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const plan = await BusinessPlan.findOne({ where: { slug: PLAN_SLUG } });
    const data = mergeDeep(defaultPlan(), plan?.data || {});
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
router.put('/', protect, ownerOnly, async (req: AuthRequest, res: Response): Promise<void> => {
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

    const existing = await BusinessPlan.findOne({ where: { slug: PLAN_SLUG } });

    let plan: BusinessPlan;
    if (existing) {
      await existing.update({ data, updatedById: req.user!.id });
      plan = existing;
    } else {
      plan = await BusinessPlan.create({
        slug: PLAN_SLUG,
        data,
        updatedById: req.user!.id,
      });
    }

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
router.get('/rates', protect, ownerOnly, async (_req: AuthRequest, res: Response): Promise<void> => {
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
