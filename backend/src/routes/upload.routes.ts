import { Router, Request, Response, NextFunction } from "express";
import { s3Service } from "../services/s3.service";
import { jobService } from "../services/job.service";
import { authenticate } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { uploadValidators } from "../utils/validators";

const router = Router();

router.post(
  "/presigned-url",
  authenticate,
  validateRequest(uploadValidators.presignedUrl),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { fileName, fileSize, contentType } = req.body;
      const userId = req.user!.id;

      // Generate presigned URL
      const { uploadUrl, s3Key } = await s3Service.generatePresignedUploadUrl(
        userId,
        fileName,
        fileSize,
        contentType
      );

      // Create job in database
      const job = await jobService.createJob(userId, s3Key, fileName, fileSize);

      // Calculate expiration time
      const expiresAt = new Date(Date.now() + 3600 * 1000);

      res.status(200).json({
        success: true,
        message: "Presigned URL generated successfully",
        data: {
          uploadUrl,
          jobId: job.id,
          s3Key,
          expiresAt,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
