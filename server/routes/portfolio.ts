import { Router, Response } from "express";
import { conSistema } from "../db/contextoRls.js";
import { isValidUUID } from "../utils/sanitizer.js";
import { protect, AuthRequest } from "../middleware/auth";
import { Portfolio as PortfolioItem } from "../models/sql/Portfolio.model.js";
import { User } from "../models/sql/User.model.js";
import { Contract } from "../models/sql/Contract.model.js";
import { Job } from "../models/sql/Job.model.js";
import { body, validationResult } from "express-validator";
import { Op } from "sequelize";
import { uploadPortfolio, verifyMagicBytes } from "../middleware/upload.js";
import { opinionesDeMiTrabajo } from "../services/etiquetasDePublicaciones.js";

const router = Router();

/**
 * ¿El contrato y el trabajo que se quieren enlazar son de esta persona? Devuelve el motivo si no, o null si está bien (o si no se enlazó nada).
 * Un contrato es suyo si es el cliente o quien trabajó; un trabajo, si lo publicó o tiene un contrato en él.
 */
async function problemaConElEnlace(userId: string, linkedContract: unknown, linkedJob: unknown): Promise<string | null> {
  if (linkedContract !== undefined && linkedContract !== null && linkedContract !== '') {
    if (!isValidUUID(linkedContract)) return 'El contrato que querés enlazar no es válido.';
    const c: any = await conSistema(() => Contract.findByPk(String(linkedContract), { attributes: ['id', 'clientId', 'doerId'], paranoid: false }));
    if (!c || ![String(c.clientId), String(c.doerId)].includes(userId)) return 'Solo podés enlazar un contrato en el que participaste.';
  }
  if (linkedJob !== undefined && linkedJob !== null && linkedJob !== '') {
    if (!isValidUUID(linkedJob)) return 'El trabajo que querés enlazar no es válido.';
    const j: any = await conSistema(() => Job.findByPk(String(linkedJob), { attributes: ['id', 'clientId'], paranoid: false }));
    if (!j) return 'Solo podés enlazar un trabajo en el que participaste.';
    if (String(j.clientId) !== userId) {
      const participo = await conSistema(() => Contract.count({ where: { jobId: String(linkedJob), doerId: userId } }));
      if (!participo) return 'Solo podés enlazar un trabajo en el que participaste.';
    }
  }
  return null;
}

/**
 * Get user's portfolio items
 * GET /api/portfolio/user/:userId
 */
