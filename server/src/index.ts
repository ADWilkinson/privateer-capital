import express, { Request, Response } from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import dotenv from "dotenv";
import * as admin from "firebase-admin";
import fs from "fs";
import { apiRouter } from "./routes/api";
import { syncRouter } from "./routes/sync";
import { logger } from "./utils/logger";
import { errorHandler, AppError } from "./utils/errorHandler";

// Load environment variables
dotenv.config();

/**
 * Initialize Firebase Admin SDK based on environment
 */
function initializeFirebase(): void {
  try {
    // In development, use the imported service account credentials directly
    if (process.env.NODE_ENV === "development") {
      const serviceAccountCredentials = require("../firebase-service-account.json");
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccountCredentials as admin.ServiceAccount),
      });
      logger.info("Firebase Admin SDK initialized with local service account");
      return;
    }

    // In production (Cloud Run), try mounted secret first
    if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
      const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
      logger.info(`Loading Firebase credentials from: ${serviceAccountPath}`);

      try {
        const serviceAccountJson = fs.readFileSync(serviceAccountPath, "utf8");
        const serviceAccount = JSON.parse(serviceAccountJson);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount),
        });
        logger.info("Firebase Admin SDK initialized with mounted service account");
        return;
      } catch (readError) {
        logger.error(`Error reading Firebase service account from path: ${serviceAccountPath}`, readError);
        // Continue to fallback method
      }
    }

    // Fallback to application default credentials
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
    logger.info("Firebase Admin SDK initialized with application default credentials");
  } catch (error) {
    logger.error("Error initializing Firebase Admin SDK:", error);
    process.exit(1);
  }
}

/**
 * Configure Express app with middleware and routes
 */
function configureExpressApp(): express.Application {
  const app = express();
  const PORT = process.env.PORT || 8080; // Cloud Run prefers port 8080

  // Middleware
  app.use(cors());
  app.use(helmet());
  app.use(morgan("combined"));
  app.use(express.json({ limit: "10mb" }));

  // Routes - use only the API router now
  app.use("/api", apiRouter);
  
  // Add redirects from old /sync routes to new /api routes for backward compatibility
  app.use("/sync/sync-positions", (req, res, next) => {
    logger.info("Redirecting from /sync/sync-positions to /api/sync-positions");
    res.redirect(307, "/api/sync-positions");
  });
  
  app.use("/sync/sync-status", (req, res, next) => {
    logger.info("Redirecting from /sync/sync-status to /api/sync-status");
    res.redirect(307, "/api/sync-status");
  });

  // Health check endpoint - Add BEFORE 404 handler
  app.get("/health", (req: Request, res: Response) => {
    res.status(200).json({
      status: "healthy",
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || "unknown",
    });
  });

  // 404 handler
  app.all("*", (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
  });

  // Error handling middleware (add AFTER routes)
  app.use(errorHandler);

  return app;
}

/**
 * Set up graceful shutdown handlers
 */
function setupGracefulShutdown(server: any): void {
  const shutdownGracefully = (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);

    server.close(() => {
      logger.info("Server closed successfully");
      process.exit(0);
    });

    // Force exit if graceful shutdown fails
    setTimeout(() => {
      logger.error("Could not close server gracefully, forcing shutdown");
      process.exit(1);
    }, 10000);
  };

  // Handle termination signals
  process.on("SIGTERM", () => shutdownGracefully("SIGTERM"));
  process.on("SIGINT", () => shutdownGracefully("SIGINT"));
}

/**
 * Main function to start the server
 */
function startServer(): void {
  // Initialize Firebase
  initializeFirebase();

  // Configure Express app
  const app = configureExpressApp();
  const PORT = process.env.PORT || 8080;

  // Start server
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);

    // Check if running in Cloud Run (stateless environment)
    const isCloudRun = process.env.K_SERVICE ? true : false;

    logger.info("Running in Cloud Run - scheduled jobs should be handled by Cloud Scheduler");
  });

  // Set up graceful shutdown
  setupGracefulShutdown(server);
}

// Start the server
startServer();

export default configureExpressApp();
