import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { logger } from "../utils/logger";

/**
 * Initialize Firebase Admin SDK
 * This function should be called before creating any FirestoreService instances
 */
export function initializeFirebase(): void {
  if (admin.apps.length > 0) {
    logger.info("Firebase Admin SDK already initialized");
    return;
  }

  try {
    // In development, use the imported service account credentials directly
    if (process.env.NODE_ENV === "development") {
      // Import service account for development
      const serviceAccountPath = path.resolve(__dirname, "../../firebase-service-account.json");
      if (fs.existsSync(serviceAccountPath)) {
        const serviceAccountCredentials = require(serviceAccountPath);
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccountCredentials),
        });
        logger.info("Firebase Admin SDK initialized with local service account");
      } else {
        throw new Error(`Service account file not found at ${serviceAccountPath}`);
      }
    } else {
      // In production (Cloud Run), use the mounted secret
      if (process.env.FIREBASE_SERVICE_ACCOUNT_PATH) {
        // Read from the mounted secret file
        const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
        logger.info(`Loading Firebase credentials from: ${serviceAccountPath}`);

        if (fs.existsSync(serviceAccountPath)) {
          const serviceAccountContent = fs.readFileSync(serviceAccountPath, "utf8");
          const serviceAccountCredentials = JSON.parse(serviceAccountContent);

          admin.initializeApp({
            credential: admin.credential.cert(serviceAccountCredentials),
          });
          logger.info("Firebase Admin SDK initialized with mounted service account");
        } else {
          throw new Error(`Service account file not found at ${serviceAccountPath}`);
        }
      } else {
        // Default initialization for Google Cloud environments
        admin.initializeApp();
        logger.info("Firebase Admin SDK initialized with default credentials");
      }
    }
  } catch (error) {
    logger.error("Error initializing Firebase Admin SDK:", error);
    throw error;
  }
}
