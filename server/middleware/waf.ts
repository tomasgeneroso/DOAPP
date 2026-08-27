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
  /\.\.[/\\]/,
  /%2e%2e[/\\%]/i,
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
/**
 * IPs bloqueadas y hasta cuándo. Antes era un Set sin vencimiento: una sola
 * coincidencia — incluso un falso positivo — dejaba a esa IP sin acceso hasta
 * reiniciar el proceso, sin forma de enterarse ni de revertirlo.
 */
const blacklistedIPs = new Map<string, number>();

/** Cuánto dura el bloqueo por una coincidencia de patrón zero-day */
const ZERO_DAY_BLOCK_MS = 60 * 60 * 1000; // 1 hora
/** Bloqueo por defecto cuando no se especifica duración */
const DEFAULT_BLOCK_MS = 24 * 60 * 60 * 1000; // 24 horas

/** ¿La IP está bloqueada ahora? Limpia el bloqueo si ya venció. */
function isBlacklisted(ip: string): boolean {
  const until = blacklistedIPs.get(ip);
  if (until === undefined) return false;
  if (until !== Infinity && until < Date.now()) {
    blacklistedIPs.delete(ip);
    return false;
  }
  return true;
}
const whitelistedIPs = new Set<string>(['127.0.0.1', '::1', '172.20.10.3', '172.31.224.1']);
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

/**
 * Últimos bloqueos, para poder diagnosticarlos desde el panel de seguridad.
 *
 * Sin esto, un falso positivo sólo se puede investigar leyendo el log del
 * servidor y adivinando cuál de las diez reglas de contenido saltó. Con la
 * referencia que devuelve la respuesta, el owner encuentra el evento exacto.
 */
export interface WafEvent {
  reference: string;
  at: string;
  type: string;
  method: string;
  path: string;
  ip: string;
  userAgent: string;
  /** Dónde matcheó el patrón: "query.code", "headers.referer" */
  field?: string;
  /** Muestra del valor, con credenciales enmascaradas */
  sample?: string;
  pattern?: string;
  blocked: boolean;
}

const MAX_RECENT_EVENTS = 200;
const recentEvents: WafEvent[] = [];

