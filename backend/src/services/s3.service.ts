import {
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { v4 as uuidv4 } from "uuid";
import { s3Client, S3_CONFIG } from "../config/aws";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";

export class S3Service {
  /**
   * Generate a presigned URL for uploading files directly to S3
   * This allows the client to upload files without going through the backend
   */
  async generatePresignedUploadUrl(
    userId: string,
    fileName: string,
    fileSize: number,
    contentType: string
  ): Promise<{ uploadUrl: string; s3Key: string }> {
    // Validate file size
    if (fileSize > S3_CONFIG.maxFileSize) {
      throw ApiError.badRequest(
        `File size exceeds maximum allowed size of ${
          S3_CONFIG.maxFileSize / (1024 * 1024)
        }MB`
      );
    }

    // Validate content type
    if (!S3_CONFIG.allowedMimeTypes.includes(contentType)) {
      throw ApiError.badRequest(
        `Invalid file type. Only ${S3_CONFIG.allowedMimeTypes.join(
          ", "
        )} are allowed`
      );
    }

    // Generate unique S3 key with proper structure
    const fileExtension = this.getFileExtension(fileName);
    const timestamp = Date.now();
    const uniqueId = uuidv4();
    const s3Key = `uploads/${userId}/${timestamp}-${uniqueId}.${fileExtension}`;

    try {
      // Create PutObject command
      const command = new PutObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
        ContentType: contentType,
        ContentLength: fileSize,
        Metadata: {
          "uploaded-by": userId,
          "original-filename": fileName,
          "upload-timestamp": new Date().toISOString(),
        },
      });

      // Generate presigned URL
      const uploadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: S3_CONFIG.presignedUrlExpiry,
      });

      logger.info("Generated presigned upload URL", {
        userId,
        s3Key,
        fileName,
        fileSize,
      });

      return { uploadUrl, s3Key };
    } catch (error) {
      logger.error("Failed to generate presigned URL", {
        error,
        userId,
        fileName,
      });
      throw ApiError.internal("Failed to generate upload URL");
    }
  }

  /**
   * Generate a presigned URL for downloading files from S3
   */
  async generatePresignedDownloadUrl(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
      });

      const downloadUrl = await getSignedUrl(s3Client, command, {
        expiresIn: S3_CONFIG.presignedUrlExpiry,
      });

      logger.info("Generated presigned download URL", { s3Key });

      return downloadUrl;
    } catch (error) {
      logger.error("Failed to generate download URL", { error, s3Key });
      throw ApiError.internal("Failed to generate download URL");
    }
  }

  /**
   * Check if a file exists in S3
   */
  async fileExists(s3Key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
      });

      await s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === "NotFound") {
        return false;
      }
      logger.error("Error checking file existence", { error, s3Key });
      throw error;
    }
  }

  /**
   * Get the public S3 URL for a key (without presigning)
   */
  getS3Url(s3Key: string): string {
    return `https://${S3_CONFIG.bucket}.s3.${S3_CONFIG.region}.amazonaws.com/${s3Key}`;
  }

  /**
   * Get file metadata from S3
   */
  async getFileMetadata(s3Key: string): Promise<{
    size: number;
    contentType: string;
    lastModified: Date;
    metadata: Record<string, string>;
  }> {
    try {
      const command = new HeadObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
      });

      const response = await s3Client.send(command);

      return {
        size: response.ContentLength || 0,
        contentType: response.ContentType || "application/octet-stream",
        lastModified: response.LastModified || new Date(),
        metadata: response.Metadata || {},
      };
    } catch (error) {
      logger.error("Error getting file metadata", { error, s3Key });
      throw ApiError.notFound("File not found in S3");
    }
  }

  /**
   * Extract file extension from filename
   */
  private getFileExtension(fileName: string): string {
    const parts = fileName.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "pdf";
  }

  /**
   * Validate S3 key format
   */
  validateS3Key(s3Key: string): boolean {
    // Basic validation - key should start with uploads/ and contain user ID
    const pattern = /^uploads\/[a-f0-9-]{36}\/\d+-[a-f0-9-]{36}\.(pdf|PDF)$/;
    return pattern.test(s3Key);
  }
}

export const s3Service = new S3Service();
