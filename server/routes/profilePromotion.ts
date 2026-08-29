import express, { Response } from 'express';
import { Op } from 'sequelize';
import { protect, AuthRequest } from '../middleware/auth.js';
import { Advertisement } from '../models/sql/Advertisement.model.js';
import { User } from '../models/sql/User.model.js';
import currencyExchange from '../services/currencyExchange.js';

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

/** Precio por semana, en euros. Se cobra en pesos al cambio del dia. */
const PRICE_PER_WEEK_EUR = 5;

/** Cuantas semanas hacia adelante se pueden reservar. */
const MAX_WEEKS_AHEAD = 12;

/**
 * Solo se promociona quien ya tiene con que.
 *
 * Se puede comprar visibilidad, no reputacion: un promocionado con mala
 * puntuacion aparece primero en el muro y quema la confianza de toda la
 * pantalla. Es la unica restriccion que importa de verdad en este producto.
 */
const MIN_RATING = 3.5;
const MIN_REVIEWS = 1;

function mondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
  return d;
}

/** Las proximas semanas disponibles, empezando por la actual. */
function upcomingWeeks(): Array<{ start: string; end: string; label: string }> {
  const first = mondayOf(new Date());
  const weeks = [];
  for (let i = 0; i < MAX_WEEKS_AHEAD; i++) {
    const start = new Date(first);
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    weeks.push({
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${start.getDate()}/${start.getMonth() + 1} al ${end.getDate()}/${end.getMonth() + 1}`,
    });
  }
  return weeks;
}

/**
 * @route   GET /api/profile-promotion/options
 * @desc    Semanas disponibles, precio y si el usuario puede promocionarse
 */
router.get('/options', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);
    const priceArs = Math.round(PRICE_PER_WEEK_EUR * eurArs);

    const rating = Number((user as any).rating) || 0;
    const reviews = Number((user as any).reviewsCount) || 0;
    const elegible = rating >= MIN_RATING && reviews >= MIN_REVIEWS;

    // Semanas que este usuario ya tiene compradas, para no ofrecerlas de nuevo.
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
        precioSemanaEur: PRICE_PER_WEEK_EUR,
        precioSemanaArs: priceArs,
        eurArs: Math.round(eurArs * 100) / 100,
        elegible,
        // Se dice por que no, no solo que no: un "no podes" sin motivo no le
        // sirve a nadie para poder hacerlo despues.
        motivoNoElegible: elegible
          ? null
          : reviews < MIN_REVIEWS
            ? 'Necesitás al menos una opinión de un trabajo completado.'
            : `Necesitás una puntuación de ${MIN_RATING} o más. La tuya es ${rating.toFixed(1)}.`,
        semanas: upcomingWeeks().map((w) => ({
          ...w,
          ocupada: ocupadas.has(new Date(w.start).toISOString().slice(0, 10)),
        })),
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
 * @desc    Reservar semanas de promocion
 */
router.post('/', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { semanas } = req.body as { semanas?: string[] };

    if (!Array.isArray(semanas) || semanas.length === 0) {
      res.status(400).json({ success: false, message: 'Elegí al menos una semana' });
      return;
    }
    if (semanas.length > MAX_WEEKS_AHEAD) {
      res.status(400).json({ success: false, message: 'Demasiadas semanas' });
      return;
    }

    const user = await User.findByPk(req.user!.id);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const rating = Number((user as any).rating) || 0;
    const reviews = Number((user as any).reviewsCount) || 0;
    if (rating < MIN_RATING || reviews < MIN_REVIEWS) {
      res.status(403).json({
        success: false,
        message: 'Todavía no cumplís los requisitos para promocionar tu perfil.',
      });
      return;
    }

    // Las semanas validas las define el servidor, no el cliente: asi no se
    // pueden reservar semanas viejas ni fuera del rango mandando otra fecha.
    const validas = new Map(upcomingWeeks().map((w) => [w.start.slice(0, 10), w]));
    const elegidas = semanas
      .map((s) => validas.get(String(s).slice(0, 10)))
      .filter(Boolean) as Array<{ start: string; end: string }>;

    if (elegidas.length !== semanas.length) {
      res.status(400).json({ success: false, message: 'Alguna de las semanas no es válida' });
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
        message: 'Ya tenés reservada alguna de esas semanas.',
      });
      return;
    }

    const eurArs = await currencyExchange.getEURtoARSRate().catch(() => 1800);
    const precioSemana = Math.round(PRICE_PER_WEEK_EUR * eurArs);
    const total = precioSemana * elegidas.length;

    const creadas = await Promise.all(
      elegidas.map((w) =>
        Advertisement.create({
          advertiserId: user.id,
          adType: 'profile',
          title: user.name,
          description: ((user as any).bio || '').slice(0, 500) || `Perfil de ${user.name}`,
          status: 'pending',
          paymentStatus: 'pending',
          pricePerDay: Math.round(precioSemana / 7),
          totalPrice: precioSemana,
          startDate: new Date(w.start),
          endDate: new Date(w.end),
          targetCategories: (user as any).profession ? [(user as any).profession] : [],
          targetLocations: (user as any).address?.city ? [(user as any).address.city] : [],
        } as any),
      ),
    );

    res.status(201).json({
      success: true,
      message: 'Reservado. Falta el pago para que se active.',
      data: {
        ids: creadas.map((c) => c.id),
        semanas: elegidas.length,
        precioSemanaArs: precioSemana,
        totalArs: total,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * @route   DELETE /api/profile-promotion/:id
 * @desc    Cancelar una semana todavia no pagada
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
