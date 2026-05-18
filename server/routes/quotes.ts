import express, { Response } from 'express';
import { Op } from 'sequelize';
import { Quote } from '../models/sql/Quote.model.js';
import { User } from '../models/sql/User.model.js';
import { Job } from '../models/sql/Job.model.js';
import { Contract } from '../models/sql/Contract.model.js';
import { Proposal } from '../models/sql/Proposal.model.js';
import { ChatMessage } from '../models/sql/ChatMessage.model.js';
import { Conversation } from '../models/sql/Conversation.model.js';
import { Notification } from '../models/sql/Notification.model.js';
import { protect } from '../middleware/auth.js';
import { generateQuotePDF } from '../services/pdfGenerator.js';
import { getIO } from '../services/socket.js';
import { calculateCommission } from '../services/commissionService.js';
import * as socketService from '../services/socket.js';
import type { AuthRequest } from '../types/index.js';

const router = express.Router();
router.use(protect);

// GET /api/quotes – list quotes sent and received by current user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { type = 'all', status, page = '1', limit = '20' } = req.query;
    const userId = req.user.id || req.user._id;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (type === 'sent') where.senderId = userId;
    else if (type === 'received') where.recipientId = userId;
    else where[Op.or] = [{ senderId: userId }, { recipientId: userId }];

    if (status) where.status = status;

    const { rows: quotes, count: total } = await Quote.findAndCountAll({
      where,
      limit: parseInt(limit as string),
      offset,
      order: [['createdAt', 'DESC']],
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: Job, as: 'job', attributes: ['id', 'title', 'status'] },
      ],
    });

    res.json({
      success: true,
      data: quotes,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/quotes/:id – get quote detail
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: Job, as: 'job', attributes: ['id', 'title', 'status', 'price'] },
      ],
    });

    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    // Only sender or recipient can view
    if (quote.senderId !== (req.user.id || req.user._id) && quote.recipientId !== (req.user.id || req.user._id)) {
      res.status(403).json({ success: false, message: 'Sin permiso para ver esta cotización' });
      return;
    }

    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/quotes – create and send a quote
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const {
      recipientId,
      jobId,
      proposalId,
      conversationId,
      title,
      items,
      taxRate = 21,
      otherTaxes = [],
      notes,
      paymentTerms,
      validUntil,
      status = 'sent',
      applyMode = false,
    } = req.body;

    if (!recipientId || !title || !items?.length) {
      res.status(400).json({ success: false, message: 'Destinatario, título e ítems son requeridos' });
      return;
    }

    const recipient = await User.findByPk(recipientId, {
      attributes: ['id', 'name', 'email', 'avatar'],
    });
    if (!recipient) {
      res.status(404).json({ success: false, message: 'Destinatario no encontrado' });
      return;
    }

    const sender = await User.findByPk(req.user.id || req.user._id, {
      attributes: ['id', 'name', 'email', 'avatar'],
    });

    // Calculate totals
    const itemsWithAmounts = items.map((item: any) => ({
      qty: Number(item.qty),
      description: String(item.description),
      unitPrice: Number(item.unitPrice),
      amount: Number(item.qty) * Number(item.unitPrice),
    }));

    const subtotal = itemsWithAmounts.reduce((s: number, i: any) => s + i.amount, 0);
    const taxAmount = subtotal * (Number(taxRate) / 100);
    const otherTaxesTotal = (otherTaxes as any[]).reduce((s: number, t: any) => s + (subtotal * (t.rate / 100)), 0);
    const total = subtotal + taxAmount + otherTaxesTotal;

    const quote = await Quote.create({
      senderId: req.user.id || req.user._id,
      recipientId,
      jobId: jobId || null,
      proposalId: proposalId || null,
      conversationId: conversationId || null,
      title,
      items: itemsWithAmounts,
      subtotal,
      taxRate: Number(taxRate),
      taxAmount,
      otherTaxes: otherTaxes || [],
      total,
      notes: notes || null,
      paymentTerms: paymentTerms || null,
      validUntil: validUntil ? new Date(validUntil) : null,
      status,
      senderInfo: {
        name: sender?.name || req.user.name,
        email: sender?.email || req.user.email,
      },
      recipientInfo: {
        name: recipient.name,
        email: recipient.email,
      },
    });

    // If applying to a job via quote, create or update a proposal
    let convId = conversationId;
    if (applyMode && jobId) {
      const [proposal, proposalCreated] = await Proposal.findOrCreate({
        where: { jobId, freelancerId: req.user.id || req.user._id },
        defaults: {
          jobId,
          freelancerId: req.user.id || req.user._id,
          coverLetter: title,
          proposedPrice: total,
          estimatedDuration: 1,
          status: 'pending',
        } as any,
      });
      if (!proposalCreated) {
        await proposal.update({ proposedPrice: total } as any);
      }
      await quote.update({ proposalId: proposal.id });

      // Find or create conversation between these two users for this job
      let conv = await Conversation.findOne({
        where: {
          jobId,
          participants: { [Op.contains]: [req.user.id || req.user._id, recipientId] },
        } as any,
      });
      if (!conv) {
        conv = await Conversation.create({
          participants: [req.user.id || req.user._id, recipientId],
          jobId,
        } as any);
      }
      convId = conv.id;
      await quote.update({ conversationId: convId });
    }

    // If linked to conversation, post a system message in chat
    if (convId && status === 'sent') {
      await _postQuoteChatMessage(quote, req.user.id || req.user._id, convId, 'sent');
    }

    // Notify recipient
    await Notification.create({
      recipientId,
      type: 'info',
      category: 'system',
      title: `Nueva cotización de ${req.user.name}`,
      message: `${req.user.name} te envió una cotización: "${title}" por $${total.toLocaleString('es-AR')} ARS`,
      relatedModel: 'Quote',
      relatedId: quote.id,
      actionUrl: `/quotes/${quote.id}`,
      actionText: 'Ver cotización',
      sentVia: ['in_app'],
    });

    const io = getIO();
    if (io) {
      io.emit(`user:${recipientId}`, {
        event: 'notification:new',
        title: `Nueva cotización de ${req.user.name}`,
        message: `"${title}" por $${total.toLocaleString('es-AR')} ARS`,
      });
    }

    await quote.reload({
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
    });

    res.status(201).json({ success: true, message: 'Cotización enviada correctamente', data: quote, conversationId: convId || null });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// PUT /api/quotes/:id – edit a draft or rejected quote
