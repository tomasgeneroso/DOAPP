/**
 * MercadoPago OAuth Routes
 *
 * Endpoints for workers to link/unlink their MercadoPago accounts
 * for automatic split payments.
 */

import { Router, Request, Response } from 'express';
import { protect, AuthRequest } from '../middleware/auth.js';
import { User } from '../models/sql/User.model.js';
import mercadopagoOAuthService from '../services/mercadopagoOAuth.js';

const router = Router();

/**
 * Get MercadoPago link status for current user
 * GET /api/mercadopago/status
 */
router.get('/status', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const user = await User.findByPk(userId);

    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    const isLinked = user.hasMercadopagoLinked();
    const prefersPayout = user.prefersMercadopagoPayout;

    res.json({
      success: true,
      data: {
        isLinked,
        prefersPayout,
        linkedAt: user.mercadopagoLinkedAt,
        email: user.mercadopagoEmail,
        // Don't expose sensitive data like access tokens
      },
    });
  } catch (error: any) {
    console.error('Error getting MercadoPago status:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Get OAuth authorization URL to link MercadoPago account
 * GET /api/mercadopago/auth-url
 */
router.get('/auth-url', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { returnUrl } = req.query;

    if (!mercadopagoOAuthService.isOAuthConfigured()) {
      res.status(503).json({
        success: false,
        message: 'El servicio de vinculación de MercadoPago no está configurado. Contacte al administrador.',
      });
      return;
    }

    const authUrl = mercadopagoOAuthService.getAuthorizationUrl(
      userId,
      returnUrl as string | undefined
    );

    res.json({
      success: true,
      data: { authUrl },
    });
  } catch (error: any) {
    console.error('Error generating MercadoPago auth URL:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * OAuth callback from MercadoPago
 * GET /api/mercadopago/oauth/callback
 */
router.get('/oauth/callback', async (req: Request, res: Response): Promise<void> => {
  try {
    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.error('MercadoPago OAuth error:', error, error_description);
      res.redirect(`${process.env.CLIENT_URL}/perfil/pagos?mp_error=${encodeURIComponent(error_description as string || 'Error de autorización')}`);
      return;
    }

    if (!code || !state) {
      res.redirect(`${process.env.CLIENT_URL}/perfil/pagos?mp_error=missing_params`);
      return;
    }

    // Parse state to get userId and returnUrl
    const stateData = mercadopagoOAuthService.parseState(state as string);
    if (!stateData) {
      res.redirect(`${process.env.CLIENT_URL}/perfil/pagos?mp_error=invalid_state`);
      return;
    }

    const { userId, returnUrl } = stateData;

    // Link the account
    const result = await mercadopagoOAuthService.linkAccount(userId, code as string);

    // Redirect to success page
    const redirectUrl = returnUrl || '/perfil/pagos';
    res.redirect(`${process.env.CLIENT_URL}${redirectUrl}?mp_linked=true&mp_email=${encodeURIComponent(result.email || '')}`);
  } catch (error: any) {
    console.error('Error in MercadoPago OAuth callback:', error);
    res.redirect(`${process.env.CLIENT_URL}/perfil/pagos?mp_error=${encodeURIComponent(error.message)}`);
  }
});

/**
 * Unlink MercadoPago account
 * POST /api/mercadopago/unlink
 */
router.post('/unlink', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;

    await mercadopagoOAuthService.unlinkAccount(userId);

    res.json({
      success: true,
      message: 'Cuenta de MercadoPago desvinculada exitosamente',
    });
  } catch (error: any) {
    console.error('Error unlinking MercadoPago:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Update payout preference
 * PUT /api/mercadopago/payout-preference
 */
router.put('/payout-preference', protect, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user.id;
    const { prefersMercadopago } = req.body;

    const user = await User.findByPk(userId);
    if (!user) {
      res.status(404).json({ success: false, message: 'Usuario no encontrado' });
      return;
    }

    // If user wants MercadoPago payout but doesn't have it linked
    if (prefersMercadopago && !user.hasMercadopagoLinked()) {
      res.status(400).json({
        success: false,
        message: 'Debe vincular su cuenta de MercadoPago primero para activar pagos automáticos',
      });
      return;
    }

    user.prefersMercadopagoPayout = prefersMercadopago;
    await user.save();

    res.json({
      success: true,
      message: prefersMercadopago
        ? 'Pagos automáticos por MercadoPago activados'
        : 'Pagos manuales por transferencia bancaria activados',
      data: {
        prefersMercadopago: user.prefersMercadopagoPayout,
      },
    });
  } catch (error: any) {
    console.error('Error updating payout preference:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * Check if OAuth service is available
 * GET /api/mercadopago/service-status
 */
router.get('/service-status', async (req: Request, res: Response): Promise<void> => {
  try {
    const isConfigured = mercadopagoOAuthService.isOAuthConfigured();

    res.json({
      success: true,
      data: {
        oauthAvailable: isConfigured,
        message: isConfigured
          ? 'Servicio de vinculación disponible'
          : 'Servicio de vinculación no configurado',
      },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
