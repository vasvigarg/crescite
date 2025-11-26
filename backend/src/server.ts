import { createApp } from "./app";
import { env } from "./config/env";
import { connectDatabase, disconnectDatabase } from "./config/database";
import { connectRedis, disconnectRedis } from "./config/redis";
import { rabbitmqConnection } from "./config/rabbitmq";
import { logger } from "./utils/logger";

const startServer = async () => {
  try {
    logger.info("Starting Crescite Backend Server...");

    // Connect to databases
    await connectDatabase();
    await connectRedis();
    await rabbitmqConnection.connect();

    // Create Express app
    const app = createApp();

    // Start server
    const server = app.listen(env.PORT, () => {
      logger.info(`Server is running on ${env.API_URL}`);
      logger.info(`Environment: ${env.NODE_ENV}`);
      logger.info(`PostgreSQL: Connected`);
      logger.info(`Redis: Connected`);
      logger.info(`RabbitMQ: Connected`);
      logger.info(`AWS S3: Configured`);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);

      server.close(async () => {
        logger.info("HTTP server closed");

        try {
          await disconnectDatabase();
          await disconnectRedis();
          await rabbitmqConnection.disconnect();
          logger.info("All connections closed");
          process.exit(0);
        } catch (error) {
          logger.error("Error during shutdown", error);
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 30000);
    };

    // Handle termination signals
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught Exception:", error);
      gracefulShutdown("UNCAUGHT_EXCEPTION");
    });

    // Handle unhandled promise rejections
    process.on("unhandledRejection", (reason, promise) => {
      logger.error("Unhandled Rejection at:", { promise, reason });
      gracefulShutdown("UNHANDLED_REJECTION");
    });
  } catch (error) {
    logger.error("Failed to start server:", error);
    process.exit(1);
  }
};

// Start the server
startServer();
