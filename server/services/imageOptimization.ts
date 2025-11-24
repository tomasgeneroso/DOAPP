import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import fsSync from "fs";

/**
 * Image Optimization Service
 * Uses Sharp library for image processing
 * Provides automatic compression and format optimization
 */
class ImageOptimizationService {
  private readonly maxWidth = 1920;
  private readonly maxHeight = 1080;
  private readonly quality = 85;
  private readonly thumbnailSize = 300;
  private readonly avatarSize = 400;

  // Size limits for different types
  private readonly MAX_AVATAR_SIZE = 200 * 1024; // 200KB after optimization
  private readonly MAX_PORTFOLIO_SIZE = 500 * 1024; // 500KB after optimization
  private readonly MAX_DOCUMENT_SIZE = 2 * 1024 * 1024; // 2MB

  /**
   * Get total storage used by uploads
   */
  async getStorageStats(): Promise<{
    totalSize: number;
    fileCount: number;
    byDirectory: Record<string, { size: number; count: number }>;
  }> {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const stats: Record<string, { size: number; count: number }> = {};
    let totalSize = 0;
    let fileCount = 0;

    try {
      const directories = await fs.readdir(uploadDir);

      for (const dir of directories) {
        const dirPath = path.join(uploadDir, dir);
        const stat = await fs.stat(dirPath);

        if (stat.isDirectory()) {
          const files = await fs.readdir(dirPath);
          let dirSize = 0;

          for (const file of files) {
            const filePath = path.join(dirPath, file);
            const fileStat = await fs.stat(filePath);
            if (fileStat.isFile()) {
              dirSize += fileStat.size;
              fileCount++;
            }
          }

          stats[dir] = { size: dirSize, count: files.length };
          totalSize += dirSize;
        }
      }

      return { totalSize, fileCount, byDirectory: stats };
    } catch (error) {
      console.error('Error getting storage stats:', error);
      return { totalSize: 0, fileCount: 0, byDirectory: {} };
    }
  }

  /**
   * Format bytes to human readable
   */
  formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Clean up temporary and orphaned files
   */
  async cleanupOrphanedFiles(maxAgeDays: number = 7): Promise<{ deleted: number; freedSpace: number }> {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const tempDir = path.join(uploadDir, 'temp');
    let deleted = 0;
    let freedSpace = 0;
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    try {
      // Clean temp directory
      if (fsSync.existsSync(tempDir)) {
        const files = await fs.readdir(tempDir);
        for (const file of files) {
          const filePath = path.join(tempDir, file);
          const stat = await fs.stat(filePath);
          if (now - stat.mtimeMs > maxAge) {
            freedSpace += stat.size;
            await fs.unlink(filePath);
            deleted++;
          }
        }
      }

      return { deleted, freedSpace };
    } catch (error) {
      console.error('Error cleaning up orphaned files:', error);
      return { deleted: 0, freedSpace: 0 };
    }
  }

  /**
   * Optimize an image file
   */
  async optimizeImage(
    inputPath: string,
    outputPath?: string
  ): Promise<{
    path: string;
    size: number;
    width: number;
    height: number;
  }> {
    try {
      const finalOutputPath = outputPath || inputPath;

      // Get image metadata
      const metadata = await sharp(inputPath).metadata();

      // Determine if resizing is needed
      const needsResize =
        metadata.width! > this.maxWidth ||
        metadata.height! > this.maxHeight;

      let pipeline = sharp(inputPath);

      // Resize if necessary
      if (needsResize) {
        pipeline = pipeline.resize(this.maxWidth, this.maxHeight, {
          fit: "inside",
          withoutEnlargement: true,
        });
      }

      // Convert to appropriate format and compress
      if (metadata.format === "png") {
        pipeline = pipeline.png({
          quality: this.quality,
          compressionLevel: 9,
        });
      } else if (metadata.format === "jpeg" || metadata.format === "jpg") {
        pipeline = pipeline.jpeg({
          quality: this.quality,
          progressive: true,
          mozjpeg: true,
        });
      } else if (metadata.format === "webp") {
        pipeline = pipeline.webp({
          quality: this.quality,
        });
      } else {
        // Convert unsupported formats to JPEG
        pipeline = pipeline.jpeg({
          quality: this.quality,
          progressive: true,
        });
      }

      // Save optimized image
      const info = await pipeline.toFile(finalOutputPath);

      return {
        path: finalOutputPath,
        size: info.size,
        width: info.width,
        height: info.height,
      };
    } catch (error: any) {
      console.error("Image optimization error:", error.message);
      throw new Error("Failed to optimize image");
    }
  }

