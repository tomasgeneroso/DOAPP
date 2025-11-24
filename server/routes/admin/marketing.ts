import express, { Response } from "express";
import { protect, authorize } from "../../middleware/auth.js";
import { AuthRequest } from "../../types/index.js";
import { User } from "../../models/sql/User.model.js";
import { Contract } from "../../models/sql/Contract.model.js";
import { Job } from "../../models/sql/Job.model.js";
import { Promoter } from "../../models/sql/Promoter.model.js";
import { Advertisement } from "../../models/sql/Advertisement.model.js";
import { Membership } from "../../models/sql/Membership.model.js";
import { Op } from 'sequelize';
import sequelize from '../../config/database.js';

const router = express.Router();

// ============= PROMOTER MANAGEMENT =============

// Get all promoters
router.get(
  "/promoters",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const query: any = {};

      if (status) query.status = status;

      const { rows: promoters, count: total } = await Promoter.findAndCountAll({
        where: query,
        limit: Number(limit),
        offset: (Number(page) - 1) * Number(limit),
        order: [['createdAt', 'DESC']],
        include: [
          { model: User, as: 'user', attributes: ['name', 'email', 'avatar'] },
          { model: Advertisement, as: 'advertisement' },
          { model: User, as: 'createdBy', attributes: ['name', 'email'] }
        ]
      });

      res.json({
        promoters,
        pagination: {
          total,
          page: Number(page),
          pages: Math.ceil(total / Number(limit)),
        },
      });
    } catch (error) {
      console.error("Error fetching promoters:", error);
      res.status(500).json({ message: "Error al obtener promotores" });
    }
  }
);

// Create promoter
router.post(
  "/promoters",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const {
        userId,
        advertisementId,
        companyName,
        contactName,
        contactEmail,
        contactPhone,
        startDate,
        endDate,
        adType,
        paymentPlan,
        basePrice,
        currency,
        notes,
      } = req.body;

      // Verify user exists
      const user = await User.findByPk(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario no encontrado" });
      }

      // Verify advertisement exists
      const advertisement = await Advertisement.findByPk(advertisementId);
      if (!advertisement) {
        return res.status(404).json({ message: "Anuncio no encontrado" });
      }

      const promoter = await Promoter.create({
        user: userId,
        advertisement: advertisementId,
        companyName,
        contactName,
        contactEmail,
        contactPhone,
        startDate,
        endDate,
        adType,
        paymentPlan,
        pricing: {
          basePrice,
          totalPaid: 0,
          currency: currency || "ARS",
        },
        status: "pending",
        isEnabled: true,
        analytics: {
          totalImpressions: 0,
          totalClicks: 0,
          totalCost: 0,
          averageCTR: 0,
          averageCPM: 0,
          averageCPC: 0,
        },
        createdBy: req.user.id,
      });

      await promoter.reload({
        include: [
          { model: User, as: 'user', attributes: ['name', 'email', 'avatar'] },
          { model: Advertisement, as: 'advertisement' },
          { model: User, as: 'createdBy', attributes: ['name', 'email'] }
        ]
      });

      res.status(201).json(promoter);
    } catch (error) {
      console.error("Error creating promoter:", error);
      res.status(500).json({ message: "Error al crear promotor" });
    }
  }
);

// Update promoter
router.put(
  "/promoters/:id",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const promoter = await Promoter.findByPk(req.params.id);

      if (!promoter) {
        return res.status(404).json({ message: "Promotor no encontrado" });
      }

      const {
        companyName,
        contactName,
        contactEmail,
        contactPhone,
        startDate,
        endDate,
        adType,
        paymentPlan,
        basePrice,
        totalPaid,
        nextPaymentDate,
        lastPaymentDate,
        currency,
        status,
        isEnabled,
        notes,
      } = req.body;

      if (companyName !== undefined) promoter.companyName = companyName;
      if (contactName !== undefined) promoter.contactName = contactName;
      if (contactEmail !== undefined) promoter.contactEmail = contactEmail;
      if (contactPhone !== undefined) promoter.contactPhone = contactPhone;
      if (startDate !== undefined) promoter.startDate = startDate;
      if (endDate !== undefined) promoter.endDate = endDate;
      if (adType !== undefined) promoter.adType = adType;
      if (paymentPlan !== undefined) promoter.paymentPlan = paymentPlan;
      if (basePrice !== undefined) promoter.pricing.basePrice = basePrice;
      if (totalPaid !== undefined) promoter.pricing.totalPaid = totalPaid;
      if (nextPaymentDate !== undefined) promoter.pricing.nextPaymentDate = nextPaymentDate;
      if (lastPaymentDate !== undefined) promoter.pricing.lastPaymentDate = lastPaymentDate;
      if (currency !== undefined) promoter.pricing.currency = currency;
      if (status !== undefined) promoter.status = status;
      if (isEnabled !== undefined) promoter.isEnabled = isEnabled;
      if (notes !== undefined) promoter.notes = notes;

      await promoter.save();

      await promoter.reload({
        include: [
          { model: User, as: 'user', attributes: ['name', 'email', 'avatar'] },
          { model: Advertisement, as: 'advertisement' },
          { model: User, as: 'createdBy', attributes: ['name', 'email'] }
        ]
      });

      res.json(promoter);
    } catch (error) {
      console.error("Error updating promoter:", error);
      res.status(500).json({ message: "Error al actualizar promotor" });
    }
  }
);

