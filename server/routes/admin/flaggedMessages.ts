import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { protect, authorize, AuthRequest } from '../../middleware/auth.js';
import { ChatMessage } from '../../models/sql/ChatMessage.model.js';
import { User } from '../../models/sql/User.model.js';
import { Conversation } from '../../models/sql/Conversation.model.js';

/**
 * Mensajes con un posible intercambio de contacto.
 *
 * El filtro del chat bloquea lo evidente y deja pasar lo ambiguo, porque el
 * chat es donde se negocia el precio y frenar un "te cobro 15.000 pesos" es
 * mucho peor que dejar pasar un telefono. Pero esa misma tolerancia es el hueco
 * por donde se evade: "te cobro 1123456789" pasa.
 *
 * Esos casos llegan acá. El mensaje se envio con normalidad y quien lo escribio
 * no se entero de nada -- avisarle seria ensenarle donde esta el hueco.
 *
 * Un falso positivo en esta lista no le cuesta nada a nadie: alguien mira el
 * mensaje y sigue. Mas adelante esto lo puede resolver un agente, que es capaz
 * de leer la conversacion entera y no solo el numero suelto.
 */
const router = Router();
router.use(protect, authorize('admin', 'super_admin', 'owner', 'support'));

// @route GET /api/admin/flagged-messages
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    const { rows, count } = await ChatMessage.findAndCountAll({
      where: {
        metadata: { [Op.contains]: {} },
        // Sólo los marcados por el filtro: metadata la usan otras cosas.
        [Op.and]: [{ 'metadata.posibleContacto': { [Op.ne]: null } } as any],
      },
      // ChatMessage no tiene asociación declarada con Conversation, así que el
      // trabajo se resuelve aparte en vez de con un include que no existe.
      include: [
        { model: User, as: 'sender', attributes: ['id', 'name', 'email'], required: false },
      ],
      order: [['createdAt', 'DESC']],
      limit,
      offset,
    });

    const convIds = [...new Set(rows.map((m: any) => m.conversationId).filter(Boolean))];
    const convs = convIds.length
      ? await Conversation.findAll({ where: { id: { [Op.in]: convIds } }, attributes: ['id', 'jobId'] })
      : [];
    const jobPorConv = new Map(convs.map((c: any) => [c.id, c.jobId]));

    res.json({
      success: true,
      data: rows.map((m: any) => ({
        id: m.id,
        conversationId: m.conversationId,
        jobId: jobPorConv.get(m.conversationId) || null,
        autor: m.sender ? { id: m.sender.id, nombre: m.sender.name, email: m.sender.email } : null,
        mensaje: m.message,
        detectado: m.metadata?.posibleContacto || [],
        fecha: m.createdAt,
      })),
      pagination: { total: count, limit, offset },
    });
  } catch (error: any) {
    console.error('Error listando mensajes marcados:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
