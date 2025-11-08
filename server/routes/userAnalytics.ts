import express, { Response } from "express";
import { protect } from "../middleware/auth.js";
import { AuthRequest } from "../types/index.js";
import { UserAnalytics } from "../models/sql/UserAnalytics.model.js";
import { Membership } from "../models/sql/Membership.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Conversation } from "../models/sql/Conversation.model.js";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Proposal } from "../models/sql/Proposal.model.js";
import { Job } from "../models/sql/Job.model.js";
import { Op } from 'sequelize';

const router = express.Router();

// Middleware to check if user has Super PRO membership
const requireSuperPro = async (req: AuthRequest, res: Response, next: Function) => {
  try {
    const membership = await Membership.findOne({
      where: {
        userId: req.user.id,
        status: "active",
        plan: "SUPER_PRO",
      }
    });

    if (!membership) {
      return res.status(403).json({
        message: "Esta función requiere membresía Super PRO",
        requiresUpgrade: true,
      });
    }

    next();
  } catch (error) {
    console.error("Error checking Super PRO membership:", error);
    res.status(500).json({ message: "Error al verificar membresía" });
  }
};

// Get or create user analytics
async function getOrCreateAnalytics(userId: string) {
  let analytics = await UserAnalytics.findOne({ where: { userId } });

  if (!analytics) {
    analytics = await UserAnalytics.create({ userId });
  }

  return analytics;
}

