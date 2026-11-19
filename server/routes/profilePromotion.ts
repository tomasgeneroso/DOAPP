import express, { Response } from 'express';
import { Op } from 'sequelize';
import { protect, AuthRequest } from '../middleware/auth.js';
import { Advertisement } from '../models/sql/Advertisement.model.js';
import { User } from '../models/sql/User.model.js';
import currencyExchange from '../services/currencyExchange.js';
import { preciosPorDia } from '../services/preciosDePromocion.js';
import { desglosePromocion, PERFILES_POR_DIA, PRECIO_BASE_POR_DIA_EUR, TOPE_POR_DIA_EUR } from '../../shared/pricing/promocionDePerfil.js';

/** Los rubros del perfil para el precio: los que eligió, o ninguno si ofrece «cualquier rubro» (cuenta todos los trabajos). */
const rubrosDe = (u: any): string[] => (u.workAnyCategory ? [] : Array.isArray(u.workCategories) ? u.workCategories : []);

const router = express.Router();

/**
 * Promocion del propio perfil en el muro.
 *
 * Un trabajador paga para aparecer entre las tarjetas del muro, en su zona y su
 * rubro. Se guarda como un Advertisement de tipo 'profile' para reutilizar el
 * cobro, las fechas, la segmentacion y el conteo de impresiones que ya existian
 * para los anunciantes externos.
 *
 * La diferencia con un aviso comun: no lleva a nadie afuera de la app. Es el
 * unico formato publicitario que tiene sentido en el muro, donde la persona
 * esta a punto de contratar; sacarla de ahi cuesta una conversion.
 */

/**
 * Precio por dia, en euros. Se cobra en pesos al cambio del dia.
 *
 * Se vende por dia suelto y no por semana cerrada porque la demanda de un
 * oficio no es pareja: al que trabaja los fines de semana no le sirve pagar el
 * lunes, y al que le factura a empresas no le sirve pagar el domingo. Obligarlo
 * a comprar la semana entera es cobrarle dias que no va a usar.
 */
const PRICE_PER_DAY_EUR = 1;

/** Cuantos dias hacia adelante se pueden reservar (unos 6 meses: el calendario del cliente se corre mes a mes). */
const MAX_DAYS_AHEAD = 180;

/**
 * Solo se promociona quien ya tiene con que.
 *
 * Se puede comprar visibilidad, no reputacion: un promocionado con mala
 * puntuacion aparece primero en el muro y quema la confianza de toda la
 * pantalla. Es la unica restriccion que importa de verdad en este producto.
 */
const MIN_RATING = 3.5;

/**
 * Quien puede comprar visibilidad.
 *
 * Un trabajador sin opiniones puede. Es justamente quien mas la necesita: no
 * tiene historial que lo recomiende y la promocion es su unica forma de que lo
 * vean. Exigir una opinion para promocionarse era pedirle que consiga trabajo
 * antes de poder buscarlo.
 *
 * Lo que no puede es alguien con opiniones y puntuacion baja. Ahi la
 * plataforma ya sabe algo de esa persona, y vender visibilidad a quien los
 * clientes calificaron mal es cobrarle a los clientes el problema.
 */