// Delete promoter
router.delete(
  "/promoters/:id",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const promoter = await Promoter.findByPk(req.params.id);

      if (!promoter) {
        return res.status(404).json({ message: "Promotor no encontrado" });
      }

      await promoter.destroy();

      res.json({ message: "Promotor eliminado exitosamente" });
    } catch (error) {
      console.error("Error deleting promoter:", error);
      res.status(500).json({ message: "Error al eliminar promotor" });
    }
  }
);

// Update promoter payment
router.post(
  "/promoters/:id/payment",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const promoter = await Promoter.findByPk(req.params.id);

      if (!promoter) {
        return res.status(404).json({ message: "Promotor no encontrado" });
      }

      const { amount, paymentDate, nextPaymentDate } = req.body;

      promoter.pricing.totalPaid += amount;
      promoter.pricing.lastPaymentDate = paymentDate || new Date();
      if (nextPaymentDate) {
        promoter.pricing.nextPaymentDate = nextPaymentDate;
      }

      await promoter.save();

      res.json(promoter);
    } catch (error) {
      console.error("Error updating promoter payment:", error);
      res.status(500).json({ message: "Error al actualizar pago" });
    }
  }
);

// ============= APP STATISTICS =============

// Get general app statistics
router.get(
  "/stats",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const now = new Date();
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // User statistics
      const totalUsers = await User.count({ where: { role: "user" } });
      const newUsersThisMonth = await User.count({
        where: {
          role: "user",
          createdAt: { [Op.gte]: new Date(now.getFullYear(), now.getMonth(), 1) },
        }
      });

      const usersWithPro = await Membership.count({
        where: {
          status: "active",
          plan: "PRO",
        }
      });

      const usersWithSuperPro = await Membership.count({
        where: {
          status: "active",
          plan: "SUPER_PRO",
        }
      });

      // Age demographics (assuming we have birthDate in User model)
      const users = await User.findAll({
        where: { role: "user" },
        attributes: ["birthDate"]
      });
      const ageGroups = {
        "18-24": 0,
        "25-34": 0,
        "35-44": 0,
        "45-54": 0,
        "55+": 0,
        unknown: 0,
      };

      users.forEach((user: any) => {
        if (!user.birthDate) {
          ageGroups.unknown++;
          return;
        }

        const age = Math.floor(
          (now.getTime() - new Date(user.birthDate).getTime()) / (365.25 * 24 * 60 * 60 * 1000)
        );

        if (age >= 18 && age <= 24) ageGroups["18-24"]++;
        else if (age >= 25 && age <= 34) ageGroups["25-34"]++;
        else if (age >= 35 && age <= 44) ageGroups["35-44"]++;
        else if (age >= 45 && age <= 54) ageGroups["45-54"]++;
        else if (age >= 55) ageGroups["55+"]++;
        else ageGroups.unknown++;
      });

      // Contract statistics
      const totalContracts = await Contract.count();
      const completedContracts = await Contract.count({ where: { status: "completed" } });
      const activeContracts = await Contract.count({ where: { status: "active" } });

      // Jobs statistics
      const totalJobs = await Job.count();
      const activeJobs = await Job.count({ where: { status: "open" } });

      // Revenue statistics
      const completedContractsData = await Contract.findAll({
        where: { status: "completed" },
        attributes: ["commission", "currency"]
      });

      let totalRevenueARS = 0;
      let totalRevenueUSD = 0;

      completedContractsData.forEach((contract) => {
        if (contract.currency === "USD") {
          totalRevenueUSD += contract.commission || 0;
        } else {
          totalRevenueARS += contract.commission || 0;
        }
      });

      // Conversion rates (visitors to registrations)
      // Note: You'd need to implement visitor tracking for accurate bounce rate
      const registrationRate = {
        totalUsers,
        newUsersThisMonth,
        withPro: usersWithPro,
        withSuperPro: usersWithSuperPro,
        proConversionRate: totalUsers > 0 ? (usersWithPro / totalUsers) * 100 : 0,
        superProConversionRate: totalUsers > 0 ? (usersWithSuperPro / totalUsers) * 100 : 0,
      };

      res.json({
        users: {
          total: totalUsers,
          newThisMonth: newUsersThisMonth,
          withPro: usersWithPro,
          withSuperPro: usersWithSuperPro,
          ageGroups,
        },
        contracts: {
          total: totalContracts,
          completed: completedContracts,
          active: activeContracts,
          completionRate: totalContracts > 0 ? (completedContracts / totalContracts) * 100 : 0,
        },
        jobs: {
          total: totalJobs,
          active: activeJobs,
        },
        revenue: {
          totalARS: totalRevenueARS,
          totalUSD: totalRevenueUSD,
        },
        registrationRate,
      });
    } catch (error) {
      console.error("Error fetching app statistics:", error);
      res.status(500).json({ message: "Error al obtener estadísticas" });
    }
  }
);

