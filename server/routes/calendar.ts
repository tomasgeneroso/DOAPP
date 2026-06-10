import express, { Response } from 'express';
import { protect } from '../middleware/auth.js';
import type { AuthRequest } from '../types/index.js';
import calendarService from '../services/calendarService.js';

const router = express.Router();

/**
 * GET /api/calendar/google/auth-url
 * Obtener URL para conectar Google Calendar
 */
router.get(
  '/google/auth-url',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const authUrl = calendarService.getGoogleCalendarAuthUrl();
      res.json({
        success: true,
        authUrl: authUrl.url,
        scope: authUrl.scope
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error fetching auth URL'
      });
    }
  }
);

/**
 * POST /api/calendar/google/save-tokens
 * Guardar tokens de Google Calendar después de OAuth
 */
router.post(
  '/google/save-tokens',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const { access_token, refresh_token, expiry_date } = req.body;

      if (!access_token) {
        res.status(400).json({
          success: false,
          message: 'access_token es requerido'
        });
        return;
      }

      const success = await calendarService.saveGoogleCalendarTokens(req.user.id, {
        access_token,
        refresh_token,
        expiry_date
      });

      if (success) {
        res.json({
          success: true,
          message: 'Google Calendar conectado exitosamente'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Error al guardar tokens'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor'
      });
    }
  }
);

/**
 * DELETE /api/calendar/google/disconnect
 * Desconectar Google Calendar
 */
router.delete(
  '/google/disconnect',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const success = await calendarService.disconnectGoogleCalendar(req.user.id);

      if (success) {
        res.json({
          success: true,
          message: 'Google Calendar desconectado'
        });
      } else {
        res.status(500).json({
          success: false,
          message: 'Error al desconectar'
        });
      }
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor'
      });
    }
  }
);

/**
 * POST /api/calendar/sync-contracts
 * Sincronizar todos los contratos del usuario a su calendario
 */
router.post(
  '/sync-contracts',
  protect,
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const count = await calendarService.syncUserContractsToCalendar(req.user.id);

      res.json({
        success: true,
        message: `${count} contratos sincronizados`,
        syncedCount: count
      });
    } catch (error: any) {
      res.status(500).json({
        success: false,
        message: error.message || 'Error del servidor'
      });
    }
  }
);

export default router;