  /**
   * Create thumbnail for an image
   */
  async createThumbnail(
    inputPath: string,
    outputPath: string
  ): Promise<{
    path: string;
    size: number;
  }> {
    try {
      const info = await sharp(inputPath)
        .resize(this.thumbnailSize, this.thumbnailSize, {
          fit: "cover",
          position: "center",
        })
        .jpeg({
          quality: 80,
          progressive: true,
        })
        .toFile(outputPath);

      return {
        path: outputPath,
        size: info.size,
      };
    } catch (error: any) {
      console.error("Thumbnail creation error:", error.message);
      throw new Error("Failed to create thumbnail");
    }
  }

  /**
   * Convert image to WebP format
   */
  async convertToWebP(
    inputPath: string,
    outputPath?: string
  ): Promise<{
    path: string;
    size: number;
  }> {
    try {
      const webpPath =
        outputPath ||
        inputPath.replace(path.extname(inputPath), ".webp");

      const info = await sharp(inputPath)
        .webp({
          quality: this.quality,
        })
        .toFile(webpPath);

      return {
        path: webpPath,
        size: info.size,
      };
    } catch (error: any) {
      console.error("WebP conversion error:", error.message);
      throw new Error("Failed to convert to WebP");
    }
  }

  /**
   * Get image metadata
   */
  async getMetadata(filePath: string): Promise<sharp.Metadata> {
    try {
      return await sharp(filePath).metadata();
    } catch (error: any) {
      console.error("Get metadata error:", error.message);
      throw new Error("Failed to get image metadata");
    }
  }

  /**
   * Validate image file
   */
  async validateImage(filePath: string): Promise<boolean> {
    try {
      const metadata = await sharp(filePath).metadata();

      // Check if it's a valid image format
      const validFormats = ["jpeg", "jpg", "png", "webp", "gif"];
      if (!metadata.format || !validFormats.includes(metadata.format)) {
        return false;
      }

      // Check dimensions
      if (!metadata.width || !metadata.height) {
        return false;
      }

      // Check minimum dimensions (at least 100x100)
      if (metadata.width < 100 || metadata.height < 100) {
        return false;
      }

      // Check maximum dimensions (max 10000x10000)
      if (metadata.width > 10000 || metadata.height > 10000) {
        return false;
      }

      return true;
    } catch (error: any) {
      console.error("Image validation error:", error.message);
      return false;
    }
  }

  /**
   * Process uploaded avatar
   */
  async processAvatar(
    inputPath: string,
    outputPath: string
  ): Promise<{
    path: string;
    size: number;
  }> {
    try {
      const info = await sharp(inputPath)
        .resize(400, 400, {
          fit: "cover",
          position: "center",
        })
        .jpeg({
          quality: 90,
          progressive: true,
        })
        .toFile(outputPath);

      return {
        path: outputPath,
        size: info.size,
      };
    } catch (error: any) {
      console.error("Avatar processing error:", error.message);
      throw new Error("Failed to process avatar");
    }
  }

  /**
   * Batch optimize images in a directory
   */
  async batchOptimize(
    inputDir: string,
    outputDir: string
  ): Promise<{ processed: number; errors: number }> {
    try {
      const files = await fs.readdir(inputDir);
      const imageExtensions = [".jpg", ".jpeg", ".png", ".webp"];

      let processed = 0;
      let errors = 0;

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (!imageExtensions.includes(ext)) continue;

        const inputPath = path.join(inputDir, file);
        const outputPath = path.join(outputDir, file);

        try {
          await this.optimizeImage(inputPath, outputPath);
          processed++;
        } catch (error) {
          errors++;
          console.error(`Failed to optimize ${file}`);
        }
      }

      return { processed, errors };
    } catch (error: any) {
      console.error("Batch optimization error:", error.message);
      throw new Error("Failed to batch optimize images");
    }
  }
}

export default new ImageOptimizationService();
