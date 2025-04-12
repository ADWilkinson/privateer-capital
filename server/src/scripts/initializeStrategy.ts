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
const correlationAnalyzer = new CorrelationAnalyzer(firestoreService, priceDataService);
const executor = new HyperliquidExecutor(firestoreService);
const positionManager = new PositionManager(executor, firestoreService);

// Create strategy
const strategy = new PairsCorrelationStrategy(correlationAnalyzer, executor, positionManager, firestoreService, priceDataService);

async function initializeStrategy() {
  try {
    logger.info("Starting strategy initialization...");
    await firestoreService.logEvent("strategy_init_started");

    // Get tradable assets
    const assets = analysisWhitelist.map(symbol => formatAssetSymbol(symbol));

    if (!assets || assets.length === 0) {
      logger.error("No tradable assets available");
      process.exit(1);
    }

    logger.info(`Found ${assets.length} tradable assets`);

    // Initialize strategy
    await strategy.initialize(assets);

    await firestoreService.logEvent("strategy_init_completed");
    logger.info("Strategy initialization completed successfully");
  } catch (error) {
    logger.error("Error in strategy initialization:", error);
    await firestoreService.logEvent("strategy_init_error", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
  process.exit(0);
}

// Run the initialization
initializeStrategy();
