import { Router, Request, Response, NextFunction } from "express";
import { jobService } from "../services/job.service";
import { authenticate } from "../middleware/auth";
import { validateQuery } from "../middleware/validateRequest";
import { jobValidators } from "../utils/validators";
import Joi from "joi";

const router = Router();

router.get(
  "/:jobId",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const userId = req.user!.id;

      const jobStatus = await jobService.getJobStatus(jobId, userId);

      res.status(200).json({
        success: true,
        data: jobStatus,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/",
  authenticate,
  validateQuery(jobValidators.listJobs),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user!.id;
      const { limit, offset } = req.query as any;

      const result = await jobService.getUserJobs(
        userId,
        parseInt(limit),
        parseInt(offset)
      );

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

router.get(
  "/:jobId/report",
  authenticate,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { jobId } = req.params;
      const userId = req.user!.id;

      const report = await jobService.getJobReport(jobId, userId);

      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
