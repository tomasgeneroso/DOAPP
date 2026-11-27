import { analyzeMessage, contactBlockedMessage } from "../../shared/chat/contactFilter.js";
import { tienePoderesDeEquipo } from "./claveDePanel.js";
import { chatDelEquipoCerrado } from "./chatDelEquipo.js";
import { Server, Socket } from "socket.io";
import { Server as HTTPServer } from "http";
import jwt from "jsonwebtoken";
import { config } from "../config/env";
import { ChatMessage } from "../models/sql/ChatMessage.model.js";
import { Conversation } from "../models/sql/Conversation.model.js";
import { User } from "../models/sql/User.model.js";
import { Notification } from "../models/sql/Notification.model.js";
import { estaBaneadoAhora } from "../middleware/auth.js";
import { sesionVigente } from "./vigenciaDeSesion.js";
import { esDireccionDeArchivoPropia } from "../utils/direccionDeArchivo.js";
import { valorDeCookie } from "../utils/cookieDeSesion.js";
import fcmService from "./fcm";
import emailService from "./email";
import { Op } from 'sequelize';
import { SALA_DE_ADMINISTRACION } from "./avisosEnVivo.js";
import { paraQuienMira } from "./privacidadTrabajo.js";

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(id: any): boolean {
  return typeof id === 'string' && id.length > 0 && UUID_REGEX.test(id);
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
  user?: any;
}

interface TypingData {
  conversationId: string;
  isTyping: boolean;
}

/** Los únicos tipos que puede mandar una persona: «system» lo crea solo el servidor. */
const TIPOS_DE_MENSAJE_DEL_CLIENTE = ["text", "image", "file"] as const;
const LARGO_MAXIMO_DE_MENSAJE = 5000;
interface MessageData {
  conversationId: string;
  message: string;
  type?: "text" | "image" | "file";
  fileUrl?: string;
  fileName?: string;
  fileSize?: number;
}

interface ReadReceiptData {
  conversationId: string;
  messageId: string;
}

export class SocketService {
  private io: Server;

  constructor(httpServer: HTTPServer) {
    this.io = new Server(httpServer, {
      cors: {
        origin: config.clientUrl,
        credentials: true,
      },
    });

    this.setupMiddleware();
    this.setupEventHandlers();
  }

  private setupMiddleware() {
    // Authentication middleware
    this.io.use(async (socket: AuthenticatedSocket, next) => {
      try {
        // La web ya no guarda el token en el navegador: la sesión viaja en la cookie httpOnly (que el navegador manda solo en la conexión). La app móvil sigue
        // mandando su token en `auth.token` o en la cabecera. Vale el primero que verifica.
        const candidatos = [
          socket.handshake.auth?.token,
          socket.handshake.headers.authorization?.split(" ")[1],
          valorDeCookie(socket.handshake.headers.cookie, "token"),
        ].filter((t): t is string => typeof t === "string" && t.length > 0);

        if (candidatos.length === 0) {
          return next(new Error("Authentication error: No token provided"));
        }

        let decoded: any = null;
        for (const candidato of candidatos) {
          try {
            decoded = jwt.verify(candidato, config.jwtSecret);
            break;
          } catch {
            /* se prueba el siguiente */
          }
        }
        if (!decoded) throw new Error("token inválido");
        const user = await User.findByPk(decoded.id, {
          attributes: { exclude: ['password'] }
        });

        if (!user) {
          return next(new Error("Authentication error: User not found"));
        }

        // Sesión cerrada (cerrar todas / cambio de contraseña) o token de otro propósito: no se conecta.
        if (!sesionVigente(decoded, user as any)) {
          return next(new Error("Authentication error: Invalid token"));
        }

        // Una cuenta baneada no se conecta al tiempo real (antes sólo la pantalla la mandaba a /banned).
        if (estaBaneadoAhora(user as any)) {
          return next(new Error("Authentication error: Account banned"));
        }

        socket.userId = user.id;
        socket.user = user;
        next();
      } catch (error) {
        next(new Error("Authentication error: Invalid token"));
      }
    });
  }

