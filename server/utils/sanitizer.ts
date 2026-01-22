import DOMPurify from "isomorphic-dompurify";

/**
 * Sanitizer Utility
 * Provides HTML and text sanitization for user-generated content
 */

/**
 * Sanitize HTML content
 * Removes potentially dangerous HTML/JavaScript
 */
export function sanitizeHTML(dirty: string): string {
  if (!dirty || typeof dirty !== "string") return "";

  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: [
      "b",
      "i",
      "em",
      "strong",
      "a",
      "p",
      "br",
      "ul",
      "ol",
      "li",
      "code",
      "pre",
      "blockquote",
    ],
    ALLOWED_ATTR: ["href", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/**
 * Sanitize chat message
 * Allows very limited HTML for chat
 */
export function sanitizeChatMessage(message: string): string {
  if (!message || typeof message !== "string") return "";

  // For chat, we want to be more restrictive
  return DOMPurify.sanitize(message, {
    ALLOWED_TAGS: ["b", "i", "em", "strong", "code"],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitize plain text (strip all HTML)
 */
export function sanitizePlainText(text: string): string {
  if (!text || typeof text !== "string") return "";

  return DOMPurify.sanitize(text, {
    ALLOWED_TAGS: [],
    KEEP_CONTENT: true,
  });
}

/**
 * Sanitize URL
 */
export function sanitizeURL(url: string): string {
  if (!url || typeof url !== "string") return "";

  // Remove javascript: and data: URLs
  const urlLower = url.toLowerCase().trim();
  if (
    urlLower.startsWith("javascript:") ||
    urlLower.startsWith("data:") ||
    urlLower.startsWith("vbscript:")
  ) {
    return "";
  }

  return DOMPurify.sanitize(url);
}

/**
 * Sanitize filename
 * Removes path traversal attempts and dangerous characters
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || typeof filename !== "string") return "";

  // Remove path traversal attempts
  let clean = filename.replace(/\.\./g, "");
  clean = clean.replace(/[\/\\]/g, "");

  // Remove dangerous characters
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, "_");

  // Limit length
  if (clean.length > 255) {
    const ext = clean.split(".").pop();
    const name = clean.substring(0, 255 - (ext?.length || 0) - 1);
    clean = `${name}.${ext}`;
  }

  return clean;
}

/**
 * Sanitize email
 */
export function sanitizeEmail(email: string): string {
  if (!email || typeof email !== "string") return "";

  return email.toLowerCase().trim();
}

/**
 * Escape special regex characters
 */
export function escapeRegex(str: string): string {
  if (!str || typeof str !== "string") return "";

  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Validate and sanitize JSON
 */
export function sanitizeJSON(json: string, maxDepth: number = 5): any {
  if (!json || typeof json !== "string") return null;

  try {
    const parsed = JSON.parse(json);

    // Check depth to prevent deeply nested objects
    function checkDepth(obj: any, depth: number = 0): boolean {
      if (depth > maxDepth) return false;

      if (typeof obj === "object" && obj !== null) {
        for (const key in obj) {
          if (!checkDepth(obj[key], depth + 1)) {
            return false;
          }
        }
      }

      return true;
    }

    if (!checkDepth(parsed)) {
      throw new Error("JSON too deeply nested");
    }

    return parsed;
  } catch (error) {
    console.error("JSON sanitization error:", error);
    return null;
  }
}

/**
 * Truncate text to specified length
 */
export function truncateText(text: string, maxLength: number = 1000): string {
  if (!text || typeof text !== "string") return "";

  if (text.length <= maxLength) return text;

  return text.substring(0, maxLength) + "...";
}

/**
 * Remove excessive whitespace
 */
export function normalizeWhitespace(text: string): string {
  if (!text || typeof text !== "string") return "";

  return text.replace(/\s+/g, " ").trim();
}

/**
 * Sanitize user input (general purpose)
 */
export function sanitizeInput(input: string, options?: {
  maxLength?: number;
  allowHTML?: boolean;
  preserveNewlines?: boolean;
}): string {
  if (!input || typeof input !== "string") return "";

  const {
    maxLength = 10000,
    allowHTML = false,
    preserveNewlines = false,
  } = options || {};

  let sanitized = input;

  // Sanitize HTML if not allowed
  if (!allowHTML) {
    sanitized = sanitizePlainText(sanitized);
  } else {
    sanitized = sanitizeHTML(sanitized);
  }

  // Normalize whitespace unless preserving newlines
  if (!preserveNewlines) {
    sanitized = normalizeWhitespace(sanitized);
  }

  // Truncate if necessary
  if (sanitized.length > maxLength) {
    sanitized = truncateText(sanitized, maxLength);
  }

  return sanitized.trim();
}

/**
 * UUID validation regex
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validate UUID
 * Returns true if the id is a valid UUID v4
 */
export function isValidUUID(id: any): boolean {
  return typeof id === 'string' && id.length > 0 && UUID_REGEX.test(id);
}

/**
 * Validate and return UUID or null
 * Returns the UUID if valid, null otherwise
 */
export function validateUUID(id: any): string | null {
  if (isValidUUID(id)) {
    return id;
  }
  return null;
}

/**
 * Check if a value is a non-empty string (useful for optional IDs)
 */
export function isNonEmptyString(value: any): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

export default {
  sanitizeHTML,
  sanitizeChatMessage,
  sanitizePlainText,
  sanitizeURL,
  sanitizeFilename,
  sanitizeEmail,
  escapeRegex,
  sanitizeJSON,
  truncateText,
  normalizeWhitespace,
  sanitizeInput,
  isValidUUID,
  validateUUID,
  isNonEmptyString,
};
