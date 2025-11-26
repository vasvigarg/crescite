import express, { Application } from "express";
import cors from "cors";
import { env } from "./config/env";
import routes from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

export const createApp = (): Application => {
  const app = express();

  // Trust proxy
  app.set("trust proxy", 1);

  // Middleware
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(","),
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization"],
    })
  );

  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));

  // Routes
  app.use("/api", routes);

  // Error handling
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
