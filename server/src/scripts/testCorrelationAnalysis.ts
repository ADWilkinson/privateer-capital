import { CorrelationAnalyzer } from "../analysis/correlationAnalyzer";
import { FirestoreService } from "../services/firestoreService";
import { PriceDataService } from "../services/priceDataService";
import { logger } from "../utils/logger";
import { analysisWhitelist, formatAssetSymbol, coinGeckoIds } from "../utils/assetMappings";
import dotenv from "dotenv";
import { initializeFirebase } from "./firebaseInit";

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

async function testCorrelationAnalysis() {
  try {
    logger.info("Starting correlation analysis test...");

    // Step 1: Collect price data
    logger.info("Step 1: Collecting price data...");
    await priceDataService.collectAndStorePriceSnapshots();
    logger.info("Price data collection completed");

    // Step 2: Find correlated pairs
    logger.info("Step 2: Finding correlated pairs with threshold 0.95...");
    const correlatedPairs = await correlationAnalyzer.findCorrelatedPairs(
      Object.keys(coinGeckoIds),
      0.95
    );
    
    // Log detailed information about correlated pairs
    logger.info(`Found ${correlatedPairs.length} correlated pairs:`);
    let cointegratedCount = 0;
    correlatedPairs.forEach((pair, index) => {
      logger.info(`Pair ${index + 1}:`);
      logger.info(`  Asset 1: ${pair.pairA}`);
      logger.info(`  Asset 2: ${pair.pairB}`);
      logger.info(`  Correlation: ${pair.correlation}`);
      logger.info(`  Cointegrated: ${pair.cointegrated ? 'Yes' : 'No'}`);
      if (pair.cointegrated) {
        cointegratedCount++;
        logger.info(`  Spread Mean: ${pair.spreadMean}`);
        logger.info(`  Spread Std: ${pair.spreadStd}`);
        logger.info(`  Spread Z-Score: ${pair.spreadZScore}`);
        logger.info(`  Half-Life: ${pair.halfLife}`);
      }
    });

    logger.info(`Total pairs: ${correlatedPairs.length}`);
    logger.info(`Cointegrated pairs: ${cointegratedCount}`);
    logger.info(`Percentage cointegrated: ${(cointegratedCount / correlatedPairs.length * 100).toFixed(1)}%`);

    logger.info("Correlation analysis test completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error in correlation analysis test:", error);
    process.exit(1);
  }
}

testCorrelationAnalysis();
