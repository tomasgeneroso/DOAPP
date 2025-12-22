import { auth } from 'twitter-api-sdk';
import { config } from '../config/env.js';
import crypto from 'crypto';

// Store for PKCE code verifiers (in production, use Redis)
const codeVerifiers = new Map<string, { verifier: string; expiresAt: Date }>();

// Twitter OAuth 2.0 configuration
const TWITTER_SCOPES = ['tweet.read', 'users.read', 'offline.access'];
const CALLBACK_URL = `${config.serverUrl}/api/auth/twitter/callback`;

/**
 * Create Twitter OAuth 2.0 client
 */
function createAuthClient() {
  if (!config.twitterClientId || !config.twitterClientSecret) {
    throw new Error('Twitter OAuth credentials not configured');
  }

  return new auth.OAuth2User({
    client_id: config.twitterClientId,
    client_secret: config.twitterClientSecret,
    callback: CALLBACK_URL,
    scopes: TWITTER_SCOPES,
  });
}

/**
 * Generate authorization URL for Twitter OAuth 2.0
 */
export function generateAuthUrl(): { url: string; state: string } {
  const authClient = createAuthClient();

  // Generate state for CSRF protection
  const state = crypto.randomBytes(32).toString('hex');

  // Generate authorization URL (PKCE is handled internally by the SDK)
  const authUrl = authClient.generateAuthURL({
    state,
    code_challenge_method: 's256',
  });

  // Store the code verifier for later use
  const codeVerifier = (authClient as any).codeVerifier;
  if (codeVerifier) {
    codeVerifiers.set(state, {
      verifier: codeVerifier,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
    });
  }

  // Clean up expired verifiers
  cleanupExpiredVerifiers();

  return { url: authUrl, state };
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(code: string, state: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}> {
  const authClient = createAuthClient();

  // Retrieve the code verifier
  const storedData = codeVerifiers.get(state);
  if (storedData) {
    (authClient as any).codeVerifier = storedData.verifier;
    codeVerifiers.delete(state);
  }

  // Exchange code for tokens
  const { token } = await authClient.requestAccessToken(code);

  return {
    accessToken: token.access_token!,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at ? new Date(token.expires_at * 1000) : undefined,
  };
}

/**
 * Get Twitter user profile using access token
 */
export async function getUserProfile(accessToken: string): Promise<{
  id: string;
  name: string;
  username: string;
  profileImageUrl?: string;
}> {
  // Use Twitter API v2 to get user info
  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Twitter API error: ${error.detail || error.title || 'Unknown error'}`);
  }

  const data = await response.json();

  return {
    id: data.data.id,
    name: data.data.name,
    username: data.data.username,
    profileImageUrl: data.data.profile_image_url?.replace('_normal', '_400x400'), // Get larger image
  };
}

/**
 * Refresh access token using refresh token
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}> {
  const authClient = createAuthClient();

  // Set the refresh token
  (authClient as any).token = { refresh_token: refreshToken };

  // Refresh the token
  const { token } = await authClient.refreshAccessToken();

  return {
    accessToken: token.access_token!,
    refreshToken: token.refresh_token,
    expiresAt: token.expires_at ? new Date(token.expires_at * 1000) : undefined,
  };
}

/**
 * Check if Twitter OAuth is configured
 */
export function isTwitterOAuthConfigured(): boolean {
  return !!(config.twitterClientId && config.twitterClientSecret);
}

/**
 * Clean up expired code verifiers
 */
function cleanupExpiredVerifiers() {
  const now = new Date();
  for (const [state, data] of codeVerifiers.entries()) {
    if (data.expiresAt < now) {
      codeVerifiers.delete(state);
    }
  }
}

export default {
  generateAuthUrl,
  exchangeCodeForTokens,
  getUserProfile,
  refreshAccessToken,
  isTwitterOAuthConfigured,
};
