import express, { Request, Response } from "express";
import { Post } from "../models/sql/Post.model.js";
import { PostComment } from "../models/sql/PostComment.model.js";
import { protect, optionalAuth } from "../middleware/auth.js";
import { isValidUUID } from "../utils/sanitizer.js";
import { uploadPostGallery, verifyMagicBytes } from "../middleware/upload.js";
import { sanitizeHTML, sanitizePlainText } from "../utils/sanitizer.js";
import type { AuthRequest } from "../middleware/auth.js";
import { leerIds, resolverEtiquetas, presentarEtiquetados, avisarEtiquetas, candidatosDeEtiqueta, trabajosParaEtiquetar, opinionesDeMiTrabajo, puntuacionesElegidas, trabajosYaCompartidos } from "../services/etiquetasDePublicaciones.js";
import { Contract } from "../models/sql/Contract.model.js";
import { conSistema } from "../db/contextoRls.js";
import { borrarCopiasDeFotos, bloquearPorElEquipo } from "../services/antesYDespues.js";
import { logAudit } from "../utils/auditLog.js";
import { Notification } from "../models/sql/Notification.model.js";
import { limpiarEtiquetas } from "../../shared/etiquetas.js";

const router = express.Router();

/** Quiénes del equipo pueden retirar una publicación ajena. */
const ROLES_QUE_RETIRAN_PUBLICACIONES = ["owner", "super_admin", "admin", "support"];

// @route   GET /api/posts
// @desc    Get all published posts with pagination
// @access  Public
router.get("/", async (req: Request, res: Response): Promise<void> => {
  try {
    // Límites (auditoría 2026-11-24): antes `?limit=1000000` bajaba todo y `?page=0` daba un OFFSET negativo (500).
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 10));
    const skip = (page - 1) * limit;
    const type = typeof req.query.type === 'string' ? req.query.type : undefined; // 'post' or 'article'
    const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

    // Un id que no es un id válido no encuentra nada (antes llegaba a la base y volvía como un 500 con el texto del error).
    if (userId && !isValidUUID(userId)) {
      res.json({ success: true, posts: [], pagination: { page, limit, total: 0, pages: 0 } });
      return;
    }
    if (type && !['post', 'article'].includes(type)) {
      res.json({ success: true, posts: [], pagination: { page, limit, total: 0, pages: 0 } });
      return;
    }

    const filter: any = { isPublished: true };
    if (type) filter.type = type;
    if (userId) filter.author = userId;

    const posts = await Post.findAll({
      where: filter,
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limit,
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    const total = await Post.count({ where: filter });

    // Transform posts to match frontend expectations
    const transformedPosts = posts.map(post => {
      const postData = post.toJSON() as any;
      return {
        ...postData,
        author: postData.authorUser ? {
          id: postData.authorUser.id,
          name: postData.authorUser.name,
          avatar: postData.authorUser.avatar,
          membershipTier: postData.authorUser.membershipTier,
          hasMembership: postData.authorUser.hasMembership,
          isPremiumVerified: postData.authorUser.isPremiumVerified,
        } : null,
      };
    });

    res.json({
      success: true,
      posts: await presentarEtiquetados(transformedPosts),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener publicaciones",
    });
  }
});

// @route   GET /api/posts/mis-compartidos?jobIds=a,b
// @desc    Qué trabajos ya compartí y en qué publicación (antes de ofrecer compartir)
// @access  Private
router.get("/mis-compartidos", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const pedidos = typeof req.query.jobIds === "string" && req.query.jobIds ? leerIds(req.query.jobIds.split(",").join(",")) : undefined;
    res.json({ success: true, compartidos: await trabajosYaCompartidos(String(req.user.id), pedidos) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "No pudimos revisar lo que ya compartiste" });
  }
});

