import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import { Request } from "express";

/**
 * File upload middleware with security validations
 * Validates MIME types, file sizes, and sanitizes filenames
 */

// Allowed MIME types
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
];

const ALLOWED_DOCUMENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB

// Upload directories
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const DOCUMENT_DIR = path.join(UPLOAD_DIR, "documents");
const PORTFOLIO_DIR = path.join(UPLOAD_DIR, "portfolio");

// Ensure directories exist
[UPLOAD_DIR, AVATAR_DIR, DOCUMENT_DIR, PORTFOLIO_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

/**
 * Sanitize filename to prevent directory traversal
 */
function sanitizeFilename(filename: string): string {
  // Remove directory traversal patterns
  let sanitized = filename.replace(/\.\./g, "");

  // Remove special characters except dots and dashes
  sanitized = sanitized.replace(/[^a-zA-Z0-9.-]/g, "_");

  // Limit length
  const ext = path.extname(sanitized);
  const name = path.basename(sanitized, ext);

  return `${name.substring(0, 50)}${ext}`;
}

/**
 * Generate unique filename
 */
function generateUniqueFilename(originalname: string): string {
  const ext = path.extname(originalname);
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString("hex");

  return `${timestamp}-${randomString}${ext}`;
}

/**
 * File filter for images
 */
function imageFileFilter(
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    callback(new Error("Tipo de archivo no permitido. Solo se permiten imágenes."));
    return;
  }
  callback(null, true);
}

/**
 * File filter for documents
 */
function documentFileFilter(
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.mimetype)) {
    callback(new Error("Tipo de archivo no permitido. Solo se permiten documentos."));
    return;
  }
  callback(null, true);
}

/**
 * File filter for all allowed types
 */
function allFilesFilter(
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_DOCUMENT_TYPES];

  if (!allowedTypes.includes(file.mimetype)) {
    callback(new Error("Tipo de archivo no permitido"));
    return;
  }
  callback(null, true);
}

/**
 * Storage configuration for avatars
 */
const avatarStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, AVATAR_DIR);
  },
  filename: (req, file, callback) => {
    const uniqueName = generateUniqueFilename(sanitizeFilename(file.originalname));
    callback(null, uniqueName);
  },
});

/**
 * Storage configuration for documents
 */
const documentStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, DOCUMENT_DIR);
  },
  filename: (req, file, callback) => {
    const uniqueName = generateUniqueFilename(sanitizeFilename(file.originalname));
    callback(null, uniqueName);
  },
});

/**
 * Storage configuration for portfolio images
 */
const portfolioStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, PORTFOLIO_DIR);
  },
  filename: (req, file, callback) => {
    const uniqueName = generateUniqueFilename(sanitizeFilename(file.originalname));
    callback(null, uniqueName);
  },
});

/**
 * Upload middleware for avatar images
 */
export const uploadAvatar = multer({
  storage: avatarStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
}).single("avatar");

/**
 * Upload middleware for documents
 */
export const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 1,
  },
}).single("document");

/**
 * Upload middleware for portfolio images (multiple)
 */
export const uploadPortfolio = multer({
  storage: portfolioStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 10, // Max 10 images
  },
}).array("images", 10);

/**
 * Upload middleware for mixed files
 */
export const uploadMixed = multer({
  storage: documentStorage,
  fileFilter: allFilesFilter,
  limits: {
    fileSize: MAX_DOCUMENT_SIZE,
    files: 5,
  },
}).array("files", 5);

/**
 * Delete uploaded file
 */
export function deleteFile(filepath: string): void {
  try {
    if (fs.existsSync(filepath)) {
      fs.unlinkSync(filepath);
      console.log(`[Upload] Deleted file: ${filepath}`);
    }
  } catch (error) {
    console.error(`[Upload] Error deleting file: ${filepath}`, error);
  }
}

/**
 * Get file URL from filepath
 */
export function getFileUrl(filepath: string, req: Request): string {
  const filename = path.basename(filepath);
  const directory = path.basename(path.dirname(filepath));
  const protocol = req.protocol;
  const host = req.get("host") || "localhost";

  return `${protocol}://${host}/uploads/${directory}/${filename}`;
}

/**
 * Verify file exists and is accessible
 */
export function verifyFile(filepath: string): boolean {
  try {
    return fs.existsSync(filepath) && fs.statSync(filepath).isFile();
  } catch (error) {
    return false;
  }
}

/**
 * Cleanup old files (for maintenance)
 */
export async function cleanupOldFiles(directory: string, daysOld: number = 90): Promise<number> {
  try {
    const files = fs.readdirSync(directory);
    const now = Date.now();
    const cutoffTime = now - daysOld * 24 * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      const filepath = path.join(directory, file);
      const stats = fs.statSync(filepath);

      if (stats.isFile() && stats.mtimeMs < cutoffTime) {
        fs.unlinkSync(filepath);
        deletedCount++;
      }
    }

    console.log(`[Upload] Cleaned up ${deletedCount} old files from ${directory}`);
    return deletedCount;
  } catch (error) {
    console.error(`[Upload] Error cleaning up files:`, error);
    return 0;
  }
}

export default {
  uploadAvatar,
  uploadDocument,
  uploadPortfolio,
  uploadMixed,
  deleteFile,
  getFileUrl,
  verifyFile,
  cleanupOldFiles,
  UPLOAD_DIR,
  AVATAR_DIR,
  DOCUMENT_DIR,
  PORTFOLIO_DIR,
};
