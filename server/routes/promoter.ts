import express, { Response } from "express";
import { protect } from "../middleware/auth.js";
import { AuthRequest } from "../types/index.js";
import { Promoter } from "../models/sql/Promoter.model.js";
import { Advertisement } from "../models/sql/Advertisement.model.js";
import { Op } from 'sequelize';

const router = express.Router();

// Get promoter dashboard (for promoter user)
router.get("/dashboard", protect, async (req: AuthRequest, res: Response) => {
  try {
    const promoter = await Promoter.findOne({
      where: {
        userId: req.user.id,
        status: { [Op.in]: ["active", "pending"] },
      },
      include: [
        { association: 'advertisement' },
        { association: 'createdBy', attributes: ['name', 'email'] }
      ]
    });

    if (!promoter) {
      return res.status(404).json({
        message: "No tienes una campaña publicitaria activa",
        isPromoter: false
      });
    }

    // Calculate days remaining
    const now = new Date();
    const daysRemaining = Math.ceil(
      (promoter.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get advertisement performance
    const ad = await Advertisement.findByPk(promoter.advertisementId);

    if (!ad) {
      return res.status(404).json({ message: "Anuncio no encontrado" });
    }

    // Calculate updated analytics
    const totalImpressions = ad.analytics.impressions;
    const totalClicks = ad.analytics.clicks;
    const ctr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
    const cpm = totalImpressions > 0 ? (promoter.pricing.totalPaid / totalImpressions) * 1000 : 0;
    const cpc = totalClicks > 0 ? promoter.pricing.totalPaid / totalClicks : 0;

    // Update promoter analytics
    promoter.analytics.totalImpressions = totalImpressions;
    promoter.analytics.totalClicks = totalClicks;
    promoter.analytics.averageCTR = ctr;
    promoter.analytics.averageCPM = cpm;
    promoter.analytics.averageCPC = cpc;
    promoter.analytics.totalCost = promoter.pricing.totalPaid;

    await promoter.save();

    res.json({
      isPromoter: true,
      promoter: {
        id: promoter.id,
        companyName: promoter.companyName,
        status: promoter.status,
        isEnabled: promoter.isEnabled,
        startDate: promoter.startDate,
        endDate: promoter.endDate,
        daysRemaining,
        adType: promoter.adType,
        paymentPlan: promoter.paymentPlan,
      },
      advertisement: {
        id: ad.id,
        title: ad.title,
        description: ad.description,
        imageUrl: ad.imageUrl,
        link: ad.link,
        status: ad.status,
      },
      pricing: {
        basePrice: promoter.pricing.basePrice,
        totalPaid: promoter.pricing.totalPaid,
        currency: promoter.pricing.currency,
        nextPaymentDate: promoter.pricing.nextPaymentDate,
        lastPaymentDate: promoter.pricing.lastPaymentDate,
      },
      analytics: {
        impressions: {
          total: totalImpressions,
          daily: ad.analytics.dailyImpressions || 0,
        },
        clicks: {
          total: totalClicks,
          daily: ad.analytics.dailyClicks || 0,
        },
        ctr: ctr.toFixed(2),
        cpm: cpm.toFixed(2),
        cpc: cpc.toFixed(2),
        totalCost: promoter.pricing.totalPaid,
      },
    });
  } catch (error) {
    console.error("Error fetching promoter dashboard:", error);
    res.status(500).json({ message: "Error al obtener dashboard de promotor" });
  }
});

// Get promoter analytics history
router.get("/analytics/history", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { period = "30" } = req.query; // days

    const promoter = await Promoter.findOne({
      where: {
        userId: req.user.id,
        status: { [Op.in]: ["active", "pending", "ended"] },
      }
    });

    if (!promoter) {
      return res.status(404).json({ message: "No tienes una campaña publicitaria" });
    }

    const ad = await Advertisement.findByPk(promoter.advertisementId);

    if (!ad) {
      return res.status(404).json({ message: "Anuncio no encontrado" });
    }

    // Get performance history from advertisement
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - Number(period));

    // Filter performance data by date range
    const performanceHistory = ad.analytics.performanceHistory
      ?.filter((entry: any) => new Date(entry.date) >= daysAgo)
      .map((entry: any) => ({
        date: entry.date,
        impressions: entry.impressions || 0,
        clicks: entry.clicks || 0,
        ctr: entry.impressions > 0 ? ((entry.clicks || 0) / entry.impressions) * 100 : 0,
      })) || [];

    res.json({
      period: Number(period),
      history: performanceHistory,
    });
  } catch (error) {
    console.error("Error fetching promoter analytics history:", error);
    res.status(500).json({ message: "Error al obtener historial de analytics" });
  }
});

// Get promoter payment history
router.get("/payments", protect, async (req: AuthRequest, res: Response) => {
  try {
    const promoter = await Promoter.findOne({
      where: { userId: req.user.id }
    });

    if (!promoter) {
      return res.status(404).json({ message: "No tienes una campaña publicitaria" });
    }

    // In a real scenario, you'd have a separate Payment model for promoter payments
    // For now, we'll return the basic payment info from the promoter model
    const paymentHistory = [
      {
        date: promoter.pricing.lastPaymentDate,
        amount: promoter.pricing.totalPaid,
        currency: promoter.pricing.currency,
        status: "completed",
      },
    ];

    res.json({
      totalPaid: promoter.pricing.totalPaid,
      currency: promoter.pricing.currency,
      nextPaymentDate: promoter.pricing.nextPaymentDate,
      paymentPlan: promoter.paymentPlan,
      history: paymentHistory,
    });
  } catch (error) {
    console.error("Error fetching promoter payments:", error);
    res.status(500).json({ message: "Error al obtener pagos" });
  }
});

export default router;