// @route   GET /api/posts/:id
// @desc    Get single post by ID
// @access  Public
router.get("/:id", optionalAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!isValidUUID(req.params.id)) {
      res.status(404).json({ success: false, message: "Publicación no encontrada" });
      return;
    }
    // Sin incluir el contrato: la ruta es pública y mostraba el estado y el precio de cualquier contrato al que apuntara la publicación (auditoría 2026-11-24).
    const post = await Post.findByPk(req.params.id, {
      include: [
        {
          association: 'authorUser',
          attributes: ['id', 'name', 'avatar', 'bio', 'membershipTier', 'hasMembership', 'isPremiumVerified', 'rating', 'completedJobs'],
        },
      ],
    });

    // Una publicación sin publicar solo la ve quien la escribió (el listado ya filtraba por isPublished; el detalle no).
    if (!post || (!post.isPublished && String(post.author) !== String(req.user?.id ?? ''))) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    // Contador de vistas: una suma en la base (antes se leía, se sumaba y se guardaba la publicación entera: con visitas simultáneas se perdían vistas).
    await Post.increment('viewsCount', { by: 1, where: { id: post.id } });
    post.viewsCount += 1;

    // Transform to match frontend expectations
    const postData = post.toJSON() as any;
    const transformedPost = {
      ...postData,
      author: postData.authorUser ? {
        id: postData.authorUser.id,
        name: postData.authorUser.name,
        avatar: postData.authorUser.avatar,
        bio: postData.authorUser.bio,
        membershipTier: postData.authorUser.membershipTier,
        hasMembership: postData.authorUser.hasMembership,
        isPremiumVerified: postData.authorUser.isPremiumVerified,
        rating: postData.authorUser.rating,
        completedJobs: postData.authorUser.completedJobs,
      } : null,
    };

    res.json({
      success: true,
      post: (await presentarEtiquetados([transformedPost]))[0],
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener publicación",
    });
  }
});

// @route   POST /api/posts
// @desc    Create a new post
// @access  Private
router.post(
  "/",
  protect,
  uploadPostGallery,
  verifyMagicBytes,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { title, description, price, currency, type, tags, captions, linkedJob, taggedUsers, incluirPuntuaciones } = req.body;

      // Un trabajo se comparte una sola vez por persona: si ya está, se contesta dónde está (la pantalla lleva ahí).
      if (linkedJob) {
        const yaCompartidos = await trabajosYaCompartidos(String(req.user.id), [String(linkedJob)]);
        if (yaCompartidos[String(linkedJob)]) {
          res.status(409).json({ success: false, code: "YA_COMPARTIDO", postId: yaCompartidos[String(linkedJob)], message: "Ya habías compartido este trabajo." });
          return;
        }
      }

      // Un trabajo terminado que se comparte: se comprueba que quien publica haya participado y se arma a quién se etiqueta (solo a quien trabajó y lo permite).
      let contratoDelTrabajo: string | undefined;
      let etiquetados: string[] = [];
      let noPermiten: string[] = [];
      const pedidos = leerIds(taggedUsers);
      if (linkedJob) {
        const r = await resolverEtiquetas(String(req.user.id), String(linkedJob), pedidos);
        if (!r.ok) {
          const falla = r as { estado: number; mensaje: string };
          res.status(falla.estado).json({ success: false, message: falla.mensaje });
          return;
        }
        contratoDelTrabajo = r.contratoId;
        etiquetados = r.etiquetados;
        noPermiten = r.noPermiten;
      } else if (pedidos.length > 0) {
        res.status(400).json({ success: false, message: 'Solo se puede etiquetar en la publicación de un trabajo.' });
        return;
      }

      // Parse captions if provided
      const captionsArray = captions ? JSON.parse(captions) : [];

      // Process uploaded files with captions
      const gallery = (req.files as Express.Multer.File[])?.map((file, index) => {
        const isVideo = file.mimetype.startsWith("video/");
        return {
          url: `/uploads/post-media/${file.filename}`,
          type: isVideo ? "video" : "image",
          thumbnail: isVideo ? `/uploads/post-media/${file.filename}` : undefined,
          caption: captionsArray[index] || undefined,
        };
      }) || [];

      // Parse tags - handle both JSON string and array formats
      let parsedTags: string[] = [];
      if (tags) {
        if (Array.isArray(tags)) {
          parsedTags = tags;
        } else if (typeof tags === 'string') {
          try {
            parsedTags = JSON.parse(tags);
          } catch {
            // If it's not valid JSON, split by comma
            parsedTags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        }
      }

      // Sin «#» ni repetidas: así se encuentran y se relacionan entre sí.
      parsedTags = limpiarEtiquetas(parsedTags);

      const post = await Post.create({
        author: req.user.id,
        title: sanitizePlainText(title || ''),
        description: sanitizeHTML(description || ''),
        gallery,
        price: price ? parseFloat(price) : undefined,
        currency: currency || "ARS",
        type: type || "post",
        tags: parsedTags,
        // Solo el contrato que el servidor comprueba (el de quien participó en ese trabajo): antes se aceptaba cualquiera que mandara el cuerpo.
        linkedContract: contratoDelTrabajo || undefined,
        taggedUsers: etiquetados,
        contractRatings: linkedJob && contratoDelTrabajo ? await puntuacionesElegidas(String(req.user.id), String(linkedJob), incluirPuntuaciones) : [],
      });
      if (etiquetados.length > 0) {
        await avisarEtiquetas(post.id, post.title, (req.user as any).name || 'Alguien', etiquetados);
      }

      const populatedPost = await Post.findByPk(post.id, {
        include: [{
          association: 'authorUser',
          attributes: ['name', 'avatar', 'membershipTier', 'hasMembership'],
        }],
      });

      res.status(201).json({
        success: true,
        message: "Publicación creada exitosamente",
        post: populatedPost,
        // Quién no quedó etiquetado porque apagó la opción en su configuración (para decírselo a quien publica).
        noEtiquetados: noPermiten.length,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al crear publicación",
      });
    }
  }
);

