import { Request, Response, NextFunction } from "express";

/**
 * Web Application Firewall (WAF) Middleware
 * Protección OWASP Top 10 + Zero-day + Bot Detection
 *
 * Features:
 * - OWASP Top 10 protection (SQL Injection, XSS, etc.)
 * - Zero-day threat patterns (auto-updated signatures)
 * - Advanced bot detection (behavior + fingerprint)
 * - Rate limiting with adaptive blocking
 * - Request anomaly detection
 */

// ============================================
// CONFIGURACIÓN
// ============================================

const WAF_CONFIG = {
  enabled: true,
  logBlocked: true,
  blockMode: true, // false = solo loguear, true = bloquear

  // Rate limiting por IP
  rateLimit: {
    windowMs: 60 * 1000, // 1 minuto
    maxRequests: 100,    // máximo 100 requests por minuto por IP
    blockDuration: 5 * 60 * 1000, // 5 minutos de bloqueo
  },

  // Rate limiting específico por endpoint
  endpointRateLimits: {
    '/api/auth/login': { windowMs: 60000, maxRequests: 5 },
    '/api/auth/register': { windowMs: 60000, maxRequests: 3 },
    '/api/auth/forgot-password': { windowMs: 60000, maxRequests: 3 },
    '/api/payments': { windowMs: 60000, maxRequests: 10 },
  } as Record<string, { windowMs: number; maxRequests: number }>,

  // Tamaño máximo de payload
  maxPayloadSize: 10 * 1024 * 1024, // 10MB

  // Máximo de parámetros en query string
  maxQueryParams: 50,

  // Máximo largo de URL
  maxUrlLength: 2048,

  // Bot detection
  botDetection: {
    enabled: true,
    challengeMode: true, // Enviar challenge en vez de bloquear
    honeypotPaths: ['/admin.php', '/wp-login.php', '/xmlrpc.php', '/.git/config'],
  },

  // Anomaly detection thresholds
  anomaly: {
    maxHeaderSize: 8192,
    maxCookieSize: 4096,
    suspiciousHeaderCount: 50,
    minRequestInterval: 50, // ms - requests más rápidos son sospechosos
  },
};

// ============================================
// PATRONES DE DETECCIÓN
// ============================================

// ============================================
// OWASP TOP 10 PATTERNS
// ============================================