// Calculate and update user analytics
async function calculateAnalytics(userId: string) {
  const analytics = await getOrCreateAnalytics(userId);

  // Profile views - already tracked in real-time
  const uniqueVisitors = new Set(
    analytics.profileViews.history
      .filter((visit: any) => visit.visitorId)
      .map((visit: any) => visit.visitorId.toString())
  );
  analytics.profileViews.unique = uniqueVisitors.size;

  // Conversations
  const conversations = await Conversation.findAll({
    where: {
      participants: { [Op.contains]: [userId] }
    },
    include: [{ association: 'participants' }]
  });

  analytics.conversations.total = conversations.length;

  const conversationPartners: any[] = [];
  let withCompletedContract = 0;

  for (const conv of conversations) {
    const otherUser = conv.participants.find(
      (p: any) => p.id.toString() !== userId
    );

    if (!otherUser) continue;

    // Check if had contract with this user
    const contracts = await Contract.findAll({
      where: {
        [Op.or]: [
          { clientId: userId, doerId: otherUser.id },
          { clientId: otherUser.id, doerId: userId },
        ],
        status: "completed",
      }
    });

    if (contracts.length > 0) {
      withCompletedContract++;
    }

    // Get last message date
    const lastMessage = await ChatMessage.findOne({
      where: { conversationId: conv.id },
      order: [['createdAt', 'DESC']]
    });

    conversationPartners.push({
      userId: otherUser.id,
      hadContract: contracts.length > 0,
      contractsCount: contracts.length,
      lastMessageAt: lastMessage?.createdAt || conv.updatedAt,
    });
  }

  analytics.conversations.withCompletedContract = withCompletedContract;
  analytics.conversations.conversationPartners = conversationPartners;

  // Contracts analytics
  const completedContracts = await Contract.findAll({
    where: {
      doerId: userId,
      status: "completed",
    },
    include: [{ association: 'client' }]
  });

  analytics.contracts.totalCompleted = completedContracts.length;

  let totalEarnings = 0;
  let totalRating = 0;
  let ratingCount = 0;
  const clientMap = new Map();
  let successfulContracts = 0;
  let totalCompletionTime = 0;
  const categoryMap = new Map();
  const monthlyMap = new Map();

  for (const contract of completedContracts) {
    // Earnings
    const earnings = contract.price - (contract.commission || 0);
    totalEarnings += earnings;

    // Ratings
    if (contract.doerRating) {
      totalRating += contract.doerRating;
      ratingCount++;
    }

    // Repeat clients
    const clientId = contract.client.id.toString();
    clientMap.set(clientId, (clientMap.get(clientId) || 0) + 1);

    // Success rate (no disputes)
    if (!contract.dispute) {
      successfulContracts++;
    }

    // Completion time
    if (contract.completedAt && contract.createdAt) {
      const days = Math.ceil(
        (contract.completedAt.getTime() - contract.createdAt.getTime()) /
          (1000 * 60 * 60 * 24)
      );
      totalCompletionTime += days;
    }

    // By category
    const category = (contract as any).category || "Otros";
    const catData = categoryMap.get(category) || { count: 0, earnings: 0 };
    catData.count++;
    catData.earnings += earnings;
    categoryMap.set(category, catData);

    // Monthly stats
    const month = contract.completedAt
      ? `${contract.completedAt.getFullYear()}-${String(
          contract.completedAt.getMonth() + 1
        ).padStart(2, "0")}`
      : undefined;

    if (month) {
      const monthData = monthlyMap.get(month) || {
        completed: 0,
        earnings: 0,
        total: 0,
      };
      monthData.completed++;
      monthData.earnings += earnings;
      monthData.total += contract.price;
      monthlyMap.set(month, monthData);
    }
  }

  analytics.contracts.totalEarnings = totalEarnings;
  analytics.contracts.averageRating = ratingCount > 0 ? totalRating / ratingCount : 0;
  analytics.contracts.repeatClients = Array.from(clientMap.values()).filter(
    (count) => count > 1
  ).length;
  analytics.contracts.successRate =
    completedContracts.length > 0
      ? (successfulContracts / completedContracts.length) * 100
      : 0;
  analytics.contracts.averageCompletionTime =
    completedContracts.length > 0 ? totalCompletionTime / completedContracts.length : 0;

  analytics.contracts.byCategory = Array.from(categoryMap.entries()).map(
    ([category, data]: [string, any]) => ({
      category,
      count: data.count,
      earnings: data.earnings,
    })
  );

  analytics.contracts.monthlyStats = Array.from(monthlyMap.entries()).map(
    ([month, data]: [string, any]) => ({
      month,
      completed: data.completed,
      earnings: data.earnings,
      averageValue: data.completed > 0 ? data.total / data.completed : 0,
    })
  );

  // Engagement metrics
  const proposalsSent = await Proposal.count({ where: { freelancerId: userId } });
  const proposalsAccepted = await Proposal.count({
    where: {
      freelancerId: userId,
      status: "approved",
    }
  });

  analytics.engagement.proposalsSent = proposalsSent;
  analytics.engagement.proposalsAccepted = proposalsAccepted;
  analytics.engagement.acceptanceRate =
    proposalsSent > 0 ? (proposalsAccepted / proposalsSent) * 100 : 0;

  const jobsPosted = await Job.count({ where: { clientId: userId } });
  const jobsCompleted = await Contract.count({
    where: {
      clientId: userId,
      status: "completed",
    }
  });

  analytics.engagement.jobsPosted = jobsPosted;
  analytics.engagement.jobsCompleted = jobsCompleted;

  // Calculate response time (would need message timestamps)
  // For now, set to 0 - implement based on your ChatMessage model

  analytics.lastCalculated = new Date();
  await analytics.save();

  return analytics;
}

// Get user analytics (Super PRO only)
router.get("/", protect, requireSuperPro, async (req: AuthRequest, res: Response) => {
  try {
    let analytics = await UserAnalytics.findOne({ where: { userId: req.user.id } });

    // If analytics don't exist or are outdated (>24h), recalculate
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    if (!analytics || analytics.lastCalculated < oneDayAgo) {
      analytics = await calculateAnalytics(req.user.id);
    }

    res.json(analytics);
  } catch (error) {
    console.error("Error fetching user analytics:", error);
    res.status(500).json({ message: "Error al obtener estadísticas" });
  }
});

