import { JobStatus } from "@prisma/client";
import { prisma } from "../config/database";
import { cacheHelper } from "../config/redis";
import { ApiError } from "../utils/ApiError";
import { logger } from "../utils/logger";
import { queueService, JobMessage } from "./queue.service";
import { s3Service } from "./s3.service";

export class JobService {
  async createJob(
    userId: string,
    s3Key: string,
    fileName: string,
    fileSize: number
  ) {
    try {
      const job = await prisma.job.create({
        data: {
          userId,
          s3Key,
          fileName,
          fileSize,
          status: JobStatus.PENDING,
        },
      });

      // Publish job to RabbitMQ queue
      const jobMessage: JobMessage = {
        jobId: job.id,
        userId,
        s3Key,
        fileName,
        timestamp: new Date().toISOString(),
      };

      await queueService.publishJob(jobMessage);

      // Cache job status
      await cacheHelper.set(
        `job:${job.id}`,
        {
          id: job.id,
          status: job.status,
          fileName: job.fileName,
        },
        3600
      );

      logger.info("Job created and queued", {
        jobId: job.id,
        userId,
        fileName,
      });

      return job;
    } catch (error) {
      logger.error("Failed to create job", error);
      throw ApiError.internal("Failed to create job");
    }
  }

  async getJobStatus(jobId: string, userId: string) {
    // Try cache first
    const cachedJob = await cacheHelper.get<any>(`job:${jobId}`);

    if (cachedJob) {
      return cachedJob;
    }

    // Get from database
    const job = await prisma.job.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw ApiError.notFound("Job not found");
    }

    if (job.userId !== userId) {
      throw ApiError.forbidden("Access denied");
    }

    const jobStatus = {
      id: job.id,
      status: job.status,
      fileName: job.fileName,
      createdAt: job.createdAt,
      completedAt: job.completedAt,
      errorMessage: job.errorMessage,
    };

    // Update cache
    await cacheHelper.set(`job:${jobId}`, jobStatus, 3600);

    return jobStatus;
  }

  async getUserJobs(userId: string, limit = 10, offset = 0) {
    const jobs = await prisma.job.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        fileName: true,
        status: true,
        createdAt: true,
        completedAt: true,
        errorMessage: true,
      },
    });

    const total = await prisma.job.count({ where: { userId } });

    return { jobs, total };
  }

  async getJobReport(jobId: string, userId: string) {
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      include: { report: true },
    });

    if (!job) {
      throw ApiError.notFound("Job not found");
    }

    if (job.userId !== userId) {
      throw ApiError.forbidden("Access denied");
    }

    if (!job.report) {
      throw ApiError.notFound("Report not yet generated");
    }

    return job.report;
  }
}

export const jobService = new JobService();