// A03:2021 - SQL Injection patterns (enhanced)
const SQL_INJECTION_PATTERNS = [
  /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|into|table|database|where)\b)/i,
  /(\b(or|and)\b\s+[\d\w"'`]+\s*[=<>]+\s*[\d\w"'`]+)/i,
  /(['"`];\s*(drop|delete|update|insert))/i,
  /(\b(benchmark|sleep|waitfor|delay)\s*\()/i,
  /(\/\*[\s\S]*?\*\/)/,
  /(--[^\n]*)/,
  /(\bload_file\s*\()/i,
  /(\binto\s+(out|dump)file\b)/i,
  /(\bconcat\s*\()/i,
  /(\bchar\s*\(\d+\))/i,
  /(\bhaving\b\s+\d)/i,
  /(\bgroup\s+by\b.*\bhaving\b)/i,
  /(information_schema|sysobjects|syscolumns)/i,
  // Additional SQL injection vectors
  /(\bextractvalue\s*\()/i,
  /(\bupdatexml\s*\()/i,
  /(\bxp_cmdshell\b)/i,
  /(\bsp_executesql\b)/i,
  /(\bdbms_pipe\b)/i,
  /(\butl_http\b)/i,
  /(\bpg_sleep\b)/i,
  /(\brandomblob\b)/i,
  /(0x[0-9a-fA-F]{16,})/i, // Long hex strings (often used for injection)
];

// A03:2021 - NoSQL Injection patterns
const NOSQL_INJECTION_PATTERNS = [
  /\$where\s*:/i,
  /\$regex\s*:/i,
  /\$ne\s*:/i,
  /\$gt\s*:/i,
  /\$lt\s*:/i,
  /\$or\s*:\s*\[/i,
  /\$and\s*:\s*\[/i,
  /\{\s*"\$/i,
  /\[\s*"\$gt"/i,
];

// XSS patterns
const XSS_PATTERNS = [
  /<script[\s\S]*?>[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?>/gi,
  /<object[\s\S]*?>/gi,
  /<embed[\s\S]*?>/gi,
  /<link[\s\S]*?>/gi,
  /javascript\s*:/gi,
  /vbscript\s*:/gi,
  /on\w+\s*=\s*["'][^"']*["']/gi,
  /on\w+\s*=\s*[^\s>]+/gi,
  /<svg[\s\S]*?onload/gi,
  /<img[\s\S]*?onerror/gi,
  /expression\s*\(/gi,
  /<body[\s\S]*?onload/gi,
  /document\s*\.\s*(cookie|location|write)/gi,
  /window\s*\.\s*(location|open)/gi,
  /eval\s*\(/gi,
  /alert\s*\(/gi,
];

// Path traversal patterns
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.[\/\\]/,
  /%2e%2e[\/\\%]/i,
  /%252e%252e/i,
  /\.\.%2f/i,
  /\.\.%5c/i,
  /%c0%ae/i,
  /%c1%9c/i,
  /etc\/passwd/i,
  /etc\/shadow/i,
  /windows\/system32/i,
  /boot\.ini/i,
];

// A03:2021 - Command injection patterns (enhanced)
const COMMAND_INJECTION_PATTERNS = [
  /[;&|`$]|\$\(|\)\s*{/,
  /\b(cat|ls|dir|wget|curl|nc|netcat|bash|sh|cmd|powershell)\b.*[|;]/i,
  />\s*\/?(etc|tmp|var|dev)/i,
  /\|\s*(bash|sh|cmd)/i,
  // Additional command injection vectors
  /\b(chmod|chown|rm|mv|cp)\s+(-rf?|--)/i,
  /\b(python|perl|ruby|php|node)\s+-e/i,
  /`[^`]+`/,
  /\$\([^)]+\)/,
  /\b(eval|system|exec|passthru|shell_exec|popen|proc_open)\s*\(/i,
];

// A10:2021 - SSRF (Server-Side Request Forgery) patterns
const SSRF_PATTERNS = [
  /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)/i,
  /^(https?:\/\/)?10\.\d+\.\d+\.\d+/i,
  /^(https?:\/\/)?172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/i,
  /^(https?:\/\/)?192\.168\.\d+\.\d+/i,
  /^file:\/\//i,
  /^gopher:\/\//i,
  /^dict:\/\//i,
  /^ftp:\/\/localhost/i,
  /^(https?:\/\/)?169\.254\.\d+\.\d+/i, // AWS metadata
  /^(https?:\/\/)?metadata\.google/i,
  /@localhost/i,
  /@127\.0\.0\.1/i,
];

// A05:2021 - XXE (XML External Entity) patterns
const XXE_PATTERNS = [
  /<!DOCTYPE[^>]*\[/i,
  /<!ENTITY/i,
  /SYSTEM\s+["'][^"']*["']/i,
  /PUBLIC\s+["'][^"']*["']/i,
  /xmlns:xi\s*=/i,
  /<xi:include/i,
  /<!ATTLIST/i,
];

// A03:2021 - LDAP Injection patterns
const LDAP_INJECTION_PATTERNS = [
  /[()\\*]/,
  /\|\(/,
  /\)\(/,
  /\(\|/,
  /\(&/,
  /\(!/,
];

// A07:2021 - Header Injection patterns
const HEADER_INJECTION_PATTERNS = [
  /[\r\n]/,
  /%0[aAdD]/i,
  /%0a%0d/i,
  /\\r\\n/i,
];

// A04:2021 - Insecure Direct Object Reference patterns
const IDOR_SUSPICIOUS_PATTERNS = [
  /\.\.\/\.\.\/\.\.\//,
  /id=(-?\d{10,})/i, // Suspicious large IDs
  /\bid\s*=\s*['"]?[a-f0-9]{24,}['"]?/i, // MongoDB ObjectId manipulation
];

// ============================================
// BOT DETECTION PATTERNS
// ============================================

// Malicious user agents (scanners, bots, crawlers)
const MALICIOUS_USER_AGENTS = [
  // Security scanners
  /nikto/i,
  /sqlmap/i,
  /nmap/i,
  /masscan/i,
  /nessus/i,
  /acunetix/i,
  /burpsuite/i,
  /owasp/i,
  /havij/i,
  /pangolin/i,
  /w3af/i,
  /skipfish/i,
  /wpscan/i,
  /dirbuster/i,
  /gobuster/i,
  /ffuf/i,
  /nuclei/i,
  /httpx/i,
  /zgrab/i,
  /censys/i,
  /shodan/i,
  // Additional malicious bots
  /ahrefs/i,
  /semrush/i,
  /mj12bot/i,
  /dotbot/i,
  /blexbot/i,
  /sistrix/i,
  /rogerbot/i,
  /exabot/i,
  /gigabot/i,
  /scrapy/i,
  /python-requests/i,
  /curl\/\d/i,
  /wget/i,
  /libwww-perl/i,
  /lwp-trivial/i,
  /java\/\d/i,
  /httpclient/i,
];

// Legitimate bots (whitelist patterns)
const LEGITIMATE_BOTS = [
  /googlebot/i,
  /bingbot/i,
  /yandexbot/i,
  /duckduckbot/i,
  /slurp/i, // Yahoo
  /facebookexternalhit/i,
  /twitterbot/i,
  /linkedinbot/i,
  /whatsapp/i,
  /telegrambot/i,
  /applebot/i,
  /mercadolibre/i,
  /mercadopago/i,
];

// Bot behavior indicators
const BOT_BEHAVIOR_INDICATORS = {
  noAcceptLanguage: true,
  noAcceptEncoding: true,
  missingCommonHeaders: ['accept', 'accept-language'],
  suspiciousHeaderOrder: true,
  tooFastRequests: true,
  noReferrerOnDeepPages: true,
};

// Suspicious paths that should never be accessed
const BLOCKED_PATHS = [
  /^\/?\.env/i,
  /^\/?\.git/i,
  /^\/?\.svn/i,
  /^\/?\.htaccess/i,
  /^\/?\.htpasswd/i,
  /^\/?wp-admin/i,
  /^\/?wp-login/i,
  /^\/?wp-content/i,
  /^\/?administrator/i,
  /^\/?phpmyadmin/i,
  /^\/?adminer/i,
  /^\/?backup/i,
  /^\/?\.aws/i,
  /^\/?\.ssh/i,
  /^\/?config\.(php|json|yml|yaml|xml|ini)/i,
  /^\/?composer\.(json|lock)/i,
  /^\/?package-lock\.json$/i,
  /^\/?\.npmrc/i,
  /^\/?docker-compose/i,
  /^\/?Dockerfile/i,
  /^\/?\.dockerignore/i,
  /\.sql$/i,
  /\.bak$/i,
  /\.backup$/i,
  /\.old$/i,
  /\.orig$/i,
  /\.swp$/i,
  /~$/,
];

// ============================================
// ESTADO EN MEMORIA
// ============================================

interface IPState {
  requests: number;
  firstRequest: number;
  lastRequest: number;
  blocked: boolean;
  blockedUntil?: number;
  violations: number;
  botScore: number; // 0-100, higher = more likely bot
  paths: Set<string>;
  userAgents: Set<string>;
  endpointRequests: Map<string, { count: number; firstRequest: number }>;
}

interface ThreatIntelligence {
  lastUpdate: number;
  knownBadIPs: Set<string>;
  knownBadPatterns: RegExp[];
}

const ipStates = new Map<string, IPState>();
const blacklistedIPs = new Set<string>();
const whitelistedIPs = new Set<string>(['127.0.0.1', '::1']);
const honeypotHits = new Map<string, number>(); // IP -> hit count

// Threat intelligence (simulated - in production, fetch from external sources)
const threatIntel: ThreatIntelligence = {
  lastUpdate: Date.now(),
  knownBadIPs: new Set<string>(),
  knownBadPatterns: [
    // Zero-day patterns (updated dynamically)
    /\$\{jndi:/i, // Log4Shell
    /\$\{env:/i,
    /\$\{sys:/i,
    /\$\{java:/i,
    /class\.module\.classLoader/i, // Spring4Shell
    /getRuntime\(\)\.exec/i,
    /ProcessBuilder/i,
    /Runtime\.getRuntime/i,
  ],
};

// WAF Statistics
interface WafStats {
  totalRequests: number;
  blockedRequests: number;
  sqlInjectionAttempts: number;
  xssAttempts: number;
  botDetections: number;
  rateLimitBlocks: number;
  zeroDay: number;
}

const wafStats: WafStats = {
  totalRequests: 0,
  blockedRequests: 0,
  sqlInjectionAttempts: 0,
  xssAttempts: 0,
  botDetections: 0,
  rateLimitBlocks: 0,
  zeroDay: 0,
};

// Limpiar IPs antiguas cada 10 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, state] of ipStates.entries()) {
    if (state.blockedUntil && state.blockedUntil < now) {
      state.blocked = false;
      state.blockedUntil = undefined;
    }
    if (now - state.firstRequest > WAF_CONFIG.rateLimit.windowMs * 10) {
      ipStates.delete(ip);
    }
  }
  // Clear old honeypot hits
  for (const [ip, hits] of honeypotHits.entries()) {
    if (hits > 3) {
      blacklistedIPs.add(ip);
      honeypotHits.delete(ip);
    }
  }
}, 10 * 60 * 1000);

// ============================================
// FUNCIONES DE UTILIDAD
// ============================================

function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = typeof forwarded === 'string' ? forwarded : forwarded[0];
    return ips.split(',')[0].trim();
  }
  return req.socket.remoteAddress || req.ip || 'unknown';
}

function logWafEvent(
  req: Request,
  type: string,
  reason: string,
  blocked: boolean
) {
  if (!WAF_CONFIG.logBlocked) return;

  const ip = getClientIP(req);
  const timestamp = new Date().toISOString();
  const userAgent = req.headers['user-agent'] || 'unknown';

  console.log(`[WAF] ${timestamp} | ${blocked ? 'BLOCKED' : 'DETECTED'} | ${type} | IP: ${ip} | Path: ${req.method} ${req.path} | Reason: ${reason} | UA: ${userAgent.substring(0, 50)}`);
}

function checkPatterns(
  value: string,
  patterns: RegExp[],
  type: string
): { matched: boolean; pattern?: string } {
  for (const pattern of patterns) {
    if (pattern.test(value)) {
      return { matched: true, pattern: pattern.source.substring(0, 50) };
    }
  }
  return { matched: false };
}

function inspectValue(value: any, patterns: RegExp[], type: string): { matched: boolean; pattern?: string } {
  if (typeof value === 'string') {
    return checkPatterns(value, patterns, type);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const result = inspectValue(item, patterns, type);
      if (result.matched) return result;
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      // También verificar las claves
      const keyResult = checkPatterns(key, patterns, type);
      if (keyResult.matched) return keyResult;

      const valueResult = inspectValue(value[key], patterns, type);
      if (valueResult.matched) return valueResult;
    }
  }
  return { matched: false };
}

/**
 * Calculate bot score based on request characteristics
 * Returns 0-100 (higher = more likely bot)
 */
function calculateBotScore(req: Request, ipState: IPState): number {
  let score = 0;
  const userAgent = req.headers['user-agent'] || '';

  // No user agent = very suspicious
  if (!userAgent) {
    score += 40;
  }

  // Check for legitimate bots first (reduce score)
  for (const pattern of LEGITIMATE_BOTS) {
    if (pattern.test(userAgent)) {
      return 0; // Legitimate bot, don't penalize
    }
  }

  // Missing Accept-Language header
  if (!req.headers['accept-language']) {
    score += 15;
  }

  // Missing Accept header
  if (!req.headers['accept']) {
    score += 10;
  }

  // Too many different user agents from same IP
  if (ipState.userAgents.size > 5) {
    score += 20;
  }

  // Too fast requests (< 50ms apart)
  const timeSinceLastRequest = Date.now() - ipState.lastRequest;
  if (timeSinceLastRequest < WAF_CONFIG.anomaly.minRequestInterval && ipState.requests > 1) {
    score += 25;
  }

  // Accessing many different paths rapidly
  if (ipState.paths.size > 50 && ipState.requests < 100) {
    score += 15;
  }

  // Suspicious patterns in user agent
  if (/bot|crawler|spider|scraper/i.test(userAgent) && !LEGITIMATE_BOTS.some(p => p.test(userAgent))) {
    score += 20;
  }

  // Generic/empty referrer on non-entry pages
  const referer = req.headers['referer'] || '';
  if (!referer && req.path !== '/' && !req.path.startsWith('/api/')) {
    score += 5;
  }

  // Connection header anomalies
  const connection = req.headers['connection'];
  if (connection && !['keep-alive', 'close'].includes(connection.toLowerCase())) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Check if request hits a honeypot path
 */
function isHoneypotPath(path: string): boolean {
  return WAF_CONFIG.botDetection.honeypotPaths.some(hp => path.toLowerCase().includes(hp.toLowerCase()));
}

/**
 * Check for SSRF in URL parameters
 */
function checkSSRF(value: any): { matched: boolean; pattern?: string } {
  if (typeof value === 'string') {
    for (const pattern of SSRF_PATTERNS) {
      if (pattern.test(value)) {
        return { matched: true, pattern: 'SSRF: ' + pattern.source.substring(0, 30) };
      }
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const result = checkSSRF(value[key]);
      if (result.matched) return result;
    }
  }
  return { matched: false };
}

/**
 * Check for zero-day patterns from threat intelligence
 */
function checkZeroDay(value: any): { matched: boolean; pattern?: string } {
  if (typeof value === 'string') {
    for (const pattern of threatIntel.knownBadPatterns) {
      if (pattern.test(value)) {
        return { matched: true, pattern: 'ZERO_DAY: ' + pattern.source.substring(0, 30) };
      }
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const result = checkZeroDay(value[key]);
      if (result.matched) return result;
    }
  }
  return { matched: false };
}

/**
 * Check header injection
 */
function checkHeaderInjection(req: Request): boolean {
  const headersToCheck = ['host', 'x-forwarded-for', 'x-forwarded-host', 'x-original-url'];
  for (const header of headersToCheck) {
    const value = req.headers[header];
    if (value) {
      const strValue = Array.isArray(value) ? value.join('') : value;
      for (const pattern of HEADER_INJECTION_PATTERNS) {
        if (pattern.test(strValue)) {
          return true;
        }
      }
    }
  }
  return false;
}

// ============================================
// MIDDLEWARE PRINCIPAL
// ============================================

export function wafMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!WAF_CONFIG.enabled) {
    return next();
  }

  wafStats.totalRequests++;
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';

  // 1. Check whitelist
  if (whitelistedIPs.has(ip)) {
    return next();
  }

  // 2. Check blacklist
  if (blacklistedIPs.has(ip)) {
    wafStats.blockedRequests++;
    logWafEvent(req, 'BLACKLIST', 'IP is blacklisted', true);
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  // 3. Check threat intelligence
  if (threatIntel.knownBadIPs.has(ip)) {
    wafStats.blockedRequests++;
    logWafEvent(req, 'THREAT_INTEL', 'IP in threat intelligence database', true);
    return res.status(403).json({
      success: false,
      message: 'Access denied',
    });
  }

  // 4. Honeypot detection
  if (WAF_CONFIG.botDetection.enabled && isHoneypotPath(req.path)) {
    const hits = (honeypotHits.get(ip) || 0) + 1;
    honeypotHits.set(ip, hits);
    wafStats.botDetections++;
    logWafEvent(req, 'HONEYPOT', `Hit honeypot path: ${req.path} (${hits} hits)`, true);
    if (hits >= 2) {
      blacklistedIPs.add(ip);
    }
    return res.status(404).json({
      success: false,
      message: 'Not found',
    });
  }

  // 5. Check rate limit
  const now = Date.now();
  let ipState = ipStates.get(ip);

  if (!ipState) {
    ipState = {
      requests: 0,
      firstRequest: now,
      lastRequest: now,
      blocked: false,
      violations: 0,
      botScore: 0,
      paths: new Set(),
      userAgents: new Set(),
      endpointRequests: new Map(),
    };
    ipStates.set(ip, ipState);
  }

  // Track paths and user agents
  ipState.paths.add(req.path);
  if (userAgent) {
    ipState.userAgents.add(userAgent);
  }

  // Check if blocked
  if (ipState.blocked && ipState.blockedUntil && ipState.blockedUntil > now) {
    wafStats.blockedRequests++;
    wafStats.rateLimitBlocks++;
    logWafEvent(req, 'RATE_LIMIT', 'IP is temporarily blocked', true);
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: Math.ceil((ipState.blockedUntil - now) / 1000),
    });
  }

  // Reset window if expired
  if (now - ipState.firstRequest > WAF_CONFIG.rateLimit.windowMs) {
    ipState.requests = 0;
    ipState.firstRequest = now;
    ipState.blocked = false;
    ipState.paths.clear();
    ipState.endpointRequests.clear();
  }

  ipState.requests++;
  ipState.lastRequest = now;

  // 6. Endpoint-specific rate limiting
  const endpointLimit = WAF_CONFIG.endpointRateLimits[req.path];
  if (endpointLimit) {
    let endpointState = ipState.endpointRequests.get(req.path);
    if (!endpointState) {
      endpointState = { count: 0, firstRequest: now };
      ipState.endpointRequests.set(req.path, endpointState);
    }

    if (now - endpointState.firstRequest > endpointLimit.windowMs) {
      endpointState.count = 0;
      endpointState.firstRequest = now;
    }

    endpointState.count++;

    if (endpointState.count > endpointLimit.maxRequests) {
      wafStats.blockedRequests++;
      wafStats.rateLimitBlocks++;
      logWafEvent(req, 'ENDPOINT_RATE_LIMIT', `Exceeded ${endpointLimit.maxRequests} requests for ${req.path}`, true);
      return res.status(429).json({
        success: false,
        message: 'Too many requests to this endpoint. Please try again later.',
        retryAfter: Math.ceil(endpointLimit.windowMs / 1000),
      });
    }
  }

  // Check global rate limit
  if (ipState.requests > WAF_CONFIG.rateLimit.maxRequests) {
    ipState.blocked = true;
    ipState.blockedUntil = now + WAF_CONFIG.rateLimit.blockDuration;
    ipState.violations++;
    wafStats.blockedRequests++;
    wafStats.rateLimitBlocks++;

    // Auto-blacklist after 5 violations
    if (ipState.violations >= 5) {
      blacklistedIPs.add(ip);
      logWafEvent(req, 'AUTO_BLACKLIST', 'IP auto-blacklisted after 5 violations', true);
    }

    logWafEvent(req, 'RATE_LIMIT', `Exceeded ${WAF_CONFIG.rateLimit.maxRequests} requests/min`, true);
    return res.status(429).json({
      success: false,
      message: 'Too many requests. Please try again later.',
      retryAfter: WAF_CONFIG.rateLimit.blockDuration / 1000,
    });
  }

  // 7. Bot detection
  if (WAF_CONFIG.botDetection.enabled) {
    const botScore = calculateBotScore(req, ipState);
    ipState.botScore = Math.max(ipState.botScore, botScore);

    if (botScore >= 70) {
      wafStats.botDetections++;
      if (WAF_CONFIG.botDetection.challengeMode) {
        // In production, this would send a JavaScript challenge
        logWafEvent(req, 'BOT_DETECTED', `Bot score: ${botScore}`, false);
      } else {
        wafStats.blockedRequests++;
        logWafEvent(req, 'BOT_BLOCKED', `Bot score: ${botScore}`, true);
        return res.status(403).json({
          success: false,
          message: 'Access denied - automated access detected',
        });
      }
    }
  }

  // 4. Check URL length
  if (req.url.length > WAF_CONFIG.maxUrlLength) {
    logWafEvent(req, 'URL_LENGTH', `URL too long: ${req.url.length} chars`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(414).json({
        success: false,
        message: 'URL too long',
      });
    }
  }

  // 5. Check blocked paths
  for (const pattern of BLOCKED_PATHS) {
    if (pattern.test(req.path)) {
      ipState.violations++;
      logWafEvent(req, 'BLOCKED_PATH', `Attempted access to ${req.path}`, true);
      if (WAF_CONFIG.blockMode) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }
    }
  }

  // 6. Check malicious user agent
  for (const pattern of MALICIOUS_USER_AGENTS) {
    if (pattern.test(userAgent)) {
      ipState.violations++;
      logWafEvent(req, 'MALICIOUS_UA', `Scanner detected: ${userAgent.substring(0, 50)}`, true);
      if (WAF_CONFIG.blockMode) {
        return res.status(403).json({
          success: false,
          message: 'Access denied',
        });
      }
    }
  }

  // 7. Check query params count
  const queryParamCount = Object.keys(req.query).length;
  if (queryParamCount > WAF_CONFIG.maxQueryParams) {
    logWafEvent(req, 'QUERY_PARAMS', `Too many query params: ${queryParamCount}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Too many query parameters',
      });
    }
  }

  // 8. Check header injection
  if (checkHeaderInjection(req)) {
    ipState.violations++;
    wafStats.blockedRequests++;
    logWafEvent(req, 'HEADER_INJECTION', 'CRLF injection attempt', true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 9. Inspect all inputs
  const allInputs = {
    query: req.query,
    body: req.body,
    params: req.params,
    path: req.path,
    headers: {
      host: req.headers['host'],
      referer: req.headers['referer'],
      origin: req.headers['origin'],
    },
  };

  // 10. Zero-day threat patterns
  const zeroDay = checkZeroDay(allInputs);
  if (zeroDay.matched) {
    ipState.violations += 3; // Severe violation
    wafStats.blockedRequests++;
    wafStats.zeroDay++;
    logWafEvent(req, 'ZERO_DAY', `Pattern: ${zeroDay.pattern}`, true);
    blacklistedIPs.add(ip); // Immediately blacklist
    return res.status(400).json({
      success: false,
      message: 'Invalid request',
    });
  }

  // 11. SQL Injection
  const sqlResult = inspectValue(allInputs, SQL_INJECTION_PATTERNS, 'SQL_INJECTION');
  if (sqlResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    wafStats.sqlInjectionAttempts++;
    logWafEvent(req, 'SQL_INJECTION', `Pattern: ${sqlResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 12. NoSQL Injection
  const nosqlResult = inspectValue(allInputs, NOSQL_INJECTION_PATTERNS, 'NOSQL_INJECTION');
  if (nosqlResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    logWafEvent(req, 'NOSQL_INJECTION', `Pattern: ${nosqlResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 13. XSS
  const xssResult = inspectValue(allInputs, XSS_PATTERNS, 'XSS');
  if (xssResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    wafStats.xssAttempts++;
    logWafEvent(req, 'XSS', `Pattern: ${xssResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 14. Path Traversal
  const pathResult = inspectValue(allInputs, PATH_TRAVERSAL_PATTERNS, 'PATH_TRAVERSAL');
  if (pathResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    logWafEvent(req, 'PATH_TRAVERSAL', `Pattern: ${pathResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 15. Command Injection
  const cmdResult = inspectValue(allInputs, COMMAND_INJECTION_PATTERNS, 'CMD_INJECTION');
  if (cmdResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    logWafEvent(req, 'CMD_INJECTION', `Pattern: ${cmdResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 16. SSRF
  const ssrfResult = checkSSRF(allInputs.query);
  if (ssrfResult.matched) {
    ipState.violations++;
    wafStats.blockedRequests++;
    logWafEvent(req, 'SSRF', `Pattern: ${ssrfResult.pattern}`, true);
    if (WAF_CONFIG.blockMode) {
      return res.status(400).json({
        success: false,
        message: 'Invalid request',
      });
    }
  }

  // 17. XXE (for XML content)
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('xml')) {
    const xxeResult = inspectValue(req.body, XXE_PATTERNS, 'XXE');
    if (xxeResult.matched) {
      ipState.violations++;
      wafStats.blockedRequests++;
      logWafEvent(req, 'XXE', `Pattern: ${xxeResult.pattern}`, true);
      if (WAF_CONFIG.blockMode) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request',
        });
      }
    }
  }

  // 18. LDAP Injection (if applicable)
  if (req.path.includes('ldap') || req.path.includes('search')) {
    const ldapResult = inspectValue(allInputs.query, LDAP_INJECTION_PATTERNS, 'LDAP_INJECTION');
    if (ldapResult.matched) {
      ipState.violations++;
      wafStats.blockedRequests++;
      logWafEvent(req, 'LDAP_INJECTION', `Pattern: ${ldapResult.pattern}`, true);
      if (WAF_CONFIG.blockMode) {
        return res.status(400).json({
          success: false,
          message: 'Invalid request',
        });
      }
    }
  }

  next();
}

// ============================================
// FUNCIONES DE ADMINISTRACIÓN
// ============================================

/**
 * Agregar IP a la blacklist
 */
export function blacklistIP(ip: string): void {
  blacklistedIPs.add(ip);
  console.log(`[WAF] IP blacklisted: ${ip}`);
}

/**
 * Remover IP de la blacklist
 */
export function unblacklistIP(ip: string): void {
  blacklistedIPs.delete(ip);
  console.log(`[WAF] IP removed from blacklist: ${ip}`);
}

/**
 * Agregar IP a la whitelist
 */
export function whitelistIP(ip: string): void {
  whitelistedIPs.add(ip);
  console.log(`[WAF] IP whitelisted: ${ip}`);
}

/**
 * Obtener estadísticas completas del WAF
 */
export function getWafStats(): {
  totalTrackedIPs: number;
  blacklistedIPs: number;
  whitelistedIPs: number;
  currentlyBlocked: number;
  totalRequests: number;
  blockedRequests: number;
  blockRate: string;
  attackBreakdown: {
    sqlInjection: number;
    xss: number;
    botDetections: number;
    rateLimitBlocks: number;
    zeroDayBlocks: number;
  };
} {
  const now = Date.now();
  let currentlyBlocked = 0;

  for (const state of ipStates.values()) {
    if (state.blocked && state.blockedUntil && state.blockedUntil > now) {
      currentlyBlocked++;
    }
  }

  const blockRate = wafStats.totalRequests > 0
    ? ((wafStats.blockedRequests / wafStats.totalRequests) * 100).toFixed(2) + '%'
    : '0%';

  return {
    totalTrackedIPs: ipStates.size,
    blacklistedIPs: blacklistedIPs.size,
    whitelistedIPs: whitelistedIPs.size,
    currentlyBlocked,
    totalRequests: wafStats.totalRequests,
    blockedRequests: wafStats.blockedRequests,
    blockRate,
    attackBreakdown: {
      sqlInjection: wafStats.sqlInjectionAttempts,
      xss: wafStats.xssAttempts,
      botDetections: wafStats.botDetections,
      rateLimitBlocks: wafStats.rateLimitBlocks,
      zeroDayBlocks: wafStats.zeroDay,
    },
  };
}

/**
 * Obtener lista de IPs bloqueadas
 */
export function getBlockedIPs(): string[] {
  return Array.from(blacklistedIPs);
}

/**
 * Agregar patrón de zero-day
 */
export function addZeroDayPattern(pattern: RegExp): void {
  threatIntel.knownBadPatterns.push(pattern);
  threatIntel.lastUpdate = Date.now();
  console.log(`[WAF] Added zero-day pattern: ${pattern.source}`);
}

/**
 * Agregar IP a threat intelligence
 */
export function addThreatIP(ip: string): void {
  threatIntel.knownBadIPs.add(ip);
  console.log(`[WAF] Added threat IP: ${ip}`);
}

/**
 * Obtener IPs con mayor bot score
 */
export function getSuspiciousBots(): Array<{ ip: string; botScore: number; requests: number }> {
  const suspicious: Array<{ ip: string; botScore: number; requests: number }> = [];

  for (const [ip, state] of ipStates.entries()) {
    if (state.botScore >= 50) {
      suspicious.push({
        ip,
        botScore: state.botScore,
        requests: state.requests,
      });
    }
  }

  return suspicious.sort((a, b) => b.botScore - a.botScore).slice(0, 20);
}

/**
 * Reset WAF statistics (for testing)
 */
export function resetWafStats(): void {
  wafStats.totalRequests = 0;
  wafStats.blockedRequests = 0;
  wafStats.sqlInjectionAttempts = 0;
  wafStats.xssAttempts = 0;
  wafStats.botDetections = 0;
  wafStats.rateLimitBlocks = 0;
  wafStats.zeroDay = 0;
}

export default wafMiddleware;
