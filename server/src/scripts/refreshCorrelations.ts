import { PairsCorrelationStrategy } from '../strategies/pairsCorrelationStrategy';
import { CorrelationAnalyzer } from '../analysis/correlationAnalyzer';
import { HyperliquidExecutor } from '../execution/hyperliquidExecutor';
import { PositionManager } from '../execution/positionManager';
import { FirestoreService } from '../services/firestoreService';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import { PriceDataService } from '../services/priceDataService';
import { retryWithBackoff } from "./retry";
import { initializeFirebase } from "./firebaseInit";
import { analysisWhitelist, formatAssetSymbol } from '../utils/assetMappings';

dotenv.config();

// Initialize Firebase Admin SDK
try {
  initializeFirebase();
} catch (error) {
  logger.error('Error initializing Firebase Admin SDK:', error);
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

async function refreshCorrelations() {
  try {
    logger.info("Starting correlation analysis...");
    await firestoreService.logEvent("correlation_analysis_started");

    // Get tradable assets - use the base assets without formatting
    const assets = analysisWhitelist;

    if (!assets || assets.length === 0) {
      logger.error("No tradable assets available");
      process.exit(1);
    }

    logger.info(`Found ${assets.length} tradable assets`);

    // Update correlations
    await strategy.updateCorrelations();
    
    logger.info("Correlation analysis completed successfully");
    await firestoreService.logEvent("correlation_analysis_completed");
    process.exit(0);
  } catch (error) {
    logger.error("Error in correlation analysis:", error);
    await firestoreService.logEvent("correlation_analysis_failed", {
      error: error instanceof Error ? error.message : 'Unknown error'
    });
    process.exit(1);
  }
}

refreshCorrelations();
