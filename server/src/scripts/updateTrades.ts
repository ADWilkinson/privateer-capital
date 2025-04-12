import { PairsCorrelationStrategy } from '../strategies/pairsCorrelationStrategy';
import { CorrelationAnalyzer } from '../analysis/correlationAnalyzer';
import { HyperliquidExecutor } from '../execution/hyperliquidExecutor';
import { PositionManager } from '../execution/positionManager';
import { FirestoreService } from '../services/firestoreService';
import { logger } from '../utils/logger';
import dotenv from 'dotenv';
import { PriceDataService } from '../services/priceDataService';
import { initializeFirebase } from "./firebaseInit";
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
const correlationAnalyzer = new CorrelationAnalyzer(
  firestoreService,
  priceDataService
);
const executor = new HyperliquidExecutor(firestoreService);
const positionManager = new PositionManager(executor, firestoreService);

// Create strategy
const strategy = new PairsCorrelationStrategy(
  correlationAnalyzer,
  executor,
  positionManager,
  firestoreService,
  priceDataService
);

async function updateTrades() {
  try {
    logger.info('Starting trade updates...');
    await firestoreService.logEvent('trade_update_started');

    // Update open trades
    await strategy.updateOpenTrades();
    
    await firestoreService.logEvent('trade_update_completed');
    logger.info('Trade updates completed successfully');

  } catch (error) {
    logger.error('Error in trade updates:', error);
    await firestoreService.logEvent('trade_update_error', {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
  process.exit(0);
}

// Run the trade updates
updateTrades();