router.put('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await Quote.findByPk(req.params.id);
    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    if (quote.senderId !== (req.user.id || req.user._id)) {
      res.status(403).json({ success: false, message: 'Solo el remitente puede editar la cotización' });
      return;
    }

    if (!['draft', 'rejected'].includes(quote.status)) {
      res.status(400).json({ success: false, message: 'Solo se pueden editar cotizaciones en borrador o rechazadas' });
      return;
    }

    if (quote.status === 'rejected' && quote.revisionCount >= 2) {
      res.status(400).json({ success: false, message: 'Se alcanzó el límite de 2 contraoferts por cotización' });
      return;
    }

    const { title, items, taxRate, otherTaxes, notes, paymentTerms, validUntil } = req.body;

    let subtotal = quote.subtotal;
    let taxAmount = quote.taxAmount;
    let total = quote.total;
    let updatedItems = quote.items;
    const newTaxRate = taxRate !== undefined ? Number(taxRate) : quote.taxRate;
    const newOtherTaxes = otherTaxes !== undefined ? otherTaxes : quote.otherTaxes;

    if (items) {
      updatedItems = items.map((item: any) => ({
        qty: Number(item.qty),
        description: String(item.description),
        unitPrice: Number(item.unitPrice),
        amount: Number(item.qty) * Number(item.unitPrice),
      }));
      subtotal = updatedItems.reduce((s: number, i: any) => s + i.amount, 0);
      taxAmount = subtotal * (newTaxRate / 100);
      const otherTotal = newOtherTaxes.reduce((s: number, t: any) => s + (subtotal * (t.rate / 100)), 0);
      total = subtotal + taxAmount + otherTotal;
    }

    const wasRejected = quote.status === 'rejected';

    await quote.update({
      title: title || quote.title,
      items: updatedItems,
      subtotal,
      taxRate: newTaxRate,
      taxAmount,
      otherTaxes: newOtherTaxes,
      total,
      notes: notes !== undefined ? notes : quote.notes,
      paymentTerms: paymentTerms !== undefined ? paymentTerms : quote.paymentTerms,
      validUntil: validUntil ? new Date(validUntil) : quote.validUntil,
      status: 'sent',
      rejectionReason: null,
      revisionCount: wasRejected ? quote.revisionCount + 1 : quote.revisionCount,
    });

    // If had a conversationId and was rejected, post updated message
    if (quote.conversationId && wasRejected) {
      await _postQuoteChatMessage(quote, req.user.id || req.user._id, quote.conversationId, 'revised');

      // Notify recipient
      await Notification.create({
        recipientId: quote.recipientId,
        type: 'info',
        category: 'system',
        title: 'Cotización actualizada',
        message: `${req.user.name} envió una cotización revisada: "${quote.title}"`,
        relatedModel: 'Quote',
        relatedId: quote.id,
        actionUrl: `/quotes/${quote.id}`,
        actionText: 'Ver cotización',
        sentVia: ['in_app'],
      });
    }

    await quote.reload({
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email', 'avatar'] },
      ],
    });

    res.json({ success: true, message: 'Cotización actualizada', data: quote });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/:id/accept – recipient accepts the quote
