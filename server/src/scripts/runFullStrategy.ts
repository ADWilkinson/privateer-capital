import { PairsCorrelationStrategy } from "../strategies/pairsCorrelationStrategy";
import { CorrelationAnalyzer } from "../analysis/correlationAnalyzer";
import { HyperliquidExecutor } from "../execution/hyperliquidExecutor";
import { PositionManager } from "../execution/positionManager";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";
import dotenv from "dotenv";
import { PriceDataService } from "../services/priceDataService";
import { retryWithBackoff } from "./retry";
import { initializeFirebase } from "./firebaseInit";
import { analysisWhitelist, formatAssetSymbol } from '../utils/assetMappings';

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
const correlationAnalyzer = new CorrelationAnalyzer(
  firestoreService,
  priceDataService
);
const executor = new HyperliquidExecutor(firestoreService);
const positionManager = new PositionManager(executor, firestoreService);

// Create strategy with enhanced position management and strict correlation threshold
const strategy = new PairsCorrelationStrategy(
  correlationAnalyzer, 
  executor, 
  positionManager, 
  firestoreService,
  priceDataService,
  {
    correlationThreshold: 0.95, // High correlation threshold for quality pairs
    minDataPoints: 96 // 1 week of 15-minute snapshots
  }
);

async function runFullStrategy() {
  try {
    logger.info("Starting full strategy workflow...");

    // Step 1: Collect price data
    logger.info("Step 1: Collecting price data...");
    await priceDataService.collectAndStorePriceSnapshots();
    logger.info("Price data collection completed");

    // Step 2: Initialize strategy
    logger.info("Step 2: Initializing strategy...");
    const assets = analysisWhitelist; // Use base symbols directly without -PERP suffix

    if (!assets || assets.length === 0) {
      logger.error("No tradable assets available");
      process.exit(1);
    }

    await strategy.initialize(assets);
    logger.info("Strategy initialization completed");

    // Step 3: Refresh correlations
    logger.info("Step 3: Refreshing correlations...");
    const correlatedPairs = await strategy.refreshCorrelations(assets);
    logger.info(`Found ${correlatedPairs.length} correlated pairs`);

    // Step 4: Check for opportunities
    logger.info("Step 4: Checking for opportunities...");
    await strategy.checkForOpportunities();
    logger.info("Opportunity check completed");

    // Step 5: Update open trades
    logger.info("Step 5: Updating open trades...");
    await strategy.updateOpenTrades();
    logger.info("Trade updates completed");

    logger.info("Full strategy workflow completed successfully");
  } catch (error) {
    logger.error("Error in full strategy workflow:", error);
    process.exit(1);
  }
  process.exit(0);
}

// Run the full strategy workflow
runFullStrategy();