  private setupEventHandlers() {
    this.io.on("connection", (socket: AuthenticatedSocket) => {
      console.log(`✅ User connected: ${socket.userId}`);

      // Sala personal: todos los avisos para una persona van acá, así llegan a TODAS sus pestañas y dispositivos (antes se guardaba un solo socket por
      // persona: abrir una segunda pestaña dejaba a la primera sin avisos, y cerrar una la dejaba «desconectada» para las dos).
      socket.join(`user:${socket.userId}`);

      // El equipo de administración recibe además los avisos de cambios de dinero, contratos y trabajos (`admin:*`). Antes se emitían a TODOS los
      // conectados, con los datos del pago o del retiro de otras personas.
      // Solo con la clave de panel puesta (la web manda la cookie del pase; la app, `auth.panel`).
      if ((socket.user as any)?.adminRole) {
        const pase = socket.handshake.auth?.panel || valorDeCookie(socket.handshake.headers.cookie, "panel");
        void tienePoderesDeEquipo({ cookies: { panel: pase }, headers: {} }, socket.user)
          .then((abierto) => { if (abierto) socket.join(SALA_DE_ADMINISTRACION); })
          .catch(() => undefined);
      }

      // Send online status to contacts (sólo cuando es su primera conexión)
      if (this.cantidadDeConexiones(socket.userId!) === 1) this.broadcastOnlineStatus(socket.userId!, true);

      // Handle joining conversation rooms
      socket.on("join:conversation", async (conversationId: string) => {
        await this.handleJoinConversation(socket, conversationId);
      });

      // Handle leaving conversation rooms
      socket.on("leave:conversation", (conversationId: string) => {
        socket.leave(`conversation:${conversationId}`);
      });

      // Handle sending messages
      socket.on("message:send", async (data: MessageData) => {
        await this.handleSendMessage(socket, data);
      });

      // Handle typing indicators
      socket.on("typing:start", (data: TypingData) => {
        this.handleTyping(socket, data, true);
      });

      socket.on("typing:stop", (data: TypingData) => {
        this.handleTyping(socket, data, false);
      });

      // Handle read receipts
      socket.on("message:read", async (data: ReadReceiptData) => {
        await this.handleReadReceipt(socket, data);
      });

      // Handle mark all as read
      socket.on("conversation:mark-read", async (conversationId: string) => {
        await this.handleMarkConversationRead(socket, conversationId);
      });

      // Handle disconnect
      socket.on("disconnect", () => {
        console.log(`❌ User disconnected: ${socket.userId}`);
        // Sólo figura sin conexión cuando se cierra la ÚLTIMA pestaña.
        if (socket.userId && this.cantidadDeConexiones(socket.userId) === 0) {
          this.broadcastOnlineStatus(socket.userId, false);
        }
      });
    });
  }

