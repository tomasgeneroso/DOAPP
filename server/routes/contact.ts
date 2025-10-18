import express, { Request, Response } from 'express';
import { body, validationResult } from 'express-validator';
import ContactMessage from '../models/ContactMessage.js';
import { protect } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/auth.js';
import sanitizer from '../utils/sanitizer.js';
import cache from '../services/cache.js';

const router = express.Router();

// Validation middleware
const contactValidation = [
  body('name').trim().notEmpty().isLength({ max: 100 }),
  body('email').trim().notEmpty().isEmail(),
  body('subject').isIn(['support', 'advertising', 'general', 'complaint', 'other']),
  body('message').trim().notEmpty().isLength({ min: 10, max: 2000 }),
  body('adType').optional().isIn(['model1', 'model2', 'model3', 'custom']),
  body('customAdDetails').optional().trim().isLength({ max: 500 }),
];

/**
 * POST /api/contact
 * Submit contact form (public or authenticated)
 */
router.post(
  '/',
  contactValidation,
  async (req: Request, res: Response) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      // Sanitize inputs
      const sanitizedData = {
        name: sanitizer.sanitizeInput(req.body.name),
        email: sanitizer.sanitizeInput(req.body.email),
        subject: req.body.subject,
        message: sanitizer.sanitizeInput(req.body.message),
        adType: req.body.adType,
        customAdDetails: req.body.customAdDetails
          ? sanitizer.sanitizeInput(req.body.customAdDetails)
          : undefined,
      };

      // Get user if authenticated
      let userId = undefined;
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer')) {
        // User is authenticated, extract from token if needed
        // For now, we'll handle this in a separate middleware if needed
      }

      // Get IP and user agent
      const ipAddress =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      // Create contact message
      const contactMessage = new ContactMessage({
        ...sanitizedData,
        user: userId,
        ipAddress,
        userAgent,
      });

      await contactMessage.save();

      // TODO: Send email notification to admin
      // TODO: Send confirmation email to user

      res.status(201).json({
        success: true,
        message:
          'Mensaje enviado correctamente. Nos pondremos en contacto contigo pronto.',
        data: {
          id: contactMessage._id,
          subject: contactMessage.subject,
        },
      });
    } catch (error) {
      console.error('Error submitting contact form:', error);
      res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

/**
 * GET /api/contact/my-messages
 * Get user's contact messages (authenticated)
 */
router.get('/my-messages', protect, async (req: AuthRequest, res: Response) => {
  try {
    const messages = await ContactMessage.find({
      $or: [{ user: req.user!.id }, { email: req.user!.email }],
    })
      .sort({ createdAt: -1 })
      .select('-ipAddress -userAgent');

    res.json({
      success: true,
      data: messages,
    });
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

/**
 * GET /api/contact/:id
 * Get contact message by ID (authenticated, own message only)
 */
router.get('/:id', protect, async (req: AuthRequest, res: Response) => {
  try {
    const message = await ContactMessage.findOne({
      _id: req.params.id,
      $or: [{ user: req.user!.id }, { email: req.user!.email }],
    })
      .populate('respondedBy', 'name email')
      .select('-ipAddress -userAgent');

    if (!message) {
      return res
        .status(404)
        .json({ success: false, message: 'Message not found' });
    }

    res.json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

export default router;