router.post('/:id/accept', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    if (quote.recipientId !== (req.user.id || req.user._id)) {
      res.status(403).json({ success: false, message: 'Solo el destinatario puede aceptar la cotización' });
      return;
    }

    if (quote.status !== 'sent') {
      res.status(400).json({ success: false, message: 'Solo se pueden aceptar cotizaciones pendientes' });
      return;
    }

    await quote.update({ status: 'accepted' });

    // Update chat message metadata if linked to conversation
    if (quote.conversationId) {
      await _updateQuoteChatMessageStatus(quote.id, quote.conversationId, 'accepted');
    }

    // Auto-create contract if quote is linked to a job
    let contractId: string | null = null;
    if (quote.jobId) {
      try {
        const job = await Job.findByPk(quote.jobId);
        if (job && job.status === 'open') {
          const clientId = req.user.id || req.user._id;
          const doerId = quote.senderId; // worker sent the quote
          const price = Number(quote.total);

          const commissionResult = await calculateCommission(clientId, price, {});
          const contract = await Contract.create({
            jobId: job.id,
            clientId,
            doerId,
            type: 'trabajo',
            price,
            commission: commissionResult.commission,
            commissionPercentage: commissionResult.rate,
            totalPrice: price + commissionResult.commission,
            startDate: job.startDate || new Date(),
            endDate: job.endDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            status: 'pending',
            termsAccepted: false,
            termsAcceptedByClient: false,
            termsAcceptedByDoer: false,
          } as any);

          // Mark job in_progress and assign worker
          await job.update({
            doerId,
            status: 'in_progress',
            selectedWorkers: [doerId],
          } as any);

          // Approve or create proposal
          if (quote.proposalId) {
            await Proposal.update({ status: 'approved' }, { where: { id: quote.proposalId } });
          } else {
            await Proposal.findOrCreate({
              where: { jobId: job.id, freelancerId: doerId },
              defaults: {
                jobId: job.id,
                freelancerId: doerId,
                coverLetter: quote.title,
                proposedPrice: price,
                estimatedDuration: 1,
                status: 'approved',
              } as any,
            }).then(([p, created]) => {
              if (!created) p.update({ status: 'approved' });
            });
          }

          contractId = contract.id;

          // Notify worker of auto-created contract
          await Notification.create({
            recipientId: doerId,
            type: 'success',
            category: 'system',
            title: 'Contrato creado automáticamente',
            message: `${req.user.name} aceptó tu cotización y se generó un contrato para "${job.title}"`,
            relatedModel: 'Contract',
            relatedId: contractId,
            actionUrl: `/contracts/${contractId}`,
            actionText: 'Ver contrato',
            sentVia: ['in_app'],
          });

          const io = getIO();
          if (io) {
            io.emit(`user:${doerId}`, {
              event: 'notification:new',
              title: 'Contrato generado',
              message: `Tu cotización fue aceptada. Revisá el contrato en Mis Contratos.`,
            });
          }

          // Post system message in chat
          if (quote.conversationId) {
            await ChatMessage.create({
              conversationId: quote.conversationId,
              senderId: clientId,
              message: `Contrato generado||A partir de la cotización aceptada||Ver contrato: /contracts/${contractId}`,
              type: 'system',
              metadata: {
                action: 'contract_from_quote',
                contractId,
                quoteId: quote.id,
              },
            } as any);
          }
        }
      } catch (contractErr: any) {
        console.error('[quotes/accept] Error creating contract from quote:', contractErr.message);
        // Non-fatal: quote is already accepted, contract creation failed
      }
    }

    // Notify sender (quote accepted notification)
    await Notification.create({
      recipientId: quote.senderId,
      type: 'success',
      category: 'system',
      title: contractId ? 'Cotización aceptada — contrato creado' : 'Cotización aceptada',
      message: `${req.user.name} aceptó tu cotización "${quote.title}"`,
      relatedModel: 'Quote',
      relatedId: quote.id,
      actionUrl: contractId ? `/contracts/${contractId}` : `/quotes/${quote.id}`,
      actionText: contractId ? 'Ver contrato' : 'Ver cotización',
      sentVia: ['in_app'],
    });

    const io = getIO();
    if (io) {
      io.emit(`user:${quote.senderId}`, {
        event: 'notification:new',
        title: contractId ? 'Cotización aceptada — contrato creado' : 'Cotización aceptada',
        message: `${req.user.name} aceptó "${quote.title}"`,
      });
    }

    res.json({
      success: true,
      message: contractId ? 'Cotización aceptada y contrato creado automáticamente' : 'Cotización aceptada',
      data: quote,
      contractId,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/:id/pay – recipient pays the quote (no-job flow: total + 8% commission)
router.post('/:id/pay', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    const userId = req.user.id || req.user._id;

    if (quote.recipientId !== userId) {
      res.status(403).json({ success: false, message: 'Solo el destinatario puede pagar la cotización' });
      return;
    }

    if (!['sent', 'pending_payment'].includes(quote.status)) {
      res.status(400).json({ success: false, message: 'Esta cotización no está disponible para pago' });
      return;
    }

    // Calculate 8% platform commission on the quote total
    const baseAmount = Number(quote.total);
    const commissionRate = 0.08;
    const commission = Math.max(baseAmount * commissionRate, 1000); // min $1000 ARS
    const totalWithCommission = baseAmount + commission;

    // Create MercadoPago preference
    const mercadoPagoService = (await import('../services/mercadopago.js')).default;
    const preference = await (mercadoPagoService as any).createPreference({
      title: `Cotización: ${quote.title}`,
      description: `Pago de cotización ${quote.quoteNumber} — incluye 8% comisión`,
      price: totalWithCommission,
      quoteId: quote.id,
      clientId: userId.toString(),
      doerId: quote.senderId.toString(),
    });

    // Create Payment record
    const { Payment } = await import('../models/sql/Payment.model.js');
    const payment = await Payment.create({
      payerId: userId,
      recipientId: quote.senderId,
      quoteId: quote.id,
      amount: totalWithCommission,
      currency: 'ARS',
      status: 'pending',
      paymentType: 'quote_payment',
      mercadoPagoPreferenceId: preference.id,
      description: `Cotización: ${quote.title}`,
      platformFee: commission,
      platformFeePercentage: commissionRate * 100,
      isEscrow: false,
    } as any);

    // Mark quote as pending_payment
    await quote.update({ status: 'pending_payment' } as any);
    if (quote.conversationId) {
      await _updateQuoteChatMessageStatus(quote.id, quote.conversationId, 'pending_payment');
    }

    res.json({
      success: true,
      paymentUrl: preference.init_point,
      paymentId: payment.id,
      preferenceId: preference.id,
      totalWithCommission,
      commission,
      baseAmount,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// POST /api/quotes/:id/reject – recipient rejects the quote
router.post('/:id/reject', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { reason } = req.body;

    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email'] },
      ],
    });

    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    if (quote.recipientId !== (req.user.id || req.user._id)) {
      res.status(403).json({ success: false, message: 'Solo el destinatario puede rechazar la cotización' });
      return;
    }

    if (quote.status !== 'sent') {
      res.status(400).json({ success: false, message: 'Solo se pueden rechazar cotizaciones pendientes' });
      return;
    }

    await quote.update({ status: 'rejected', rejectionReason: reason || null });

    // Update chat message metadata
    if (quote.conversationId) {
      await _updateQuoteChatMessageStatus(quote.id, quote.conversationId, 'rejected');
    }

    // Notify sender
    await Notification.create({
      recipientId: quote.senderId,
      type: 'warning',
      category: 'system',
      title: 'Cotización rechazada',
      message: reason
        ? `${req.user.name} rechazó tu cotización "${quote.title}": ${reason}`
        : `${req.user.name} rechazó tu cotización "${quote.title}"`,
      relatedModel: 'Quote',
      relatedId: quote.id,
      actionUrl: `/quotes/${quote.id}`,
      actionText: 'Ver cotización',
      sentVia: ['in_app'],
    });

    const io = getIO();
    if (io) {
      io.emit(`user:${quote.senderId}`, {
        event: 'notification:new',
        title: 'Cotización rechazada',
        message: `${req.user.name} rechazó "${quote.title}"`,
      });
    }

    res.json({ success: true, message: 'Cotización rechazada', data: quote });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/quotes/:id/pdf – download PDF
router.get('/:id/pdf', async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const quote = await Quote.findByPk(req.params.id, {
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: User, as: 'recipient', attributes: ['id', 'name', 'email', 'avatar'] },
        { model: Job, as: 'job', attributes: ['id', 'title'] },
      ],
    });

    if (!quote) {
      res.status(404).json({ success: false, message: 'Cotización no encontrada' });
      return;
    }

    if (quote.senderId !== (req.user.id || req.user._id) && quote.recipientId !== (req.user.id || req.user._id)) {
      res.status(403).json({ success: false, message: 'Sin permiso' });
      return;
    }

    const pdfPath = await generateQuotePDF(quote);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${quote.quoteNumber}.pdf"`);
    res.sendFile(pdfPath);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Helper: post a quote card as system message in chat
async function _postQuoteChatMessage(
  quote: Quote,
  senderId: string,
  conversationId: string,
  action: 'sent' | 'revised',
): Promise<void> {
  try {
    const verb = action === 'revised' ? 'revisó' : 'envió';
    const msgText = `${verb === 'envió' ? 'Nueva' : 'Cotización revisada'}||${quote.quoteNumber}: ${quote.title}||Total: $${Number(quote.total).toLocaleString('es-AR')} ARS`;

    const chatMsg = await ChatMessage.create({
      conversationId,
      senderId,
      message: msgText,
      type: 'system',
      metadata: {
        action: 'quote',
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        quoteTitle: quote.title,
        quoteTotal: Number(quote.total),
        quoteStatus: quote.status,
        quoteAction: action,
        jobId: quote.jobId || null,
      },
    });

    // Update conversation last message (individualHooks: false skips BeforeValidate on participants)
    await Conversation.update(
      { lastMessage: `Cotización: ${quote.title}`, lastMessageAt: new Date() },
      { where: { id: conversationId }, individualHooks: false },
    );

    // Broadcast via socket (include sender so client cards don't crash)
    const io = getIO();
    if (io) {
      const senderUser = await User.findByPk(senderId, { attributes: ['id', 'name', 'avatar'] });
      io.to(`conversation:${conversationId}`).emit('message:new', {
        ...chatMsg.toJSON(),
        sender: senderUser ? { id: senderUser.id, name: senderUser.name, avatar: senderUser.avatar } : null,
      });
    }
  } catch (err) {
    console.error('Error posting quote chat message:', err);
  }
}

// Helper: update metadata on existing quote chat messages for this quote
async function _updateQuoteChatMessageStatus(
  quoteId: string,
  conversationId: string,
  newStatus: string,
): Promise<void> {
  try {
    const messages = await ChatMessage.findAll({
      where: { conversationId },
    });

    for (const msg of messages) {
      if (msg.metadata?.quoteId === quoteId) {
        const updatedMetadata = { ...msg.metadata, quoteStatus: newStatus };
        await msg.update({ metadata: updatedMetadata });

        const io = getIO();
        if (io) {
          io.to(`conversation:${conversationId}`).emit('message:updated', {
            messageId: msg.id,
            metadata: updatedMetadata,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error updating quote chat message status:', err);
  }
}

export default router;