  private async handleJoinConversation(socket: AuthenticatedSocket, conversationId: string) {
    try {
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        socket.emit("socket_error", { message: "Conversation not found" });
        return;
      }

      // Verify user is a participant - normalize IDs to strings for comparison
      const userId = socket.userId?.toString() || '';
      // Normalize all participant IDs to strings for comparison
      const participantIds = conversation.participants.map(p => p?.toString() || '');
      const isParticipant = participantIds.includes(userId);

      console.log(`🔍 Join conversation check: userId=${userId}, participants=${JSON.stringify(participantIds)}, isParticipant=${isParticipant}`);

      if (!isParticipant) {
        socket.emit("socket_error", { message: "You are not a participant in this conversation" });
        return;
      }

      socket.join(`conversation:${conversationId}`);

      // Load recent messages
      const messages = await ChatMessage.findAll({
        where: {
          conversationId,
        },
        order: [['createdAt', 'DESC']],
        limit: 50,
        include: [{
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }]
      });

      socket.emit("conversation:history", {
        conversationId,
        messages: messages.reverse(),
      });
    } catch (error: any) {
      console.error("Join conversation error:", error);
      socket.emit("socket_error", { message: error.message });
    }
  }

  private async handleSendMessage(socket: AuthenticatedSocket, data: MessageData) {
    try {
      // Lo que llega por el socket lo escribe el cliente: se valida igual que en la API (auditoría 2026-11-24). Antes `type` era libre: con «system» se podía
      // falsificar un aviso de la plataforma y con cualquier tipo que no fuera «text» se salteaba el filtro de teléfonos y correos.
      const { conversationId, fileName, fileSize } = data || ({} as MessageData);
      const type = TIPOS_DE_MENSAJE_DEL_CLIENTE.includes(String(data?.type ?? "text") as any) ? (String(data?.type ?? "text") as "text" | "image" | "file") : null;
      if (!type) {
        socket.emit("socket_error", { message: "Tipo de mensaje no permitido", code: "TIPO_DE_MENSAJE_INVALIDO" });
        return;
      }
      const message = typeof data?.message === "string" ? data.message : "";
      if (message.length > LARGO_MAXIMO_DE_MENSAJE) {
        socket.emit("socket_error", { message: `El mensaje es demasiado largo (máximo ${LARGO_MAXIMO_DE_MENSAJE} caracteres).`, code: "MENSAJE_MUY_LARGO" });
        return;
      }
      // Un archivo solo puede apuntar a un archivo de esta misma plataforma (nunca una dirección de afuera ni «javascript:»).
      const fileUrl = typeof data?.fileUrl === "string" ? data.fileUrl : undefined;
      if (type === "text" ? !message.trim() : !fileUrl || !esDireccionDeArchivoPropia(fileUrl)) {
        socket.emit("socket_error", { message: type === "text" ? "Escribí un mensaje" : "El archivo no es válido", code: "MENSAJE_INVALIDO" });
        return;
      }

      // Verify conversation exists and user is participant
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        socket.emit("error", { message: "Conversation not found" });
        return;
      }

      // Verify user is a participant - normalize IDs to strings for comparison
      const senderId = socket.userId?.toString() || '';
      const participantIds = conversation.participants.map(p => p?.toString() || '');
      const isParticipant = participantIds.includes(senderId);

      if (!isParticipant) {
        console.log(`❌ Message rejected: userId=${senderId}, participants=${JSON.stringify(participantIds)}`);
        socket.emit("socket_error", { message: "You are not a participant in this conversation" });
        return;
      }

      // Chat del equipo cerrado (el trabajo terminó o se canceló): no se escribe más.
      if (chatDelEquipoCerrado(conversation as any)) {
        socket.emit("socket_error", { message: "Este chat se cerró porque el trabajo terminó.", code: "CHAT_CERRADO" });
        return;
      }

      // Mismo filtro que la API: por el socket no se pueden pasar teléfonos ni correos (antes este camino lo salteaba).
      // Se filtra el texto de TODOS los tipos (un archivo también puede traer un teléfono en su descripción), igual que en la API.
      if (message) {
        const analisis = analyzeMessage(String(message));
        if (analisis.bloquear.length > 0) {
          socket.emit("socket_error", { message: contactBlockedMessage(analisis.bloquear), code: "CONTACT_INFO_BLOCKED" });
          return;
        }
      }

      // Create message
      const chatMessage = await ChatMessage.create({
        conversationId,
        senderId: socket.userId,
        // Un archivo sin texto lleva igual un texto (la columna no admite vacío y la lista de conversaciones lo muestra).
        message: message || (type === "image" ? "📷 Imagen" : `📎 ${typeof fileName === "string" && fileName ? fileName.slice(0, 200) : "Archivo"}`),
        type,
        fileUrl,
        fileName: typeof fileName === "string" ? fileName.slice(0, 255) : undefined,
        fileSize: typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize >= 0 ? fileSize : undefined,
      });

      // Reload with sender data (include id for message alignment in frontend)
      await chatMessage.reload({
        include: [{
          model: User,
          as: 'sender',
          attributes: ['id', 'name', 'avatar']
        }]
      });

      // Update conversation
      conversation.lastMessage = (message || (type === "image" ? "📷 Imagen" : "📎 Archivo")).substring(0, 200);
      conversation.lastMessageAt = new Date();

      // Increment unread count for other participants
      conversation.participants.forEach((participantId) => {
        const participantIdStr = participantId.toString();
        if (participantIdStr !== socket.userId) {
          if (!conversation.unreadCount) conversation.unreadCount = {};
          conversation.unreadCount[participantIdStr] = (conversation.unreadCount[participantIdStr] || 0) + 1;
        }
      });
      // Mark unreadCount as changed for Sequelize to detect JSONB update
      conversation.changed('unreadCount', true);

      await conversation.save();

      // Broadcast message to all participants in the conversation
      this.io.to(`conversation:${conversationId}`).emit("message:new", chatMessage);

      // Send push notification to offline participants
      const otherParticipants = conversation.participants.filter(
        (p) => p.toString() !== socket.userId
      );

      for (const participantId of otherParticipants) {
        const participantIdStr = participantId?.toString() || '';

        // Skip invalid participant IDs
        if (!isValidUUID(participantIdStr)) {
          console.warn(`⚠️ Skipping invalid participant ID: ${participantIdStr}`);
          continue;
        }

        const isOnline = this.cantidadDeConexiones(participantIdStr) > 0;

        // Notify unread count update to the recipient
        const participantConversations = await Conversation.findAll({
          where: {
            participants: { [Op.contains]: [participantIdStr] },
            archived: false,
          },
          attributes: ['id', 'unreadCount']
        });

        const conversationIds = participantConversations.map(c => c.id);

        const unreadCount = await ChatMessage.count({
          where: {
            conversationId: {
              [Op.in]: conversationIds
            },
            senderId: { [Op.ne]: participantId },
            read: false,
          }
        });

        // Count conversations with unread messages for this user
        let unreadConversationsCount = 0;
        participantConversations.forEach((conv) => {
          const unreadMap = conv.unreadCount as Record<string, number> | null;
          const count = unreadMap?.[participantIdStr] || 0;
          if (count > 0) {
            unreadConversationsCount++;
          }
        });

        this.notifyUnreadMessagesUpdate(participantIdStr, unreadCount, unreadConversationsCount);

        if (!isOnline) {
          // Create notification for offline user
          await Notification.create({
            recipientId: participantIdStr,
            type: "info",
            category: "chat",
            title: "Nuevo mensaje",
            message: `${socket.user.name}: ${(message || (type === "image" ? "📷 Imagen" : "📎 Archivo")).substring(0, 100)}`,
            data: {
              conversationId,
              senderId: socket.userId,
            },
            read: false,
          });

          // Send push notification
          await fcmService.notifyNewMessage(
            participantIdStr,
            socket.user.name,
            message.substring(0, 100),
            conversationId
          );

          // Send email notification
          await emailService.sendNewMessageNotification(
            participantIdStr,
            socket.user.name,
            message.substring(0, 100),
            conversationId
          );
        }
      }
    } catch (error: any) {
      console.error("Send message error:", error);
      socket.emit("socket_error", { message: error.message });
    }
  }

  private handleTyping(socket: AuthenticatedSocket, data: TypingData, isTyping: boolean) {
    const { conversationId } = data;

    // Sólo quien está EN la conversación puede avisar que escribe: entra con join:conversation, que valida que sea
    // participante. Antes cualquiera mandaba «escribiendo…» a la sala de conversaciones ajenas.
    if (!conversationId || !socket.rooms.has(`conversation:${conversationId}`)) return;

    // Broadcast typing status to other participants in the conversation
    socket.to(`conversation:${conversationId}`).emit("typing:update", {
      conversationId,
      userId: socket.userId,
      userName: socket.user.name,
      isTyping,
    });
  }

  private async handleReadReceipt(socket: AuthenticatedSocket, data: ReadReceiptData) {
    try {
      const { conversationId, messageId } = data;

      // Validate messageId is not empty
      if (!messageId || messageId.trim() === '') {
        console.warn('Read receipt received with empty messageId, ignoring');
        return;
      }

      // Sólo desde dentro de la conversación (ver handleTyping), y el mensaje tiene que ser DE esa conversación:
      // antes se podía marcar como leído cualquier mensaje conociendo su id y avisarle a una sala ajena.
      if (!conversationId || !socket.rooms.has(`conversation:${conversationId}`)) return;

      const message = await ChatMessage.findByPk(messageId);

      if (!message) {
        return;
      }
      if (String(message.conversationId) !== String(conversationId)) return;

      // Update message as read
      message.read = true;
      message.readAt = new Date();
      await message.save();

      // Broadcast read receipt to sender
      this.io.to(`conversation:${conversationId}`).emit("message:read", {
        conversationId,
        messageId,
        readBy: socket.userId,
        readAt: message.readAt,
      });
    } catch (error: any) {
      console.error("Read receipt error:", error);
    }
  }

  private async handleMarkConversationRead(socket: AuthenticatedSocket, conversationId: string) {
    try {
      const conversation = await Conversation.findByPk(conversationId);

      if (!conversation) {
        return;
      }

      // Sólo un participante marca como leída una conversación (antes cualquiera, con sólo conocer el id).
      const quien = socket.userId?.toString() || '';
      if (!(conversation.participants || []).map((p) => p?.toString() || '').includes(quien)) return;

      // Mark all unread messages as read
      await ChatMessage.update(
        {
          read: true,
          readAt: new Date(),
        },
        {
          where: {
            conversationId,
            senderId: { [Op.ne]: socket.userId },
            read: false,
          }
        }
      );

      // Reset unread count for this user
      if (!conversation.unreadCount) conversation.unreadCount = {};
      conversation.unreadCount[socket.userId!] = 0;
      conversation.changed('unreadCount', true);
      await conversation.save();

      socket.emit("conversation:marked-read", { conversationId });
    } catch (error: any) {
      console.error("Mark conversation read error:", error);
    }
  }

  private broadcastOnlineStatus(userId: string, isOnline: boolean) {
    this.io.emit("user:status", {
      userId,
      isOnline,
      timestamp: new Date(),
    });
  }

  // Public methods to send messages from server-side code
  public async sendSystemMessage(conversationId: string, message: string) {
    try {
      const chatMessage = await ChatMessage.create({
        conversationId,
        senderId: null, // System message
        message,
        type: "system",
      });

      this.io.to(`conversation:${conversationId}`).emit("message:new", chatMessage);
    } catch (error) {
      console.error("Send system message error:", error);
    }
  }

  /** Cuántas pestañas o dispositivos tiene conectados una persona. */
  private cantidadDeConexiones(userId: string): number {
    return this.io.sockets.adapter.rooms.get(`user:${userId}`)?.size ?? 0;
  }

  public async notifyUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  /** A una sala cualquiera (la conversación abierta, la administración). */
  public emitToRoom(sala: string, event: string, data: unknown) {
    this.io.to(sala).emit(event, data);
  }

  // Broadcast updates to specific users
  public broadcastToUser(userId: string, event: string, data: any) {
    this.io.to(`user:${userId}`).emit(event, data);
  }

  // Broadcast contract updates
  public notifyContractUpdate(contractId: string, clientId: string, doerId: string, data: any) {
    this.broadcastToUser(clientId, "contract:updated", { contractId, ...data });
    this.broadcastToUser(doerId, "contract:updated", { contractId, ...data });
  }

  /**
   * Lo que se le avisa a TODOS (el muro) de un trabajo que cambió.
   *
   * Antes se emitía el trabajo entero (`job.toJSON()`) a todos los conectados: la calle y el número de la casa, el teléfono y el email del cliente, y hasta
   * borradores, publicaciones sin pagar y listas de tareas. La web promete que «la dirección exacta solo se comparte con el trabajador asignado» y las lecturas
   * públicas (`GET /api/jobs`) ya lo cumplen con `privacidadTrabajo`: el aviso en vivo tiene que ser igual de reservado. Ahora sale el id y el estado, y el
   * trabajo mismo SÓLO si está abierto (es lo que muestra el muro) y sin dirección exacta ni contacto. El dueño y la administración reciben el completo por su
   * propio aviso (`job:updated`, `admin:job:*`).
   */
  private trabajoParaTodos(jobId: string | undefined, data: any): Record<string, unknown> {
    const job = data?.job;
    const resumen: Record<string, unknown> = { jobId: jobId ?? job?.id, action: data?.action, status: job?.status ?? data?.status };
    if (job && job.status === "open") {
      // Copia: el objeto original también se le manda al dueño y a administración, que sí ven la dirección.
      const copia = {
        ...job,
        client: job.client ? { ...job.client } : job.client,
        doer: job.doer ? { ...job.doer } : job.doer,
        selectedWorkersData: Array.isArray(job.selectedWorkersData) ? job.selectedWorkersData.map((u: any) => ({ ...u })) : job.selectedWorkersData,
      };
      resumen.job = paraQuienMira(copia);
    }
    return resumen;
  }

  // Broadcast job updates
  public notifyJobUpdate(jobId: string, clientId: string, data: any) {
    this.broadcastToUser(clientId, "job:updated", { jobId, ...data });
    // Broadcast to all users for job listings (sin datos reservados: ver trabajoParaTodos)
    this.io.emit("jobs:refresh", this.trabajoParaTodos(jobId, data));
  }

  // Broadcast proposal updates
  public notifyProposalUpdate(proposalId: string, freelancerId: string, clientId: string, data: any) {
    this.broadcastToUser(freelancerId, "proposal:updated", { proposalId, ...data });
    this.broadcastToUser(clientId, "proposal:updated", { proposalId, ...data });
    // Also refresh the job owner's jobs list
    this.broadcastToUser(clientId, "myjobs:refresh", { proposalId, ...data });
  }

  // Broadcast payment updates
  public notifyPaymentUpdate(paymentId: string, clientId: string, doerId: string, data: any) {
    this.broadcastToUser(clientId, "payment:updated", { paymentId, ...data });
    this.broadcastToUser(doerId, "payment:updated", { paymentId, ...data });
  }

  // Broadcast dashboard refresh
  public notifyDashboardRefresh(userId: string) {
    this.broadcastToUser(userId, "dashboard:refresh", {});
  }

  // Notify unread message count update
  public notifyUnreadMessagesUpdate(userId: string, unreadCount: number, unreadConversations?: number) {
    this.broadcastToUser(userId, "unread:updated", { unreadCount, unreadConversations: unreadConversations ?? 0 });
  }

  // ============================================
  // ADMIN REAL-TIME BROADCASTS
  // ============================================

  // Broadcast new job created (for admin panel)
  public notifyNewJob(job: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:job:created", { job, timestamp: new Date() });
    // Also notify job listings refresh
    this.io.emit("jobs:refresh", this.trabajoParaTodos(job?.id, { action: "created", job }));
  }

  // Broadcast job status changed
  public notifyJobStatusChanged(job: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:job:updated", { job, previousStatus, timestamp: new Date() });
    this.io.emit("jobs:refresh", this.trabajoParaTodos(job?.id, { action: "updated", job }));
  }

  // Broadcast job updated (general updates, not just status)
  public notifyAdminJobUpdated(job: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:job:updated", { job, timestamp: new Date() });
    this.io.emit("jobs:refresh", this.trabajoParaTodos(job?.id, { action: "updated", job }));
  }

  // Broadcast new proposal (for admin and job owner)
  public notifyNewProposal(proposal: any, jobOwnerId: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:proposal:created", { proposal, timestamp: new Date() });
    this.broadcastToUser(jobOwnerId, "proposal:new", { proposal });
    // Also refresh the job owner's jobs list
    this.broadcastToUser(jobOwnerId, "myjobs:refresh", { proposal });
  }

  // Broadcast new contract created
  public notifyNewContract(contract: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:contract:created", { contract, timestamp: new Date() });
  }

  // Broadcast contract status changed
  public notifyContractStatusChanged(contract: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:contract:updated", { contract, previousStatus, timestamp: new Date() });
  }

  // Broadcast new payment (for admin)
  public notifyNewPayment(payment: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:payment:created", { payment, timestamp: new Date() });
  }

  // Broadcast payment status changed
  public notifyPaymentStatusChanged(payment: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:payment:updated", { payment, previousStatus, timestamp: new Date() });
  }

  // Broadcast new user registered
  public notifyNewUser(user: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:user:created", {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt
      },
      timestamp: new Date()
    });
  }

  // Broadcast new dispute
  public notifyNewDispute(dispute: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:dispute:created", { dispute, timestamp: new Date() });
  }

  // Broadcast dispute status changed
  public notifyDisputeStatusChanged(dispute: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:dispute:updated", { dispute, previousStatus, timestamp: new Date() });
  }

  // Broadcast new ticket
  public notifyNewTicket(ticket: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:ticket:created", { ticket, timestamp: new Date() });
  }

  // ============================================
  // USER NOTIFICATION BROADCASTS
  // ============================================

  // Broadcast ticket status changed
  public notifyTicketStatusChanged(ticket: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:ticket:updated", { ticket, previousStatus, timestamp: new Date() });
  }

  // Broadcast new withdrawal request
  public notifyNewWithdrawal(withdrawal: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:withdrawal:created", { withdrawal, timestamp: new Date() });
  }

  // Broadcast withdrawal status changed
  public notifyWithdrawalStatusChanged(withdrawal: any, previousStatus: string) {
    this.io.to(SALA_DE_ADMINISTRACION).emit("admin:withdrawal:updated", { withdrawal, previousStatus, timestamp: new Date() });
  }

  // Generic admin notification
  public notifyAdminEvent(event: string, data: any) {
    this.io.to(SALA_DE_ADMINISTRACION).emit(`admin:${event}`, { ...data, timestamp: new Date() });
  }

  // Get IO instance for direct use in routes
  public getIO(): Server {
    return this.io;
  }
}

// Singleton instance for global access
let socketServiceInstance: SocketService | null = null;

export function setSocketServiceInstance(instance: SocketService) {
  socketServiceInstance = instance;
}

export function getIO(): Server | null {
  return socketServiceInstance?.getIO() || null;
}

export default SocketService;
