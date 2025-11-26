import { rabbitmqConnection } from "../config/rabbitmq";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface JobMessage {
  jobId: string;
  userId: string;
  s3Key: string;
  fileName: string;
  timestamp: string;
}

export class QueueService {
  /**
   * Publish a job to the processing queue
   */
  async publishJob(jobMessage: JobMessage): Promise<void> {
    try {
      await rabbitmqConnection.publishJob(jobMessage);

      logger.info("Job published to queue", {
        jobId: jobMessage.jobId,
        userId: jobMessage.userId,
        fileName: jobMessage.fileName,
      });
    } catch (error) {
      logger.error("Failed to publish job to queue", {
        error,
        jobId: jobMessage.jobId,
      });
      throw error;
    }
  }

  /**
   * Get queue statistics (useful for monitoring)
   */
  async getQueueStats(): Promise<{
    messageCount: number;
    consumerCount: number;
  }> {
    try {
      const channel = await rabbitmqConnection.getChannel();
      const queueInfo = await channel.checkQueue(env.RABBITMQ_QUEUE);

      return {
        messageCount: queueInfo.messageCount,
        consumerCount: queueInfo.consumerCount,
      };
    } catch (error) {
      logger.error("Failed to get queue stats", error);
      throw error;
    }
  }
}

export const queueService = new QueueService();
