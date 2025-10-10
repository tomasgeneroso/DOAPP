import sharp from "sharp";
import path from "path";
import fs from "fs/promises";

/**
 * Image Optimization Service
 * Uses Sharp library for image processing
 */
class ImageOptimizationService {
  private readonly maxWidth = 1920;
  private readonly maxHeight = 1080;
  private readonly quality = 85;
  private readonly thumbnailSize = 300;

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