/**
 * Etiquetar DESPUÉS de publicar (pedido del dueño, 2026-11-23: «poder etiquetar a participantes a pesar de ya haberse publicado sin etiquetas»).
 * GET /api/posts/:id/etiquetables[?jobId=]  → a quién se puede etiquetar (y si cada uno lo permite); una publicación sin trabajo vinculado ofrece elegir el trabajo.
 * PUT /api/posts/:id/etiquetas  { taggedUsers, linkedJob? }  → deja la lista de etiquetados (solo quien publicó).
 */
/** GET /api/posts/job/:jobId/participantes — a quién se puede etiquetar al compartir ese trabajo (y el contrato de quien comparte, para traer su opinión del final del trabajo). */
router.get("/job/:jobId/participantes", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const r = await candidatosDeEtiqueta(String(req.user.id), String(req.params.jobId));
    if (!r.ok) { const falla = r as { estado: number; mensaje: string }; res.status(falla.estado).json({ success: false, message: falla.mensaje }); return; }
    res.json({ success: true, contratoId: r.contratoId, personas: r.personas });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error al buscar a los participantes" });
  }
});

/** GET /api/posts/job/:jobId/mis-opiniones — la puntuación que dejé a cada persona al terminar el trabajo (para copiarla al portafolio). */
router.get("/job/:jobId/mis-opiniones", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    res.json({ success: true, opiniones: await opinionesDeMiTrabajo(String(req.user.id), String(req.params.jobId)) });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error al buscar las opiniones" });
  }
});

router.get("/:id/etiquetables", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) { res.status(404).json({ success: false, message: "Publicación no encontrada" }); return; }
    if (String(post.author) !== String(req.user.id)) { res.status(403).json({ success: false, message: "Solo quien publicó puede etiquetar." }); return; }

    let trabajoId = typeof req.query.jobId === "string" ? req.query.jobId : "";
    if (!trabajoId && post.linkedContract) {
      const c = await conSistema(() => Contract.findByPk(post.linkedContract as string, { attributes: ["id", "jobId"] }));
      trabajoId = c ? String(c.jobId) : "";
    }
    if (!trabajoId) {
      res.json({ success: true, vinculado: false, trabajos: await trabajosParaEtiquetar(String(req.user.id)), personas: [], etiquetados: post.taggedUsers || [] });
      return;
    }
    const r = await candidatosDeEtiqueta(String(req.user.id), trabajoId);
    if (!r.ok) { const falla = r as { estado: number; mensaje: string }; res.status(falla.estado).json({ success: false, message: falla.mensaje }); return; }
    res.json({ success: true, vinculado: true, trabajoId, personas: r.personas, etiquetados: post.taggedUsers || [] });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error al buscar a quién etiquetar" });
  }
});