export function puedePromocionarse(rating: number, reviews: number): boolean {
  if (reviews === 0) return true;
  return rating >= MIN_RATING;
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

/** Los proximos dias disponibles, empezando por hoy. */
function upcomingDays(): Array<{ start: string; end: string; label: string; weekday: string }> {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias = [];
  for (let i = 0; i < MAX_DAYS_AHEAD; i++) {
    const start = new Date(hoy);
    start.setDate(start.getDate() + i);
    const end = new Date(start);
    end.setHours(23, 59, 59, 999);
    dias.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${start.getDate()}/${start.getMonth() + 1}`,
      weekday: DIAS[start.getDay()],
    });
  }
  return dias;
}

/**
 * @route   GET /api/profile-promotion/options
 * @desc    Dias disponibles, precio y si el usuario puede promocionarse
 */
router.get('/options', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);

    const rating = Number((user as any).rating) || 0;
    const reviews = Number((user as any).reviewsCount) || 0;
    const elegible = puedePromocionarse(rating, reviews);

    // El precio de CADA día (sube con la audiencia, la demanda del rubro, la app y los lugares que ya quedaron ocupados ese día).
    const calendario = upcomingDays();
    const precios = await preciosPorDia({ rating, reviews, rubros: rubrosDe(user) }, calendario.map((w) => new Date(w.start)), String(user.id));
    const precioDeDia = new Map(precios.map((p) => [p.fecha, p]));
    const masBarato = precios.reduce((min, p) => (p.eur < min.eur ? p : min), precios[0]);
    const priceArs = Math.round(masBarato.eur * eurArs);

    // Dias que este usuario ya tiene comprados, para no ofrecerlos de nuevo.
    const yaCompradas = await Advertisement.findAll({
      where: {
        advertiserId: user.id,
        adType: 'profile',
        status: { [Op.in]: ['pending', 'active', 'paused'] },
      },
      attributes: ['startDate', 'endDate', 'status', 'impressions', 'clicks'],
    });

    const ocupadas = new Set(
      yaCompradas.map((a) => new Date(a.startDate).toISOString().slice(0, 10)),
    );

    res.json({
      success: true,
      data: {
        precioDiaEur: masBarato.eur,
        precioBaseEur: PRECIO_BASE_POR_DIA_EUR,
        topeEur: TOPE_POR_DIA_EUR,
        perfilesPorDia: PERFILES_POR_DIA,
        precioDiaArs: priceArs,
        // Por qué vale lo que vale (los factores del día más barato, para explicarlo en pantalla)
        factores: masBarato.factores,
        pisoPorImpresionesEur: masBarato.pisoPorImpresionesEur,
        eurArs: Math.round(eurArs * 100) / 100,
        elegible,
        // Se dice por que no, no solo que no: un "no podes" sin motivo no le
        // sirve a nadie para poder hacerlo despues.
        motivoNoElegible: elegible
          ? null
          : `Tu puntuación es ${rating.toFixed(1)} y hace falta ${MIN_RATING} o más para promocionarte. Los clientes que te calificaron son quienes deciden si te conviene más visibilidad.`,
        dias: calendario.map((w) => {
          const clave = new Date(w.start).toISOString().slice(0, 10);
          const p = precioDeDia.get(clave);
          return {
            ...w,
            ocupada: ocupadas.has(clave),
            agotada: !!p?.agotado,
            precioEur: p?.eur ?? PRECIO_BASE_POR_DIA_EUR,
            precioArs: Math.round((p?.eur ?? PRECIO_BASE_POR_DIA_EUR) * eurArs),
          };
        }),
        // Para la vista previa de la tarjeta, con los datos reales.
        preview: {
          name: user.name,
          avatar: (user as any).avatar || null,
          rating: Math.round(rating * 10) / 10,
          reviewsCount: reviews,
          skills: (user as any).profession ? [(user as any).profession] : [],
          location: (user as any).address?.city || null,
        },
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/profile-promotion/mine
 * @desc    Las promociones del usuario, con su rendimiento
 */
router.get('/mine', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const promos = await Advertisement.findAll({
      where: { advertiserId: req.user!.id, adType: 'profile' },
      order: [['startDate', 'DESC']],
      limit: 50,
    });

    res.json({
      success: true,
      data: promos.map((p) => ({
        id: p.id,
        startDate: p.startDate,
        endDate: p.endDate,
        status: p.status,
        paymentStatus: p.paymentStatus,
        totalPrice: p.totalPrice,
        impressions: p.impressions,
        clicks: p.clicks,
        // Sin impresiones el porcentaje es una division por cero disfrazada
        // de dato: se informa null y la pantalla muestra un guion.
        ctr: p.impressions > 0 ? Math.round((p.clicks / p.impressions) * 1000) / 10 : null,
      })),
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/profile-promotion
 * @desc    Reservar dias de promocion
 */
router.post('/', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dias } = req.body as { dias?: string[] };

    if (!Array.isArray(dias) || dias.length === 0) {
      res.status(400).json({ success: false, message: 'Elegí al menos un día' });
      return;
    }
    if (dias.length > MAX_DAYS_AHEAD) {
      res.status(400).json({ success: false, message: 'Demasiados días' });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const rating = Number((user as any).rating) || 0;
    const reviews = Number((user as any).reviewsCount) || 0;
    if (!puedePromocionarse(rating, reviews)) {
      res.status(403).json({
        success: false,
        message: 'Todavía no cumplís los requisitos para promocionar tu perfil.',
      });
      return;
    }

    // Los dias validos los define el servidor, no el cliente: asi no se pueden
    // reservar dias pasados ni fuera del rango mandando otra fecha.
    const validas = new Map(upcomingDays().map((w) => [w.start.slice(0, 10), w]));
    const elegidas = dias
      .map((s) => validas.get(String(s).slice(0, 10)))
      .filter(Boolean) as Array<{ start: string; end: string }>;

    if (elegidas.length !== dias.length) {
      res.status(400).json({ success: false, message: 'Alguno de los días no es válido' });
      return;
    }

    const yaTiene = await Advertisement.findAll({
      where: {
        advertiserId: user.id,
        adType: 'profile',
        status: { [Op.in]: ['pending', 'active', 'paused'] },
        startDate: { [Op.in]: elegidas.map((w) => new Date(w.start)) },
      },
      attributes: ['startDate'],
    });
    if (yaTiene.length > 0) {
      res.status(409).json({
        success: false,
        message: 'Ya tenés reservado alguno de esos días.',
      });
      return;
    }

    const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);
    // El precio de cada día lo calcula el servidor con los datos de hoy; el navegador solo dice qué días.
    const precios = await preciosPorDia({ rating, reviews, rubros: rubrosDe(user) }, elegidas.map((w) => new Date(w.start)), String(user.id));
    const agotados = precios.filter((p) => p.agotado);
    if (agotados.length > 0) {
      res.status(409).json({ success: false, message: `Ya están los ${PERFILES_POR_DIA} perfiles promocionados de este día en el muro: ${agotados.map((p) => p.fecha.split('-').reverse().slice(0, 2).join('/')).join(', ')}. Elegí otro día.` });
      return;
    }
    const precioPorFecha = new Map(precios.map((p) => [p.fecha, Math.round(p.eur * eurArs)]));
    const total = precios.reduce((s, p) => s + Math.round(p.eur * eurArs), 0);

    const creadas = await Promise.all(
      elegidas.map((w) => {
        const precioDia = precioPorFecha.get(new Date(w.start).toISOString().slice(0, 10)) ?? Math.round(PRECIO_BASE_POR_DIA_EUR * eurArs);
        return Advertisement.create({
          advertiserId: user.id,
          adType: 'profile',
          title: user.name,
          description: ((user as any).bio || '').slice(0, 500) || `Perfil de ${user.name}`,
          status: 'pending',
          paymentStatus: 'pending',
          pricePerDay: precioDia,
          totalPrice: precioDia,
          startDate: new Date(w.start),
          endDate: new Date(w.end),
          targetCategories: (user as any).profession ? [(user as any).profession] : [],
          targetLocations: (user as any).address?.city ? [(user as any).address.city] : [],
        } as any);
      }),
    );

    res.status(201).json({
      success: true,
      message: 'Reservado. Falta el pago para que se active.',
      data: {
        ids: creadas.map((c) => c.id),
        dias: elegidas.length,
        // El precio de los días SIN IVA; lo que se paga (con IVA y costo de procesamiento) lo devuelve /pay.
        netoArs: total,
        desglose: desglosePromocion(total),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/profile-promotion/cotizar
 * @desc    El precio de esos días y el desglose completo (precio + IVA + costo de procesamiento), ANTES de reservar. Mismo cálculo que al reservar y al pagar.
 */
router.post('/cotizar', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { dias } = req.body as { dias?: string[] };
    if (!Array.isArray(dias) || dias.length === 0 || dias.length > MAX_DAYS_AHEAD) {
      res.status(400).json({ success: false, message: 'Elegí al menos un día' });
      return;
    }
    const user: any = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    const validas = new Map(upcomingDays().map((w) => [w.start.slice(0, 10), w]));
    const elegidas = dias.map((s) => validas.get(String(s).slice(0, 10))).filter(Boolean) as Array<{ start: string; end: string }>;
    if (elegidas.length !== dias.length) {
      res.status(400).json({ success: false, message: 'Alguno de los días no es válido' });
      return;
    }
    const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);
    const precios = await preciosPorDia({ rating: Number(user.rating) || 0, reviews: Number(user.reviewsCount) || 0, rubros: rubrosDe(user) }, elegidas.map((w) => new Date(w.start)), String(user.id));
    const neto = precios.reduce((s, p) => s + Math.round(p.eur * eurArs), 0);
    res.json({ success: true, data: { dias: elegidas.length, netoArs: neto, desglose: desglosePromocion(neto), agotados: precios.filter((p) => p.agotado).map((p) => p.fecha) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/profile-promotion/pay
 * @desc    Paga los días reservados: crea la orden de Mercado Pago y devuelve la dirección de pago.
 *
 * Antes la pantalla reservaba los días y decía «Falta el pago para que se active»... sin ninguna forma de pagar (reporte del dueño, 2026-11-19: «en promocionar perfil
 * no me lleva a la pantalla de pago»). El monto lo calcula el servidor con lo que quedó guardado en cada día reservado; el navegador solo dice cuáles.
 * El pago se confirma en `POST /api/payments/capture-order` (tipo `profile_promotion`), que activa los días.
 */
router.post('/pay', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { ids } = req.body as { ids?: string[] };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_DAYS_AHEAD || ids.some((x) => typeof x !== 'string')) {
      res.status(400).json({ success: false, message: 'Elegí al menos un día reservado para pagar' });
      return;
    }
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }
    const dias = await Advertisement.findAll({
      where: {
        id: { [Op.in]: ids },
        advertiserId: user.id,
        adType: 'profile',
        status: 'pending',
        paymentStatus: 'pending',
        // el día de hoy también se puede pagar: solo se descartan los que ya terminaron
        endDate: { [Op.gt]: new Date() },
      },
    });
    if (dias.length !== new Set(ids).size) {
      res.status(409).json({ success: false, message: 'Alguno de los días ya no está disponible para pagar (se pagó, se canceló o ya pasó). Volvé a elegirlos.' });
      return;
    }
    const neto = dias.reduce((suma, d) => suma + Number(d.totalPrice), 0);
    if (!(neto > 0)) {
      res.status(409).json({ success: false, message: 'No se pudo calcular el monto. Probá de nuevo.' });
      return;
    }
    // Lo que se cobra: el precio de los días + IVA + costo de procesamiento con su IVA (T&C 7.16). Lo calcula el servidor con lo guardado en cada día.
    const desglose = desglosePromocion(neto);
    const total = desglose.total;
    // Los lugares del día no pueden haberse llenado mientras tanto.
    const { reservasPorDia } = await import('../services/preciosDePromocion.js');
    const ocupados = await reservasPorDia(new Date(Math.min(...dias.map((d) => new Date(d.startDate).getTime())) - 24 * 3600 * 1000), new Date(Math.max(...dias.map((d) => new Date(d.startDate).getTime())) + 24 * 3600 * 1000), String(user.id));
    if (dias.some((d) => (ocupados.get(new Date(d.startDate).toISOString().slice(0, 10)) ?? 0) >= PERFILES_POR_DIA)) {
      res.status(409).json({ success: false, message: 'Alguno de esos días ya tiene los perfiles promocionados completos. Elegí otro día.' });
      return;
    }

    const descripcion = `Promoción de perfil DOAPP: ${dias.length} ${dias.length === 1 ? 'día' : 'días'}`;
    const mercadopagoService = (await import('../services/mercadopago.js')).default;
    const mpPayment = await mercadopagoService.createPayment({
      amount: total,
      currency: 'ARS',
      description: descripcion,
      provider: 'mercadopago',
      metadata: { userId: String(user.id), paymentType: 'profile_promotion' },
      customerEmail: user.email,
      successUrl: `${process.env.CLIENT_URL}/payment/success?type=profile_promotion`,
      cancelUrl: `${process.env.CLIENT_URL}/settings?tab=promotion&error=payment_failed`,
    });

    const { Payment } = await import('../models/sql/Payment.model.js');
    const pago = await Payment.create({
      payerId: user.id,
      recipientId: null,
      contractId: null,
      amount: total,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'profile_promotion',
      mercadopagoPreferenceId: mpPayment.paymentId,
      description: descripcion,
      platformFee: 0,
      platformFeePercentage: 0,
      isEscrow: false,
      // El desglose queda en el pago para facturar el IVA y para que la persona lo vea.
      metadata: { advertisementIds: dias.map((d) => String(d.id)), neto: desglose.neto, iva: desglose.iva, procesamiento: desglose.procesamiento, ivaProcesamiento: desglose.ivaProcesamiento },
    } as any);

    res.status(201).json({
      success: true,
      message: 'Te llevamos a Mercado Pago para completar el pago.',
      data: { paymentUrl: mpPayment.checkoutUrl, preferenceId: mpPayment.paymentId, paymentId: pago.id, totalArs: total, desglose, dias: dias.length },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   GET /api/profile-promotion/activos
 * @desc    Los perfiles promocionados HOY (pagos y vigentes), para mostrarlos en el muro. Solo datos que ya son públicos del perfil.
 */
router.get('/activos', async (req, res: Response): Promise<void> => {
  try {
    const ahora = new Date();
    const excluir = typeof req.query.excluir === 'string' ? req.query.excluir : '';
    const activos = await Advertisement.findAll({
      where: {
        adType: 'profile',
        status: 'active',
        paymentStatus: 'paid',
        isApproved: true,
        startDate: { [Op.lte]: ahora },
        endDate: { [Op.gte]: ahora },
      },
      include: [{ association: 'advertiser', attributes: ['id', 'name', 'username', 'avatar', 'rating', 'reviewsCount', 'profession', 'address'] }],
      limit: 30,
    });
    const vistos = new Set<string>();
    const perfiles = [];
    for (const a of activos) {
      const u: any = (a as any).advertiser;
      if (!u || vistos.has(String(u.id)) || String(u.id) === excluir) continue;
      vistos.add(String(u.id));
      perfiles.push({
        id: u.id,
        username: u.username || null,
        name: u.name,
        avatar: u.avatar || null,
        rating: Math.round((Number(u.rating) || 0) * 10) / 10,
        reviewsCount: Number(u.reviewsCount) || 0,
        skills: u.profession ? [u.profession] : [],
        location: u.address?.city || null,
      });
    }
    // Entran PERFILES_POR_DIA en el muro: se sortean entre los vigentes (todos tienen su turno) y se cuenta una IMPRESIÓN a cada uno de los mostrados. Esas impresiones son
    // las que mira el precio de los días (piso por impresiones) y las que ve cada persona en «Tus promociones».
    for (let i = perfiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [perfiles[i], perfiles[j]] = [perfiles[j], perfiles[i]];
    }
    const mostrados = perfiles.slice(0, PERFILES_POR_DIA);
    if (mostrados.length > 0) {
      await Advertisement.increment('impressions', {
        by: 1,
        where: { adType: 'profile', paymentStatus: 'paid', status: 'active', advertiserId: { [Op.in]: mostrados.map((p) => p.id) }, startDate: { [Op.lte]: ahora }, endDate: { [Op.gte]: ahora } } as any,
      }).catch(() => undefined);
    }
    res.json({ success: true, data: mostrados });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   POST /api/profile-promotion/clic
 * @desc    Cuenta un clic en la tarjeta de un perfil promocionado (es informativo: se muestra en «Tus promociones»; no se cobra por clic).
 */
router.post('/clic', async (req, res: Response): Promise<void> => {
  try {
    const id = typeof req.body?.perfilId === 'string' ? req.body.perfilId : '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      res.status(400).json({ success: false });
      return;
    }
    const ahora = new Date();
    await Advertisement.increment('clicks', {
      by: 1,
      where: { adType: 'profile', paymentStatus: 'paid', status: 'active', advertiserId: id, startDate: { [Op.lte]: ahora }, endDate: { [Op.gte]: ahora } } as any,
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   DELETE /api/profile-promotion/:id
 * @desc    Cancelar una dia todavia no pagada
 */
router.delete('/:id', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const promo = await Advertisement.findOne({
      where: { id: req.params.id, advertiserId: req.user!.id, adType: 'profile' },
    });
    if (!promo) {
      res.status(404).json({ success: false, message: 'No encontrada' });
      return;
    }
    if (promo.paymentStatus === 'paid') {
      res.status(400).json({
        success: false,
        message: 'Ya está paga. Escribinos si necesitás darla de baja.',
      });
      return;
    }
    await promo.destroy();
    res.json({ success: true, message: 'Cancelada' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