router.get("/user/:userId", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 12 } = req.query;

    const items = await PortfolioItem.findAll({
      where: { userId },
      order: [
        ['featured', 'DESC'],
        ['createdAt', 'DESC']
      ],
      limit: Number(limit),
      offset: (Number(page) - 1) * Number(limit),
    });

    const total = await PortfolioItem.count({ where: { userId } });

    res.json({
      success: true,
      data: items,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Get portfolio item by ID
 * GET /api/portfolio/:id
 */
router.get("/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const item = await PortfolioItem.findByPk(id, {
      include: [
        {
          model: User,
          as: 'user',
          attributes: ['id', 'name', 'avatar', 'rating', 'reviewsCount']
        },
        {
          // Solo lo mínimo: antes se devolvía el contrato ENTERO (precio, firmas, entregas, fotos, bitácora, notas, custodia) a cualquiera, sin sesión.
          model: Contract,
          as: 'contract',
          attributes: ['id', 'status']
        },
        {
          model: Job,
          as: 'job',
          attributes: ['id', 'title', 'summary']
        }
      ]
    });

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Increment views
    item.views += 1;
    await item.save();

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Create portfolio item
 * POST /api/portfolio
 */
router.post(
  "/",
  protect,
  [
    body("title").trim().notEmpty().withMessage("El título es requerido"),
    body("description").trim().notEmpty().withMessage("La descripción es requerida"),
    body("category").trim().notEmpty().withMessage("La categoría es requerida"),
    body("images").optional().isArray(),
  ],
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: errors.array().map((e: any) => String(e.msg)).filter((v, i, a) => v && a.indexOf(v) === i).join('. ') || 'Datos inválidos',
          errors: errors.array(),
        });
        return;
      }

      const userId = req.user.id;
      const {
        title,
        description,
        category,
        price,
        images,
        videos,
        documents,
        tags,
        completedAt,
        clientName,
        projectDuration,
        featured,
        linkedContract,
        linkedJob,
        incluirPuntuaciones
      } = req.body;

      // La puntuación que se dejó al terminar el trabajo: la arma el servidor desde las reseñas reales (quien publica solo elige cuáles mostrar y si lleva el comentario).
      let contractRatings: Array<{ contractId: string; workerId: string; name: string; role: 'doer' | 'client'; rating: number; comment?: string }> = [];
      if (linkedJob && Array.isArray(incluirPuntuaciones) && incluirPuntuaciones.length > 0) {
        const mias = await opinionesDeMiTrabajo(String(userId), String(linkedJob));
        for (const pedido of incluirPuntuaciones.slice(0, 10)) {
          const opinion = mias.find((o) => o.contractId === String(pedido?.contractId));
          if (!opinion || pedido?.puntaje === false) continue;
          contractRatings.push({
            contractId: opinion.contractId,
            workerId: opinion.workerId,
            name: opinion.name,
            role: opinion.role,
            rating: opinion.rating,
            ...(pedido?.comentario === true && opinion.comment.trim() ? { comment: opinion.comment.trim().slice(0, 500) } : {}),
          });
        }
      }

      // Verificar que el trabajo no esté ya en otro portfolio
      if (linkedJob) {
        // Solo cuenta lo que PUBLICÓ esta misma persona: que otro participante haya compartido el trabajo no le impide compartirlo a ella (la etiquetaron, no lo publicó).
        const existingPortfolio = await PortfolioItem.findOne({
          where: { linkedJob, userId }
        });

        if (existingPortfolio) {
          res.status(400).json({
            success: false,
            message: "Este trabajo ya fue agregado al portafolio. Elimina el item existente para volver a publicarlo.",
          });
          return;
        }
      }

      // El contrato y el trabajo que se enlazan tienen que ser de quien publica (antes se aceptaba cualquier id y el detalle público mostraba ese contrato).
      const noEsSuyo = await problemaConElEnlace(String(userId), linkedContract, linkedJob);
      if (noEsSuyo) {
        res.status(403).json({ success: false, message: noEsSuyo });
        return;
      }

      const item = await PortfolioItem.create({
        userId,
        title,
        description,
        category,
        price,
        images,
        videos: videos || [],
        documents: documents || [],
        tags: tags || [],
        completedAt,
        clientName,
        projectDuration,
        featured: featured || false,
        linkedContract,
        linkedJob,
        contractRatings,
        // El puntaje general del trabajo: el promedio de lo que se dejó (los números sueltos van en `contractRatings`).
        contractRating: contractRatings.length > 0 ? Math.round((contractRatings.reduce((s, r) => s + r.rating, 0) / contractRatings.length) * 100) / 100 : undefined,
      } as any);

      res.status(201).json({
        success: true,
        data: item,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error del servidor",
      });
    }
  }
);

/**
 * Fotos del trabajo compartido: se suman a las del item (hasta 10). Antes la pantalla las mandaba acá y la ruta no existía: la foto adjuntada nunca se guardaba.
 * POST /api/portfolio/:id/images  (archivos en el campo «images»)
 */
