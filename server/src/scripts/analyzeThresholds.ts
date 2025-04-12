import { PairsCorrelationStrategy } from "../strategies/pairsCorrelationStrategy";
import { CorrelationAnalyzer } from "../analysis/correlationAnalyzer";
import { HyperliquidExecutor } from "../execution/hyperliquidExecutor";
import { PositionManager } from "../execution/positionManager";
import { FirestoreService } from "../services/firestoreService";
import { PriceDataService, OHLCV } from "../services/priceDataService";
import { logger } from "../utils/logger";
import dotenv from "dotenv";
import { retryWithBackoff } from "./retry";
import { initializeFirebase } from "./firebaseInit";
import { analysisWhitelist, formatAssetSymbol, coinGeckoIds } from '../utils/assetMappings';

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
  priceDataService,
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

interface ThresholdAnalysis {
  correlationThreshold: number;
  zScoreThreshold: number;
  eligiblePairs: {
    pairA: string;
    pairB: string;
    correlation: number;
    spreadZScore: number;
  }[];
}

interface CorrelatedPair {
  pairA: string;
  pairB: string;
  spreadMean: number;
  spreadStd: number;
}

export interface CorrelatedPairData {
  pairA: string;
  pairB: string;
  correlation: number;
  cointegrated: boolean;
  regressionCoefficient: number;
  spreadMean: number | null;
  spreadStd: number | null;
  spreadZScore: number | null;
  halfLife: number | null;
  timestamp: number;
}

async function analyzeThresholds(
  correlationAnalyzer: CorrelationAnalyzer,
  correlationThreshold: number
): Promise<void> {
  try {
    logger.info("Starting threshold analysis...");

    // Step 1: Collect price data
    logger.info("Step 1: Collecting price data...");
    await priceDataService.collectAndStorePriceSnapshots();
    logger.info("Price data collection completed");

    // Step 2: Initialize strategy
    logger.info("Step 2: Initializing strategy...");
    // Get tradable assets
    const assets = analysisWhitelist.map(symbol => formatAssetSymbol(symbol));

    if (!assets || assets.length === 0) {
      logger.error("No tradable assets available");
      process.exit(1);
    }

    await strategy.initialize(assets);
    logger.info("Strategy initialization completed");

    // Step 3: Analyze thresholds
    logger.info("Step 3: Finding correlated pairs...");
    const correlatedPairs = await correlationAnalyzer.findCorrelatedPairs(
      assets,
      correlationThreshold
    );

    logger.info(`Found ${correlatedPairs.length} correlated pairs`);

    // Step 4: Update cointegration data
    logger.info("Step 4: Updating cointegration data...");
    await correlationAnalyzer.updateCointegrationData(correlatedPairs);

    logger.info("Threshold analysis completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("Error in threshold analysis:", error);
    process.exit(1);
  }
}

analyzeThresholds(correlationAnalyzer, 0.95);

async function analyzeThresholdsNew(
  correlationAnalyzer: CorrelationAnalyzer,
  correlationThreshold: number,
  zScoreThreshold: number
): Promise<CorrelatedPairData[]> {
  try {
    // Get all whitelisted assets
    const assets = Object.keys(coinGeckoIds);

    // Find correlated pairs
    const correlatedPairs = await correlationAnalyzer.findCorrelatedPairs(
      assets,
      correlationThreshold
    );

    // Update cointegration data
    await correlationAnalyzer.updateCointegrationData(correlatedPairs);

    // Get all correlated pairs from Firestore
    const allPairs = await firestoreService.getCorrelatedPairs();

    // Find pairs with significant spread
    const eligiblePairs = allPairs
      .filter(pair => {
        const spreadMean = pair.spreadMean as number;
        const spreadStd = pair.spreadStd as number;
        return Math.abs(spreadMean - spreadStd) > zScoreThreshold;
      });

    // Log results
    logger.info(`Found ${eligiblePairs.length} pairs with significant spread:`);
    for (const pair of eligiblePairs) {
      const spreadMean = pair.spreadMean as number;
      const spreadStd = pair.spreadStd as number;
      logger.info(`Pair: ${pair.pairA}/${pair.pairB}, Spread: ${spreadMean - spreadStd}`);
    }

    return eligiblePairs;
  } catch (error) {
    logger.error("Error analyzing thresholds:", error);
    throw error;
  }
}

async function main() {
  try {
    // Initialize Firebase
    await initializeFirebase();

    // Initialize services
    const firestoreService = new FirestoreService();
    const priceDataService = new PriceDataService(firestoreService);
    const correlationAnalyzer = new CorrelationAnalyzer(firestoreService, priceDataService);

  
    const correlationThreshold = 0.95;
    const zScoreThreshold = 2.5;

    // Run analysis
    await analyzeThresholdsNew(
      correlationAnalyzer,
      correlationThreshold,
      zScoreThreshold
    );

    process.exit(0);
  } catch (error) {
    logger.error("Error in main:", error);
    process.exit(1);
  }
}

function calculateSpreadZScore(
  pair: CorrelatedPairData,
  currentPrices: Record<string, number>
): number {
  if (!pair.spreadMean || !pair.spreadStd) {
    return 0;
  }

  const currentSpread = currentPrices[pair.pairB] - pair.regressionCoefficient * currentPrices[pair.pairA];
  return (currentSpread - pair.spreadMean) / pair.spreadStd;
}
