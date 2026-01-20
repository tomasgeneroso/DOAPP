import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";

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

const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
];

// File size limits (in bytes)
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_DOCUMENT_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

// Upload directories
const UPLOAD_DIR = path.join(process.cwd(), "uploads");
const AVATAR_DIR = path.join(UPLOAD_DIR, "avatars");
const DOCUMENT_DIR = path.join(UPLOAD_DIR, "documents");
const PORTFOLIO_DIR = path.join(UPLOAD_DIR, "portfolio");
const DISPUTE_DIR = path.join(UPLOAD_DIR, "disputes");
const BLOG_DIR = path.join(UPLOAD_DIR, "blogs");

// Ensure directories exist
[UPLOAD_DIR, AVATAR_DIR, DOCUMENT_DIR, PORTFOLIO_DIR, DISPUTE_DIR, BLOG_DIR].forEach((dir) => {
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
 * File filter for dispute attachments (images, videos, documents)
 */
function disputeFileFilter(
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) {
  const allowedTypes = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES, ...ALLOWED_DOCUMENT_TYPES];

  if (!allowedTypes.includes(file.mimetype)) {
    callback(new Error("Tipo de archivo no permitido. Solo se permiten imágenes, videos y documentos."));
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
 * Storage configuration for blog images
 */
const blogStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, BLOG_DIR);
  },
  filename: (req, file, callback) => {
    const uniqueName = generateUniqueFilename(sanitizeFilename(file.originalname));
    callback(null, uniqueName);
  },
});

/**
 * Storage configuration for dispute attachments
 */
const disputeStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    callback(null, DISPUTE_DIR);
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
 * Upload middleware for cover image
 */
export const uploadCover = multer({
  storage: avatarStorage, // Reuse avatar storage
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
}).single("cover");

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
 * Upload middleware for dispute attachments (images, videos, documents)
 */
export const uploadDisputeAttachments = multer({
  storage: disputeStorage,
  fileFilter: disputeFileFilter,
  limits: {
    fileSize: MAX_VIDEO_SIZE, // Allow up to 50MB for videos
    files: 10, // Max 10 attachments per dispute
  },
}).array("attachments", 10);

/**
 * Upload middleware for post gallery (images and videos)
 */
export const uploadPostGallery = multer({
  storage: disputeStorage, // Reuse dispute storage for posts
  fileFilter: disputeFileFilter, // Allows images and videos
  limits: {
    fileSize: MAX_VIDEO_SIZE, // Allow up to 50MB for videos
    files: 10, // Max 10 files per post
  },
}).array("gallery", 10);

/**
 * Upload middleware for ticket attachments (images and PDFs)
 */
const ticketStorage = multer.diskStorage({
  destination: (req, file, callback) => {
    const uploadPath = path.join(UPLOAD_DIR, "tickets");
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    callback(null, uploadPath);
  },
  filename: (req, file, callback) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    callback(null, `${uniqueSuffix}-${file.originalname}`);
  },
});

// File filter for tickets: images and PDFs only
const ticketFileFilter = (
  req: Express.Request,
  file: Express.Multer.File,
  callback: multer.FileFilterCallback
) => {
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    callback(null, true);
  } else {
    callback(new Error("Solo se permiten imágenes (JPG, PNG, WebP) y archivos PDF"));
  }
};

export const uploadTicketAttachments = multer({
  storage: ticketStorage,
  fileFilter: ticketFileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max per file
    files: 5, // Max 5 attachments per ticket
  },
}).array("attachments", 5);

/**
 * Upload middleware for blog cover image (single)
 */
export const uploadBlogCover = multer({
  storage: blogStorage,
  fileFilter: imageFileFilter,
  limits: {
    fileSize: MAX_IMAGE_SIZE,
    files: 1,
  },
});

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
export function getFileUrl(filepath: string, req: any): string {
  const filename = path.basename(filepath);
  const directory = path.basename(path.dirname(filepath));
  const protocol = req.protocol || 'http';
  const host = req.get ? req.get("host") : 'localhost:5000';

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
  uploadDisputeAttachments,
  uploadTicketAttachments,
  uploadBlogCover,
  deleteFile,
  getFileUrl,
  verifyFile,
  cleanupOldFiles,
  UPLOAD_DIR,
  AVATAR_DIR,
  DOCUMENT_DIR,
  PORTFOLIO_DIR,
  DISPUTE_DIR,
  BLOG_DIR,
};
