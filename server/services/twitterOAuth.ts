import { config } from '../config/env.js';
import crypto from 'crypto';

// Store for PKCE code verifiers and states (in production, use Redis)
const authSessions = new Map<string, { codeVerifier: string; expiresAt: Date }>();

// Twitter OAuth 2.0 configuration
const TWITTER_AUTH_URL = 'https://twitter.com/i/oauth2/authorize';
const TWITTER_TOKEN_URL = 'https://api.twitter.com/2/oauth2/token';
const TWITTER_SCOPES = ['tweet.read', 'users.read', 'offline.access'];
const CALLBACK_URL = `${config.serverUrl}/api/auth/twitter/callback`;

/**
 * Generate a random string for state/verifier
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate PKCE code challenge from verifier
 */
function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url');
}

/**
 * Generate authorization URL for Twitter OAuth 2.0
 */
export function generateAuthUrl(): { url: string; state: string } {
  if (!config.twitterClientId) {
    throw new Error('Twitter OAuth credentials not configured');
  }

  // Generate state for CSRF protection
  const state = generateRandomString(32);

  // Generate PKCE code verifier and challenge
  const codeVerifier = generateRandomString(64);
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // Store the code verifier for later use
  authSessions.set(state, {
    codeVerifier,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  });

  // Clean up expired sessions
  cleanupExpiredSessions();

  // Build authorization URL
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.twitterClientId,
    redirect_uri: CALLBACK_URL,
    scope: TWITTER_SCOPES.join(' '),
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  const authUrl = `${TWITTER_AUTH_URL}?${params.toString()}`;

  console.log('🐦 Twitter OAuth URL generated, state:', state.substring(0, 8) + '...');

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
  // Retrieve the code verifier
  const session = authSessions.get(state);
  if (!session) {
    throw new Error('Invalid or expired OAuth state');
  }

  const { codeVerifier } = session;
  authSessions.delete(state);

  console.log('🐦 Exchanging code for tokens...');

  // Prepare the token request
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: CALLBACK_URL,
    code_verifier: codeVerifier,
  });

  // Create Basic auth header
  const credentials = Buffer.from(
    `${config.twitterClientId}:${config.twitterClientSecret}`
  ).toString('base64');

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('🐦 Twitter token error:', errorData);
    throw new Error(`Twitter token error: ${errorData.error_description || errorData.error || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('🐦 Tokens received successfully');

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
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
  console.log('🐦 Fetching user profile...');

  const response = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    console.error('🐦 Twitter API error:', error);
    throw new Error(`Twitter API error: ${error.detail || error.title || 'Unknown error'}`);
  }

  const data = await response.json();
  console.log('🐦 User profile fetched:', data.data.username);

  return {
    id: data.data.id,
    name: data.data.name,
    username: data.data.username,
    profileImageUrl: data.data.profile_image_url?.replace('_normal', '_400x400'),
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
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const credentials = Buffer.from(
    `${config.twitterClientId}:${config.twitterClientSecret}`
  ).toString('base64');

  const response = await fetch(TWITTER_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${credentials}`,
    },
    body: params.toString(),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`Twitter refresh error: ${errorData.error_description || errorData.error || 'Unknown error'}`);
  }

  const data = await response.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: data.expires_in ? new Date(Date.now() + data.expires_in * 1000) : undefined,
  };
}

/**
 * Check if Twitter OAuth is configured
 */
export function isTwitterOAuthConfigured(): boolean {
  return !!(config.twitterClientId && config.twitterClientSecret);
}

/**
 * Clean up expired auth sessions
 */
function cleanupExpiredSessions() {
  const now = new Date();
  for (const [state, data] of authSessions.entries()) {
    if (data.expiresAt < now) {
      authSessions.delete(state);
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
