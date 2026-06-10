import { Router, Response, Request } from 'express';
import { protect, AuthRequest } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/profile/:userId/showcase
 *
 * Unified showcase endpoint: devuelve Portfolio + Blog + Posts como un mismo stream.
 * Esto permite que el frontend renderice TODO junto sin múltiples requests.
 *
 * VENTAJA: Un solo endpoint, cached en CDN, ordenado por fecha.
 */
router.get('/:userId/showcase', async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId } = req.params;
    const { Portfolio } = await import('../models/sql/Portfolio.model.js');
    const { BlogPost } = await import('../models/sql/BlogPost.model.js');
    const { Post } = await import('../models/sql/Post.model.js');

    // Fetch en paralelo
    const [portfolioItems, blogPosts, posts] = await Promise.all([
      Portfolio.findAll({
        where: { userId },
        attributes: ['id', 'title', 'description', 'imageUrl', 'link', 'createdAt'],
        limit: 50,
      }),
      BlogPost.findAll({
        where: { userId, published: true },
        attributes: ['id', 'title', 'subtitle', 'coverImage', 'slug', 'createdAt'],
        limit: 20,
      }),
      Post.findAll({
        where: { userId },
        attributes: ['id', 'content', 'likes', 'createdAt'],
        limit: 100,
      }),
    ]);

    // Unified format
    const showcase = [
      ...portfolioItems.map((p: any) => ({
        id: p.id,
        type: 'portfolio',
        title: p.title,
        description: p.description,
        image: p.imageUrl,
        link: p.link,
        date: p.createdAt,
      })),
      ...blogPosts.map((b: any) => ({
        id: b.id,
        type: 'blog',
        title: b.title,
        subtitle: b.subtitle,
        image: b.coverImage,
        slug: b.slug,
        date: b.createdAt,
      })),
      ...posts.map((p: any) => ({
        id: p.id,
        type: 'post',
        content: p.content,
        likes: p.likes,
        date: p.createdAt,
      })),
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    res.json({
      success: true,
      userId,
      showcase,
      counts: {
        portfolio: portfolioItems.length,
        blog: blogPosts.length,
        posts: posts.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