// Get user growth trends
router.get(
  "/stats/user-growth",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { months = 12 } = req.query;

      const monthsAgo = new Date();
      monthsAgo.setMonth(monthsAgo.getMonth() - Number(months));

      const userGrowth = await User.findAll({
        where: {
          role: "user",
          createdAt: { [Op.gte]: monthsAgo },
        },
        attributes: [
          [sequelize.fn('YEAR', sequelize.col('createdAt')), 'year'],
          [sequelize.fn('MONTH', sequelize.col('createdAt')), 'month'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: [
          sequelize.fn('YEAR', sequelize.col('createdAt')),
          sequelize.fn('MONTH', sequelize.col('createdAt'))
        ],
        order: [
          [sequelize.fn('YEAR', sequelize.col('createdAt')), 'ASC'],
          [sequelize.fn('MONTH', sequelize.col('createdAt')), 'ASC']
        ],
        raw: true
      }).then((results: any[]) =>
        results.map(r => ({
          _id: { year: r.year, month: r.month },
          count: parseInt(r.count)
        }))
      );

      res.json({ userGrowth });
    } catch (error) {
      console.error("Error fetching user growth:", error);
      res.status(500).json({ message: "Error al obtener crecimiento de usuarios" });
    }
  }
);

// Get revenue by source
router.get(
  "/stats/revenue-sources",
  protect,
  authorize("owner", "super_admin", "admin"),
  async (req: AuthRequest, res: Response) => {
    try {
      // Commission revenue
      const contractRevenue = await Contract.findAll({
        where: { status: "completed" },
        attributes: [
          'currency',
          [sequelize.fn('SUM', sequelize.col('commission')), 'total'],
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['currency'],
        raw: true
      }).then((results: any[]) =>
        results.map(r => ({
          _id: r.currency,
          total: parseFloat(r.total) || 0,
          count: parseInt(r.count)
        }))
      );

      // Membership revenue
      const membershipCount = await Membership.count({ where: { status: "active" } });
      const proCount = await Membership.count({ where: { status: "active", plan: "PRO" } });
      const superProCount = await Membership.count({ where: { status: "active", plan: "SUPER_PRO" } });

      // Estimated monthly membership revenue (5.99 * PRO + 8.99 * SUPER_PRO in EUR)
      const estimatedMonthlyMembershipRevenue = proCount * 5.99 + superProCount * 8.99;

      // Advertisement revenue - Note: This assumes pricing.totalPaid is stored as JSON
      const adRevenueData = await Promoter.findAll({
        where: { status: { [Op.in]: ["active", "ended"] } },
        attributes: ['pricing']
      });

      const adRevenue = adRevenueData.reduce((acc: any[], promoter: any) => {
        const currency = promoter.pricing?.currency || 'ARS';
        const totalPaid = promoter.pricing?.totalPaid || 0;

        const existing = acc.find(r => r._id === currency);
        if (existing) {
          existing.total += totalPaid;
          existing.count += 1;
        } else {
          acc.push({ _id: currency, total: totalPaid, count: 1 });
        }
        return acc;
      }, []);

      res.json({
        commissions: contractRevenue,
        memberships: {
          active: membershipCount,
          pro: proCount,
          superPro: superProCount,
          estimatedMonthlyRevenue: estimatedMonthlyMembershipRevenue,
        },
        advertisements: adRevenue,
      });
    } catch (error) {
      console.error("Error fetching revenue sources:", error);
      res.status(500).json({ message: "Error al obtener fuentes de ingresos" });
    }
  }
);

export default router;
