import amqplib, { Connection, Channel } from "amqplib";
import { env } from "./env";

class RabbitMQConnection {
  private connection: any = null;
  private channel: any = null;
  private isConnecting = false;

  async connect(): Promise<void> {
    if (this.connection && this.channel) {
      return;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      await new Promise((resolve) => setTimeout(resolve, 100));
      return this.connect();
    }

    this.isConnecting = true;

    try {
      console.log("Connecting to RabbitMQ...");
      this.connection = await amqplib.connect(env.RABBITMQ_URL);
      this.channel = await this.connection!.createChannel();

      // Assert the queue exists
      await this.channel!.assertQueue(env.RABBITMQ_QUEUE, {
        durable: true, // Queue survives broker restart
      });

      console.log("RabbitMQ connected successfully");

      // Handle connection errors
      this.connection!.on("error", (error: any) => {
        console.error("RabbitMQ connection error:", error);
        this.connection = null;
        this.channel = null;
      });

      this.connection!.on("close", () => {
        console.log("RabbitMQ connection closed");
        this.connection = null;
        this.channel = null;
      });
    } catch (error) {
      console.error("Failed to connect to RabbitMQ:", error);
      this.connection = null;
      this.channel = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  async getChannel(): Promise<Channel> {
    if (!this.channel) {
      await this.connect();
    }

    if (!this.channel) {
      throw new Error("Failed to establish RabbitMQ channel");
    }

    return this.channel;
  }

  async disconnect(): Promise<void> {
    try {
      if (this.channel) {
        await this.channel.close();
        this.channel = null;
      }
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
      }
      console.log("RabbitMQ disconnected");
    } catch (error) {
      console.error("Error disconnecting from RabbitMQ:", error);
    }
  }

  async publishJob(jobData: any): Promise<void> {
    const channel = await this.getChannel();
    const message = JSON.stringify(jobData);

    channel.sendToQueue(
      env.RABBITMQ_QUEUE,
      Buffer.from(message),
      { persistent: true } // Message survives broker restart
    );

    console.log("Job published to queue:", jobData.jobId);
  }
}

export const rabbitmqConnection = new RabbitMQConnection();
