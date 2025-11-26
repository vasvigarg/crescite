import { Worker } from "worker_threads";
import { rabbitmqConnection } from "../config/rabbitmq";
import { connectDatabase } from "../config/database";
import { connectRedis } from "../config/redis";
import { env } from "../config/env";
import path from "path";
import fs from "fs";

class WorkerManager {
  private workers: Worker[] = [];
  private workerCount: number;

  constructor() {
    this.workerCount = parseInt(env.WORKER_CONCURRENCY);
  }

  async start() {
    console.log("Starting Worker Manager...");

    // Connect to services
    await connectDatabase();
    await connectRedis();
    await rabbitmqConnection.connect();

    // Start workers
    for (let i = 0; i < this.workerCount; i++) {
      this.createWorker(i);
    }

    console.log(`Started ${this.workerCount} worker threads`);
  }

  private createWorker(id: number) {
    const workerFileBase = "job-processor.worker";

    // Prefer compiled JS when running from `dist/`.
    const jsWorkerPath = path.join(__dirname, `${workerFileBase}.js`);
    const tsWorkerPath = path.join(__dirname, `${workerFileBase}.ts`);

    const workerPath = fs.existsSync(jsWorkerPath)
      ? jsWorkerPath
      : tsWorkerPath;

    const worker = new Worker(workerPath, {
      workerData: { workerId: id },
      execArgv: ["--require", "tsx/cjs"],
    });

    worker.on("message", (message) => {
      console.log(`Worker ${id} message:`, message);
    });

    worker.on("error", (error) => {
      console.error(`Worker ${id} error:`, error);
      // Restart worker on error
      this.restartWorker(id);
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        console.error(`Worker ${id} exited with code ${code}`);
        this.restartWorker(id);
      }
    });

    this.workers[id] = worker;
  }

  private restartWorker(id: number) {
    console.log(`Restarting worker ${id}...`);
    setTimeout(() => {
      this.createWorker(id);
    }, 1000);
  }

  async stop() {
    console.log("Stopping all workers...");

    for (const worker of this.workers) {
      await worker.terminate();
    }

    await rabbitmqConnection.disconnect();
    console.log("All workers stopped");
  }
}

// Start the worker manager
const manager = new WorkerManager();

manager.start().catch((error) => {
  console.error("Failed to start worker manager:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", async () => {
  await manager.stop();
  process.exit(0);
});

process.on("SIGINT", async () => {
  await manager.stop();
  process.exit(0);
});