// Track profile view
router.post("/profile-view", protect, async (req: AuthRequest, res: Response) => {
  try {
    const { profileUserId, referrer } = req.body;

    if (!profileUserId) {
      return res.status(400).json({ message: "profileUserId es requerido" });
    }

    // Don't track own profile views
    if (profileUserId === req.user.id.toString()) {
      return res.json({ message: "No se rastrean visitas propias" });
    }

    let analytics = await getOrCreateAnalytics(profileUserId);

    // Check if this visitor already viewed recently (within 1 hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentView = analytics.profileViews.history.find(
      (view: any) =>
        view.visitorId?.toString() === req.user.id.toString() &&
        view.timestamp > oneHourAgo
    );

    if (!recentView) {
      analytics.profileViews.total++;
      analytics.profileViews.history.push({
        visitorId: req.user.id,
        timestamp: new Date(),
        referrer: referrer || undefined,
      });

      // Keep only last 1000 views
      if (analytics.profileViews.history.length > 1000) {
        analytics.profileViews.history = analytics.profileViews.history.slice(-1000);
      }

      // Update unique count
      const uniqueVisitors = new Set(
        analytics.profileViews.history
          .filter((visit: any) => visit.visitorId)
          .map((visit: any) => visit.visitorId.toString())
      );
      analytics.profileViews.unique = uniqueVisitors.size;

      await analytics.save();
    }

    res.json({ message: "Visita registrada" });
  } catch (error) {
    console.error("Error tracking profile view:", error);
    res.status(500).json({ message: "Error al registrar visita" });
  }
});

// Force recalculate analytics (Super PRO only)
router.post("/recalculate", protect, requireSuperPro, async (req: AuthRequest, res: Response) => {
  try {
    const analytics = await calculateAnalytics(req.user.id);
    res.json(analytics);
  } catch (error) {
    console.error("Error recalculating analytics:", error);
    res.status(500).json({ message: "Error al recalcular estadísticas" });
  }
});

// Get profile visitors list (Super PRO only)
router.get("/profile-visitors", protect, requireSuperPro, async (req: AuthRequest, res: Response) => {
  try {
    const { limit = 50 } = req.query;

    const analytics = await UserAnalytics.findOne({
      where: { userId: req.user.id },
      include: [
        {
          association: 'profileViews.history.visitorId',
          attributes: ['name', 'avatar', 'role']
        }
      ]
    });

    if (!analytics) {
      return res.json({ visitors: [], total: 0 });
    }

    const analyticsData = analytics.toJSON();

    // Get unique visitors with last visit time
    const visitorMap = new Map();

    analyticsData.profileViews.history
      .filter((view: any) => view.visitorId)
      .forEach((view: any) => {
        const visitorId = view.visitorId.id.toString();
        const existing = visitorMap.get(visitorId);

        if (!existing || view.timestamp > existing.lastVisit) {
          visitorMap.set(visitorId, {
            visitor: view.visitorId,
            lastVisit: view.timestamp,
            visits: (existing?.visits || 0) + 1,
          });
        }
      });

    const visitors = Array.from(visitorMap.values())
      .sort((a, b) => new Date(b.lastVisit).getTime() - new Date(a.lastVisit).getTime())
      .slice(0, Number(limit));

    res.json({
      visitors,
      total: visitorMap.size,
      totalViews: analyticsData.profileViews.total,
    });
  } catch (error) {
    console.error("Error fetching profile visitors:", error);
    res.status(500).json({ message: "Error al obtener visitantes" });
  }
});

// Get conversation insights (Super PRO only)
router.get("/conversation-insights", protect, requireSuperPro, async (req: AuthRequest, res: Response) => {
  try {
    const analytics = await UserAnalytics.findOne({
      where: { userId: req.user.id },
      include: [
        {
          association: 'conversations.conversationPartners.userId',
          attributes: ['name', 'avatar']
        }
      ]
    });

    if (!analytics) {
      return res.json({ insights: [] });
    }

    const analyticsData = analytics.toJSON();

    // Sort by contracts count and recent activity
    const insights = analyticsData.conversations.conversationPartners
      .sort((a: any, b: any) => {
        if (a.contractsCount !== b.contractsCount) {
          return b.contractsCount - a.contractsCount;
        }
        return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
      })
      .slice(0, 20);

    res.json({
      total: analyticsData.conversations.total,
      withContracts: analyticsData.conversations.withCompletedContract,
      insights,
    });
  } catch (error) {
    console.error("Error fetching conversation insights:", error);
    res.status(500).json({ message: "Error al obtener insights de conversaciones" });
  }
});

export default router;