router.put("/:id/etiquetas", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);
    if (!post) { res.status(404).json({ success: false, message: "Publicación no encontrada" }); return; }
    if (String(post.author) !== String(req.user.id)) { res.status(403).json({ success: false, message: "Solo quien publicó puede etiquetar." }); return; }

    let trabajoId = req.body?.linkedJob ? String(req.body.linkedJob) : "";
    if (post.linkedContract) {
      const c = await conSistema(() => Contract.findByPk(post.linkedContract as string, { attributes: ["id", "jobId"] }));
      trabajoId = c ? String(c.jobId) : trabajoId;
    }
    if (!trabajoId) { res.status(400).json({ success: false, message: "Elegí de qué trabajo es la publicación." }); return; }

    const pedidos = leerIds(req.body?.taggedUsers);
    const r = await resolverEtiquetas(String(req.user.id), trabajoId, pedidos);
    if (!r.ok) { const falla = r as { estado: number; mensaje: string }; res.status(falla.estado).json({ success: false, message: falla.mensaje }); return; }

    const antes = new Set((post.taggedUsers || []).map(String));
    // Quien ya estaba etiquetado y sigue elegido se queda; lo nuevo solo entra si la persona lo permite.
    const quedan = Array.from(new Set([...pedidos.filter((id) => antes.has(id) && !r.ajenos.includes(id)), ...r.etiquetados]));
    post.taggedUsers = quedan;
    post.changed("taggedUsers", true);
    if (!post.linkedContract && r.contratoId) post.linkedContract = r.contratoId;
    await post.save();

    const nuevos = quedan.filter((id) => !antes.has(id));
    if (nuevos.length > 0) await avisarEtiquetas(post.id, post.title, (req.user as any).name || "Alguien", nuevos);

    res.json({ success: true, etiquetados: quedan, noEtiquetados: r.noPermiten.filter((id) => !antes.has(id)).length });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message || "Error al etiquetar" });
  }
});

// @route   PUT /api/posts/:id
// @desc    Update a post
// @access  Private (author only)
router.put(
  "/:id",
  protect,
  uploadPostGallery,
  verifyMagicBytes,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const post = await Post.findByPk(req.params.id);

      if (!post) {
        res.status(404).json({
          success: false,
          message: "Publicación no encontrada",
        });
        return;
      }

      // Check if user is the author
      if (post.author !== req.user.id) {
        res.status(403).json({
          success: false,
          message: "No autorizado para editar esta publicación",
        });
        return;
      }

      // La publicación de un trabajo copia lo que pasó en el trabajo (regla del dueño, 2026-11-24): editarla sería modificar el trabajo.
      // Se puede quitar del muro y volver a agregar; las etiquetas tienen su propia ruta (`PUT /:id/etiquetas`).
      if (post.linkedContract) {
        res.status(409).json({
          success: false,
          code: "PUBLICACION_DE_TRABAJO_NO_SE_EDITA",
          message: "La publicación de un trabajo no se edita: muestra lo que pasó en el trabajo. Podés quitarla de tu muro y volver a agregarla.",
        });
        return;
      }

      const { title, description, price, currency, type, tags, isPublished } = req.body;

      // Update fields (sanitized: title -> plain text, description -> safe HTML)
      if (title) post.title = sanitizePlainText(title);
      if (description) post.description = sanitizeHTML(description);
      if (price !== undefined) post.price = parseFloat(price);
      if (currency) post.currency = currency;
      if (type) post.type = type;
      if (tags) {
        if (Array.isArray(tags)) {
          post.tags = tags;
        } else if (typeof tags === 'string') {
          try {
            post.tags = JSON.parse(tags);
          } catch {
            post.tags = tags.split(',').map((t: string) => t.trim()).filter(Boolean);
          }
        }
      }
      if (isPublished !== undefined) post.isPublished = isPublished;

      // Add new gallery items if uploaded
      if (req.files && (req.files as Express.Multer.File[]).length > 0) {
        const newGallery = (req.files as Express.Multer.File[]).map((file) => {
          const isVideo = file.mimetype.startsWith("video/");
          return {
            url: `/uploads/post-media/${file.filename}`,
            type: (isVideo ? "video" : "image") as "video" | "image",
            thumbnail: isVideo ? `/uploads/post-media/${file.filename}` : undefined,
          };
        });
        post.gallery = [...post.gallery, ...newGallery];
      }

      await post.save();

      const populatedPost = await Post.findByPk(post.id, {
        include: [{
          association: 'authorUser',
          attributes: ['name', 'avatar', 'membershipTier', 'hasMembership'],
        }],
      });

      res.json({
        success: true,
        message: "Publicación actualizada exitosamente",
        post: populatedPost,
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || "Error al actualizar publicación",
      });
    }
  }
);