router.post(
  "/:id/images",
  protect,
  uploadPortfolio,
  verifyMagicBytes,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const item = await PortfolioItem.findByPk(req.params.id);
      if (!item) {
        res.status(404).json({ success: false, message: "Item no encontrado" });
        return;
      }
      if (String(item.userId) !== String(req.user.id)) {
        res.status(403).json({ success: false, message: "No autorizado" });
        return;
      }
      const archivos = (req.files as Express.Multer.File[]) || [];
      if (archivos.length === 0) {
        res.status(400).json({ success: false, message: "No se recibió ninguna imagen" });
        return;
      }
      const actuales = Array.isArray(item.images) ? item.images : [];
      if (actuales.length + archivos.length > 10) {
        res.status(400).json({ success: false, message: "Un item puede tener hasta 10 imágenes" });
        return;
      }
      item.images = [...actuales, ...archivos.map((a) => `/uploads/portfolio/${a.filename}`)];
      await item.save();
      res.json({ success: true, data: item });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message || "Error del servidor" });
    }
  }
);

/**
 * Update portfolio item
 * PUT /api/portfolio/:id
 */
router.put("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para editar este elemento",
      });
      return;
    }

    const {
      title,
      description,
      category,
      price,
      images,
      videos,
      documents,
      tags,
      completedAt,
      clientName,
      projectDuration,
      featured,
      linkedContract,
      linkedJob
    } = req.body;

    // Verificar que el trabajo no esté ya en otro portfolio (excluyendo el item actual)
    if (linkedJob !== undefined && linkedJob !== item.linkedJob) {
      const existingPortfolio = await PortfolioItem.findOne({
        where: {
          linkedJob,
          userId,
          id: { [Op.ne]: id }
        }
      });

      if (existingPortfolio) {
        res.status(400).json({
          success: false,
          message: "Este trabajo ya fue agregado a otro item del portafolio.",
        });
        return;
      }
    }

    // Mismo control que al crear: no se puede enlazar el contrato o el trabajo de otra persona.
    if (linkedContract !== undefined || linkedJob !== undefined) {
      const noEsSuyo = await problemaConElEnlace(String(userId), linkedContract, linkedJob);
      if (noEsSuyo) {
        res.status(403).json({ success: false, message: noEsSuyo });
        return;
      }
    }

    if (title) item.title = title;
    if (description) item.description = description;
    if (category) item.category = category;
    if (price !== undefined) item.price = price;
    if (images) item.images = images;
    if (videos !== undefined) item.videos = videos;
    if (documents !== undefined) item.documents = documents;
    if (tags !== undefined) item.tags = tags;
    if (completedAt !== undefined) item.completedAt = completedAt;
    if (clientName !== undefined) item.clientName = clientName;
    if (projectDuration !== undefined) item.projectDuration = projectDuration;
    if (featured !== undefined) item.featured = featured;
    if (linkedContract !== undefined) item.linkedContract = linkedContract;
    if (linkedJob !== undefined) item.linkedJob = linkedJob;

    await item.save();

    res.json({
      success: true,
      data: item,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Delete portfolio item
 * DELETE /api/portfolio/:id
 */
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    // Verify ownership
    if (item.userId !== userId) {
      res.status(403).json({
        success: false,
        message: "No tienes permiso para eliminar este elemento",
      });
      return;
    }

    await item.destroy();

    res.json({
      success: true,
      message: "Elemento de portafolio eliminado",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

/**
 * Like/Unlike portfolio item
 * POST /api/portfolio/:id/like
 */
router.post("/:id/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const item = await PortfolioItem.findByPk(id);

    if (!item) {
      res.status(404).json({
        success: false,
        message: "Elemento de portafolio no encontrado",
      });
      return;
    }

    const likeIndex = item.likes.findIndex((like) => like === userId);

    if (likeIndex > -1) {
      // Unlike
      item.likes = item.likes.filter((like) => like !== userId);
    } else {
      // Like
      item.likes = [...item.likes, userId];
    }

    await item.save();

    res.json({
      success: true,
      data: {
        likes: item.likes.length,
        isLiked: likeIndex === -1,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error del servidor",
    });
  }
});

export default router;
