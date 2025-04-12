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

// Create strategy with enhanced position management and 0.95 correlation threshold
const strategy = new PairsCorrelationStrategy(
  correlationAnalyzer,
  executor,
  positionManager,
  firestoreService,
  priceDataService,
  { correlationThreshold: 0.95 }
);

async function checkOpportunities() {
  try {
    logger.info('Starting opportunity check...');
    await firestoreService.logEvent('opportunity_check_started');

    // Run the opportunity check
    await strategy.checkForOpportunities();
    
    await firestoreService.logEvent('opportunity_check_completed');
    logger.info('Opportunity check completed successfully');

  } catch (error) {
    logger.error('Error in opportunity check:', error);
    await firestoreService.logEvent('opportunity_check_error', {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
  process.exit(0);
}

// Run the opportunity check
checkOpportunities();
