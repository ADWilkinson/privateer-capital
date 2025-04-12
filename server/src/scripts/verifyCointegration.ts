#!/usr/bin/env node

import { CorrelationAnalyzer } from "../analysis/correlationAnalyzer";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";
import { PriceDataService } from "../services/priceDataService";
import { initializeFirebase } from "./firebaseInit";
import { analysisWhitelist } from "../utils/assetMappings";
import dotenv from "dotenv";
dotenv.config();

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  logger.error("Error initializing Firebase Admin SDK:", error);
  process.exit(1);
}

// Create services
const firestoreService = new FirestoreService();
const priceDataService = new PriceDataService(firestoreService);
const correlationAnalyzer = new CorrelationAnalyzer(firestoreService, priceDataService);

async function verifyCointegration() {
  try {
    logger.info("Starting cointegration verification...");

    // Get all correlated pairs from Firestore
    const correlatedPairs = await firestoreService.getCorrelatedPairs();
    logger.info(`Found ${correlatedPairs.length} correlated pairs`);

    // For each pair, verify its cointegration status
    for (const pair of correlatedPairs) {
      const { pairA, pairB } = pair;

      try {
        // Get historical price data for both assets
        const asset1Data = await priceDataService.getHistoricalPriceDataByPoints(pairA, 96);
        const asset2Data = await priceDataService.getHistoricalPriceDataByPoints(pairB, 96);

        if (!asset1Data || !asset2Data) {
          logger.warn(`Skipping pair ${pairA}-${pairB}: Missing price data`);
          continue;
        }

        // Verify cointegration
        const testResult = correlationAnalyzer.testForCointegration(
          asset1Data.map((p) => p.price),
          asset2Data.map((p) => p.price)
        );

        // Proper cointegration check - half-life must exist and be within reasonable range (6-15 periods)
        const isCointegrated = testResult.halfLife !== null && 
                              testResult.halfLife >= 6 && 
                              testResult.halfLife <= 15;

        logger.info(`Pair ${pairA}-${pairB}:`);
        logger.info(`  Firestore cointegrated: ${pair.cointegrated}`);
        logger.info(`  Recalculated cointegrated: ${isCointegrated}`);
        logger.info(`  Regression Coefficient: ${testResult.regressionCoefficient}`);
        logger.info(`  Spread Mean: ${testResult.spreadMean}`);
        logger.info(`  Spread Std: ${testResult.spreadStd}`);
        logger.info(`  Half Life: ${testResult.halfLife}`);

        if (pair.cointegrated !== isCointegrated) {
          logger.warn(`  WARNING: Mismatch found!`);
        }
      } catch (error) {
        logger.error(`Error verifying pair ${pairA}-${pairB}:`, error);
      }
    }

    logger.info("Cointegration verification completed");
  } catch (error) {
    logger.error("Error verifying cointegration:", error);
    process.exit(1);
  }
  process.exit(0);
}

// Run the verification
verifyCointegration();