function recordEvent(event: WafEvent) {
  recentEvents.unshift(event);
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.length = MAX_RECENT_EVENTS;
}

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
  // Soltar los bloqueos vencidos
  for (const [ip, until] of blacklistedIPs.entries()) {
    if (until !== Infinity && until < now) blacklistedIPs.delete(ip);
  }

  // Clear old honeypot hits
  for (const [ip, hits] of honeypotHits.entries()) {
    if (hits > 3) {
      blacklistedIPs.set(ip, Date.now() + DEFAULT_BLOCK_MS);
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

interface InspectionResult {
  matched: boolean;
  pattern?: string;
  /** Dónde matcheó: "query.code", "headers.referer". Sin esto no se puede
   *  diagnosticar un falso positivo sin adivinar. */
  field?: string;
  /** Muestra corta del valor, con los tokens enmascarados */
  sample?: string;
}

/** Enmascara lo que parezca credencial antes de guardarlo para diagnóstico */
function redact(value: string): string {
  return value
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '<jwt>')
    .replace(/\b[A-Za-z0-9_-]{40,}\b/g, '<token>')
    .slice(0, 120);
}

function inspectValue(
  value: any,
  patterns: RegExp[],
  type: string,
  field = ''
): InspectionResult {
  if (typeof value === 'string') {
    const result = checkPatterns(value, patterns, type);
    return result.matched ? { ...result, field, sample: redact(value) } : result;
  }
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const result = inspectValue(value[i], patterns, type, `${field}[${i}]`);
      if (result.matched) return result;
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const path = field ? `${field}.${key}` : key;

      // También verificar las claves
      const keyResult = checkPatterns(key, patterns, type);
      if (keyResult.matched) return { ...keyResult, field: path, sample: redact(key) };

      const valueResult = inspectValue(value[key], patterns, type, path);
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
function checkSSRF(value: any, field = ''): InspectionResult {
  if (typeof value === 'string') {
    for (const pattern of SSRF_PATTERNS) {
      if (pattern.test(value)) {
        return {
          matched: true,
          pattern: 'SSRF: ' + pattern.source.substring(0, 30),
          field,
          sample: redact(value),
        };
      }
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const result = checkSSRF(value[key], field ? `${field}.${key}` : key);
      if (result.matched) return result;
    }
  }
  return { matched: false };
}

/**
 * Check for zero-day patterns from threat intelligence
 */
function checkZeroDay(value: any, field = ''): InspectionResult {
  if (typeof value === 'string') {
    for (const pattern of threatIntel.knownBadPatterns) {
      if (pattern.test(value)) {
        return {
          matched: true,
          pattern: 'ZERO_DAY: ' + pattern.source.substring(0, 30),
          field,
          sample: redact(value),
        };
      }
    }
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) {
      const result = checkZeroDay(value[key], field ? `${field}.${key}` : key);
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

const WAF_EXEMPT_PATHS = ['/api/health'];

/**
 * Rutas que reciben parámetros generados por un proveedor externo.
 *
 * El `code`, el `state` y el `scope` de un callback OAuth son opacos: los
 * arma el proveedor, no los controla la app, y su forma cambia sin aviso. Pasarlos por reglas genéricas de SQLi o XSS garantiza
 * falsos positivos que dejan al usuario sin poder iniciar sesión, y no
 * agrega protección: el código se valida contra el proveedor y no se
 * interpola en SQL ni en HTML.
 *
 * La exención es sólo del escaneo de contenido (pasos 8 a 18). El rate
 * limit, la blacklist, la detección de bots y los límites de tamaño se
 * siguen aplicando.
 */
const CONTENT_SCAN_EXEMPT_PREFIXES = [
  '/api/auth/google',
  '/api/auth/facebook',
  '/api/auth/twitter',
];

function skipsContentScan(path: string): boolean {
  return CONTENT_SCAN_EXEMPT_PREFIXES.some(
    prefix => path === prefix || path.startsWith(prefix + '/')
  );
}

/**
 * Referencia corta del bloqueo. Va en la respuesta y en el log, así el
 * owner encuentra en el log exactamente qué regla saltó sin que la
 * respuesta le diga a un atacante qué patrón esquivar.
 */
function blockReference(): string {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

/** Bloquea la request dejando rastro para poder diagnosticarla después */
function blockRequest(
  req: Request,
  res: Response,
  type: string,
  reason: string,
  detail: { field?: string; sample?: string; pattern?: string } = {},
  status = 400
) {
  const reference = blockReference();
  wafStats.blockedRequests++;
  logWafEvent(req, type, `${reason} | ref: ${reference}`, true);
  recordEvent({
    reference,
    at: new Date().toISOString(),
    type,
    method: req.method,
    path: req.path,
    ip: getClientIP(req),
    userAgent: (req.headers['user-agent'] || '').toString().slice(0, 160),
    field: detail.field,
    sample: detail.sample,
    pattern: detail.pattern,
    blocked: true,
  });
  return res.status(status).json({
    success: false,
    message: 'Invalid request',
    code: 'WAF_BLOCKED',
    reference,
  });
}

export function wafMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!WAF_CONFIG.enabled) {
    return next();
  }

  // Skip WAF entirely in development - only enforce in production
  if (process.env.NODE_ENV !== 'production') {
    return next();
  }

  // Exempt health check and other monitoring paths
  if (WAF_EXEMPT_PATHS.includes(req.path)) {
    return next();
  }

  wafStats.totalRequests++;
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || '';

  // 1. Check whitelist (normalize IPv6-mapped IPv4 like ::ffff:127.0.0.1)
  const normalizedIP = ip.replace(/^::ffff:/, '');
  if (whitelistedIPs.has(ip) || whitelistedIPs.has(normalizedIP)) {
    return next();
  }

  // 2. Check blacklist
  if (isBlacklisted(ip) || isBlacklisted(normalizedIP)) {
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
      blacklistIP(ip);
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
      blacklistIP(ip);
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

  // Los callbacks OAuth traen parámetros de un tercero: se les aplica todo
  // lo anterior, pero no el escaneo de contenido que sigue.
  if (skipsContentScan(req.path)) {
    return next();
  }

  // 8. Check header injection
  if (checkHeaderInjection(req)) {
    ipState.violations++;
    logWafEvent(req, 'HEADER_INJECTION', 'CRLF injection attempt', !WAF_CONFIG.blockMode ? false : true);
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'HEADER_INJECTION', 'CRLF injection attempt');
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
    wafStats.zeroDay++;
    if (WAF_CONFIG.blockMode) {
      // Bloqueo temporal, no definitivo: un falso positivo no puede dejar a
      // un usuario fuera de la plataforma hasta que se reinicie el proceso.
      blacklistIP(ip, ZERO_DAY_BLOCK_MS);
      return blockRequest(req, res, 'ZERO_DAY', `Pattern: ${zeroDay.pattern}`, { field: zeroDay.field, sample: zeroDay.sample, pattern: zeroDay.pattern });
    }
    logWafEvent(req, 'ZERO_DAY', `Pattern: ${zeroDay.pattern}`, false);
  }

  // 11. SQL Injection
  const sqlResult = inspectValue(allInputs, SQL_INJECTION_PATTERNS, 'SQL_INJECTION');
  if (sqlResult.matched) {
    ipState.violations++;
    wafStats.sqlInjectionAttempts++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'SQL_INJECTION', `Pattern: ${sqlResult.pattern}`, { field: sqlResult.field, sample: sqlResult.sample, pattern: sqlResult.pattern });
    }
    logWafEvent(req, 'SQL_INJECTION', `Pattern: ${sqlResult.pattern}`, false);
  }

  // 12. NoSQL Injection
  const nosqlResult = inspectValue(allInputs, NOSQL_INJECTION_PATTERNS, 'NOSQL_INJECTION');
  if (nosqlResult.matched) {
    ipState.violations++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'NOSQL_INJECTION', `Pattern: ${nosqlResult.pattern}`, { field: nosqlResult.field, sample: nosqlResult.sample, pattern: nosqlResult.pattern });
    }
    logWafEvent(req, 'NOSQL_INJECTION', `Pattern: ${nosqlResult.pattern}`, false);
  }

  // 13. XSS
  const xssResult = inspectValue(allInputs, XSS_PATTERNS, 'XSS');
  if (xssResult.matched) {
    ipState.violations++;
    wafStats.xssAttempts++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'XSS', `Pattern: ${xssResult.pattern}`, { field: xssResult.field, sample: xssResult.sample, pattern: xssResult.pattern });
    }
    logWafEvent(req, 'XSS', `Pattern: ${xssResult.pattern}`, false);
  }

  // 14. Path Traversal
  const pathResult = inspectValue(allInputs, PATH_TRAVERSAL_PATTERNS, 'PATH_TRAVERSAL');
  if (pathResult.matched) {
    ipState.violations++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'PATH_TRAVERSAL', `Pattern: ${pathResult.pattern}`, { field: pathResult.field, sample: pathResult.sample, pattern: pathResult.pattern });
    }
    logWafEvent(req, 'PATH_TRAVERSAL', `Pattern: ${pathResult.pattern}`, false);
  }

  // 15. Command Injection
  const cmdResult = inspectValue(allInputs, COMMAND_INJECTION_PATTERNS, 'CMD_INJECTION');
  if (cmdResult.matched) {
    ipState.violations++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'CMD_INJECTION', `Pattern: ${cmdResult.pattern}`, { field: cmdResult.field, sample: cmdResult.sample, pattern: cmdResult.pattern });
    }
    logWafEvent(req, 'CMD_INJECTION', `Pattern: ${cmdResult.pattern}`, false);
  }

  // 16. SSRF
  const ssrfResult = checkSSRF(allInputs.query);
  if (ssrfResult.matched) {
    ipState.violations++;
    if (WAF_CONFIG.blockMode) {
      return blockRequest(req, res, 'SSRF', `Pattern: ${ssrfResult.pattern}`, { field: ssrfResult.field, sample: ssrfResult.sample, pattern: ssrfResult.pattern });
    }
    logWafEvent(req, 'SSRF', `Pattern: ${ssrfResult.pattern}`, false);
  }

  // 17. XXE (for XML content)
  const contentType = req.headers['content-type'] || '';
  if (contentType.includes('xml')) {
    const xxeResult = inspectValue(req.body, XXE_PATTERNS, 'XXE');
    if (xxeResult.matched) {
      ipState.violations++;
      if (WAF_CONFIG.blockMode) {
        return blockRequest(req, res, 'XXE', `Pattern: ${xxeResult.pattern}`, { field: xxeResult.field, sample: xxeResult.sample, pattern: xxeResult.pattern });
      }
      logWafEvent(req, 'XXE', `Pattern: ${xxeResult.pattern}`, false);
    }
  }

  // 18. LDAP Injection (if applicable)
  if (req.path.includes('ldap') || req.path.includes('search')) {
    const ldapResult = inspectValue(allInputs.query, LDAP_INJECTION_PATTERNS, 'LDAP_INJECTION');
    if (ldapResult.matched) {
      ipState.violations++;
      if (WAF_CONFIG.blockMode) {
        return blockRequest(req, res, 'LDAP_INJECTION', `Pattern: ${ldapResult.pattern}`, { field: ldapResult.field, sample: ldapResult.sample, pattern: ldapResult.pattern });
      }
      logWafEvent(req, 'LDAP_INJECTION', `Pattern: ${ldapResult.pattern}`, false);
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
export function blacklistIP(ip: string, durationMs = DEFAULT_BLOCK_MS): void {
  blacklistedIPs.set(ip, durationMs === Infinity ? Infinity : Date.now() + durationMs);
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
/**
 * Últimos bloqueos del WAF, del más reciente al más viejo.
 * Se filtran por referencia o por ruta para ir directo al caso que se
 * está investigando.
 */
export function getRecentWafEvents(
  options: { reference?: string; path?: string; limit?: number } = {}
): WafEvent[] {
  const { reference, path, limit = 50 } = options;
  return recentEvents
    .filter(e => !reference || e.reference === reference.toUpperCase())
    .filter(e => !path || e.path.includes(path))
    .slice(0, Math.min(limit, MAX_RECENT_EVENTS));
}

export function getBlockedIPs(): string[] {
  // Sólo las vigentes: las vencidas se descartan al consultarlas
  return Array.from(blacklistedIPs.keys()).filter(isBlacklisted);
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
export function getTemporarilyBlockedIPs(): Array<{ ip: string; blockedUntil: number; requests: number; botScore: number }> {
  const now = Date.now();
  const result: Array<{ ip: string; blockedUntil: number; requests: number; botScore: number }> = [];
  for (const [ip, state] of ipStates.entries()) {
    if (state.blocked && state.blockedUntil && state.blockedUntil > now) {
      result.push({ ip, blockedUntil: state.blockedUntil, requests: state.requests, botScore: state.botScore });
    }
  }
  return result.sort((a, b) => b.requests - a.requests);
}

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
