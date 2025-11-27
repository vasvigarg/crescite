import { parentPort, workerData } from "worker_threads";
import { PrismaClient } from "@prisma/client";
import amqp from "amqplib";
import { env } from "../config/env";
import { PDFParser } from "./pdf-parser";
import { PowerScoreCalculator } from "./power-score-calculator";
import { calculateRebalance } from "./rebalance-calculator";
import {
  buildReportDTO,
  buildPowerScoreSummaryDTO,
} from "./mappers/report.mapper";
import { s3Client, S3_CONFIG } from "../config/aws";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { cacheHelper } from "../config/redis";

const prisma = new PrismaClient();
const pdfParser = new PDFParser();
const powerScoreCalculator = new PowerScoreCalculator();

const workerId = workerData.workerId;

async function processJob(jobMessage: any) {
  const { jobId, userId, s3Key, fileName } = jobMessage;

  parentPort?.postMessage({
    type: "start",
    jobId,
    workerId,
  });

  try {
    // Update job status to PROCESSING
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "PROCESSING",
        processedBy: `worker-${workerId}`,
      },
    });
    // Invalidate cache
    await cacheHelper.del(`job:${jobId}`);

    // Step 1: Download file from S3
    console.log(`[Worker ${workerId}] Downloading file from S3: ${s3Key}`);
    const fileBuffer = await downloadFromS3(s3Key);

    // Step 2: Parse PDF and extract transaction lots
    console.log(`[Worker ${workerId}] Parsing PDF...`);
    const lots = await pdfParser.parseCAS(fileBuffer, userId, jobId);

    // Step 3: Save lots to database
    console.log(
      `[Worker ${workerId}] Saving ${lots.length} lots to database...`
    );
    await prisma.lot.createMany({
      data: lots,
    });

    // Step 4: Calculate Power Scores
    console.log(`[Worker ${workerId}] Calculating Power Scores...`);
    const powerScores = await powerScoreCalculator.calculate(userId, lots);

    // Step 5: Generate report using DTOs (JSON-safe)
    console.log(`[Worker ${workerId}] Generating report...`);
    const rebalance = calculateRebalance(lots);
    const reportData = buildReportDTO(lots, powerScores, rebalance);
    const powerScoreSummary = buildPowerScoreSummaryDTO(powerScores);

    // Step 6: Save report to database
    await prisma.report.create({
      data: {
        jobId,
        userId,
        reportData: reportData as any, // Prisma Json type
        powerScoreSummary: powerScoreSummary as any, // Prisma Json type
        totalInvestment: reportData.summary.totalInvestment,
      },
    });

    // Step 7: Update job status to COMPLETED
    await prisma.job.update({
      where: { id: jobId },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });
    // Invalidate cache
    await cacheHelper.del(`job:${jobId}`);

    console.log(`[Worker ${workerId}] Job ${jobId} completed successfully`);

    parentPort?.postMessage({
      type: "complete",
      jobId,
      workerId,
    });
  } catch (error: any) {
    console.error(`[Worker ${workerId}] Job ${jobId} failed:`, error);

    // Update job status to FAILED
    try {
      console.log(
        `[Worker ${workerId}] Updating job status to FAILED in database...`
      );
      const updatedJob = await prisma.job.update({
        where: { id: jobId },
        data: {
          status: "FAILED",
          errorMessage: error.message || "Unknown error",
          completedAt: new Date(),
        },
      });
      // Invalidate cache
      await cacheHelper.del(`job:${jobId}`);
      
      console.log(
        `[Worker ${workerId}] Job status updated successfully. New status: ${updatedJob.status}`
      );
    } catch (updateError: any) {
      console.error(
        `[Worker ${workerId}] FAILED to update job status in DB:`,
        updateError.message
      );
    }

    parentPort?.postMessage({
      type: "error",
      jobId,
      workerId,
      error: error.message,
    });
  }
}

async function downloadFromS3(s3Key: string): Promise<Buffer> {
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      attempts++;
      console.log(`[Worker ${workerId}] downloadFromS3 - Attempt ${attempts}/${maxAttempts}`);
      console.log(`[Worker ${workerId}] Bucket: ${S3_CONFIG.bucket}`);
      console.log(`[Worker ${workerId}] Region: ${S3_CONFIG.region}`);
      console.log(`[Worker ${workerId}] S3 Key: ${s3Key}`);

      const command = new GetObjectCommand({
        Bucket: S3_CONFIG.bucket,
        Key: s3Key,
      });

      console.log(`[Worker ${workerId}] Sending GetObjectCommand to S3...`);
      const response = await s3Client.send(command);
      console.log(`[Worker ${workerId}] GetObjectCommand succeeded`);

      if (!response.Body) {
        throw new Error("No data received from S3");
      }

      // Convert stream to buffer
      console.log(`[Worker ${workerId}] Converting stream to buffer...`);
      const chunks: Uint8Array[] = [];
      for await (const chunk of response.Body as any) {
        chunks.push(chunk);
      }

      const buffer = Buffer.concat(chunks);
      console.log(
        `[Worker ${workerId}] Download successful. Buffer size: ${buffer.length} bytes`
      );
      return buffer;
    } catch (error: any) {
      console.error(`[Worker ${workerId}] downloadFromS3 Attempt ${attempts} FAILED:`);
      console.error(`[Worker ${workerId}] Error name: ${error.name}`);
      console.error(`[Worker ${workerId}] Error message: ${error.message}`);
      
      if (attempts === maxAttempts) {
        console.error(`[Worker ${workerId}] Max attempts reached. Failing job.`);
        throw error;
      }
      
      console.log(`[Worker ${workerId}] Retrying in 2 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
  throw new Error("Download failed after max attempts");
}

// Connect to RabbitMQ and start consuming
async function startConsuming() {
  console.log(`[Worker ${workerId}] Connecting to RabbitMQ...`);

  const connection = await amqp.connect(env.RABBITMQ_URL);
  const channel = await connection.createChannel();

  await channel.assertQueue(env.RABBITMQ_QUEUE, { durable: true });
  await channel.prefetch(1); // Process one message at a time

  console.log(`[Worker ${workerId}] Waiting for jobs...`);

  channel.consume(env.RABBITMQ_QUEUE, async (msg) => {
    if (msg) {
      const jobMessage = JSON.parse(msg.content.toString());
      console.log(`[Worker ${workerId}] Received job: ${jobMessage.jobId}`);

      await processJob(jobMessage);

      // Acknowledge message
      channel.ack(msg);
    }
  });
}

// Start the worker
startConsuming().catch((error) => {
  console.error(`[Worker ${workerId}] Failed to start:`, error);
  process.exit(1);
});