// @route   DELETE /api/posts/:id
// @desc    Delete a post
// @access  Private (su autor; o el equipo, con la clave de panel y un motivo)
router.delete("/:id", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    const esSuya = post.author === req.user.id;
    // El equipo retira una publicación ajena (por ejemplo, fotos con personas o datos personales): deja el motivo y se avisa a quien publicó.
    const delEquipo = !esSuya && ROLES_QUE_RETIRAN_PUBLICACIONES.includes(String(req.user.adminRole || ""));
    if (!esSuya && !delEquipo) {
      res.status(403).json({
        success: false,
        message: "No autorizado para eliminar esta publicación",
      });
      return;
    }
    const motivo = sanitizePlainText(String(req.body?.motivo || "")).trim().slice(0, 500);
    if (delEquipo && motivo.length < 10) {
      res.status(400).json({ success: false, code: "FALTA_EL_MOTIVO", message: "Escribí por qué se retira (al menos 10 letras)." });
      return;
    }

    // Los comentarios y la publicación se borran juntos: si falla uno, no se borra nada.
    await Post.sequelize!.transaction(async (transaction) => {
      await PostComment.destroy({ where: { post: post.id }, transaction });
      await post.destroy({ transaction });
    });
    // Las copias públicas de un antes y después se borran con la publicación (T&C 6.8).
    await borrarCopiasDeFotos(post);

    if (delEquipo) {
      await bloquearPorElEquipo(post.id, String(req.user.id));
      await logAudit({
        req, action: "post.removed_by_staff", category: "user", severity: "medium",
        description: "El equipo retiró una publicación del perfil de una persona",
        targetModel: "Post", targetId: String(post.id),
        metadata: { autor: post.author, titulo: post.title, motivo, contrato: post.linkedContract || null },
      });
      await Notification.create({
        recipientId: post.author, type: "warning", category: "system", title: "Retiramos una publicación de tu perfil",
        message: `«${String(post.title).slice(0, 80)}»: ${motivo}`, actionUrl: "/help", sentVia: ["in_app"],
      } as any);
    }

    res.json({
      success: true,
      message: "Publicación eliminada exitosamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar publicación",
    });
  }
});

// @route   POST /api/posts/:id/like
// @desc    Toggle like on a post
// @access  Private
router.post("/:id/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    const userId = req.user.id;
    const likeIndex = post.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      post.likesCount = Math.max(0, post.likesCount - 1);
    } else {
      // Like
      post.likes.push(userId);
      post.likesCount += 1;
    }

    await post.save();

    res.json({
      success: true,
      liked: likeIndex === -1,
      likesCount: post.likesCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al dar like",
    });
  }
});

