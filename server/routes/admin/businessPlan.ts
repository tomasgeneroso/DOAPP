import express, { Response } from 'express';
import { Op, fn, col, literal } from 'sequelize';
import { BusinessPlan } from '../../models/sql/BusinessPlan.model.js';
import { Contract } from '../../models/sql/Contract.model.js';
import { Payment } from '../../models/sql/Payment.model.js';
import { User } from '../../models/sql/User.model.js';
import { protect, requireAdminRole } from '../../middleware/auth.js';
import { logAudit } from '../../utils/auditLog.js';
import currencyExchange from '../../services/currencyExchange.js';
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
});

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

    res.json({
      success: true,
      data: plan?.data && Object.keys(plan.data).length > 0 ? plan.data : defaultPlan(),
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