// @route   GET /api/posts/:id/comments
// @desc    Get comments for a post
// @access  Public
router.get("/:id/comments", async (req: Request, res: Response): Promise<void> => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const skip = (page - 1) * limit;

    const comments = await PostComment.findAll({
      where: {
        post: req.params.id,
        parentComment: null,
      },
      order: [['createdAt', 'DESC']],
      offset: skip,
      limit: limit,
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'username', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    const total = await PostComment.count({
      where: {
        post: req.params.id,
        parentComment: null,
      },
    });

    // Transform comments to match frontend expectations
    const transformedComments = comments.map(comment => {
      const commentData = comment.toJSON() as any;
      return {
        ...commentData,
        author: commentData.authorUser ? {
          name: commentData.authorUser.name,
          username: commentData.authorUser.username,
          avatar: commentData.authorUser.avatar,
          membershipTier: commentData.authorUser.membershipTier,
          hasMembership: commentData.authorUser.hasMembership,
          isPremiumVerified: commentData.authorUser.isPremiumVerified,
        } : null,
      };
    });

    res.json({
      success: true,
      comments: transformedComments,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al obtener comentarios",
    });
  }
});

// @route   POST /api/posts/:id/comments
// @desc    Add a comment to a post
// @access  Private
router.post("/:id/comments", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { content, parentComment } = req.body;

    const post = await Post.findByPk(req.params.id);

    if (!post) {
      res.status(404).json({
        success: false,
        message: "Publicación no encontrada",
      });
      return;
    }

    const comment = await PostComment.create({
      post: post.id,
      author: req.user.id,
      content,
      parentComment: parentComment || undefined,
    });

    // Update post comments count
    post.commentsCount += 1;
    await post.save();

    const populatedComment = await PostComment.findByPk(comment.id, {
      include: [{
        association: 'authorUser',
        attributes: ['id', 'name', 'username', 'avatar', 'membershipTier', 'hasMembership', 'isPremiumVerified'],
      }],
    });

    // Transform to match frontend expectations
    const commentData = populatedComment?.toJSON() as any;
    const transformedComment = commentData ? {
      ...commentData,
      author: commentData.authorUser ? {
        name: commentData.authorUser.name,
        username: commentData.authorUser.username,
        avatar: commentData.authorUser.avatar,
        membershipTier: commentData.authorUser.membershipTier,
        hasMembership: commentData.authorUser.hasMembership,
        isPremiumVerified: commentData.authorUser.isPremiumVerified,
      } : null,
    } : null;

    res.status(201).json({
      success: true,
      message: "Comentario agregado exitosamente",
      comment: transformedComment,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al agregar comentario",
    });
  }
});

// @route   DELETE /api/posts/:postId/comments/:commentId
// @desc    Delete a comment
// @access  Private (author only)
router.delete("/:postId/comments/:commentId", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await PostComment.findByPk(req.params.commentId);

    if (!comment) {
      res.status(404).json({
        success: false,
        message: "Comentario no encontrado",
      });
      return;
    }

    // Check if user is the author
    if (comment.author !== req.user.id) {
      res.status(403).json({
        success: false,
        message: "No autorizado para eliminar este comentario",
      });
      return;
    }

    await comment.destroy();

    // Update post comments count
    const post = await Post.findByPk(req.params.postId);
    if (post) {
      post.commentsCount = Math.max(0, post.commentsCount - 1);
      await post.save();
    }

    res.json({
      success: true,
      message: "Comentario eliminado exitosamente",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al eliminar comentario",
    });
  }
});

// @route   POST /api/posts/:postId/comments/:commentId/like
// @desc    Toggle like on a comment
// @access  Private
router.post("/:postId/comments/:commentId/like", protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const comment = await PostComment.findByPk(req.params.commentId);

    if (!comment) {
      res.status(404).json({
        success: false,
        message: "Comentario no encontrado",
      });
      return;
    }

    const userId = req.user.id;
    const likeIndex = comment.likes.indexOf(userId);

    if (likeIndex > -1) {
      // Unlike
      comment.likes.splice(likeIndex, 1);
      comment.likesCount = Math.max(0, comment.likesCount - 1);
    } else {
      // Like
      comment.likes.push(userId);
      comment.likesCount += 1;
    }

    await comment.save();

    res.json({
      success: true,
      liked: likeIndex === -1,
      likesCount: comment.likesCount,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Error al dar like al comentario",
    });
  }
});

export default router;
