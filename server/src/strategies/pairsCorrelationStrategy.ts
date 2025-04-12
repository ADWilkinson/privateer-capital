import { CorrelationAnalyzer, CorrelatedPairData } from "../analysis/correlationAnalyzer";
import { HyperliquidExecutor } from "../execution/hyperliquidExecutor";
import { PositionManager } from "../execution/positionManager";
import { FirestoreService } from "../services/firestoreService";
import { PriceDataService } from "../services/priceDataService";
import { Decimal } from "decimal.js";
import { logger } from "../utils/logger";
import { coinGeckoIds } from "../utils/assetMappings";

// Type for strategy action
enum StrategyAction {
  None,
  LongSpread,
  ShortSpread,
}

/**
 * Statistical arbitrage strategy that trades correlated pairs
 */
export class PairsCorrelationStrategy {
  private correlationAnalyzer: CorrelationAnalyzer;
  private executor: HyperliquidExecutor;
  private positionManager: PositionManager;
  private firestoreService: FirestoreService;
  private priceDataService: PriceDataService;

  // Strategy parameters that can be dynamically configured
  private correlationThreshold: number;
  private tradeSizePercent: number = 0.5; // Default 50%
  private maxPositions: number = 4; // Default 4 positions
  private readonly minDataPoints: number = 96; // 1 week of 15-minute snapshots
  private zScoreThreshold: number = 2.5; // Default 2.5

  // Tracked pairs for trading
  private tradablePairs: CorrelatedPairData[] = [];

  constructor(
    correlationAnalyzer: CorrelationAnalyzer,
    executor: HyperliquidExecutor,
    positionManager: PositionManager,
    firestoreService: FirestoreService,
    priceDataService: PriceDataService,
    options: { correlationThreshold?: number; minDataPoints?: number } = {}
  ) {
    this.correlationAnalyzer = correlationAnalyzer;
    this.executor = executor;
    this.positionManager = positionManager;
    this.firestoreService = firestoreService;
    this.priceDataService = priceDataService;
    this.correlationThreshold = options.correlationThreshold ?? 0.95;
    this.minDataPoints = options.minDataPoints ?? 96; // 1 week of 15-minute snapshots
  }

  /**
   * Initialize the strategy with a list of assets
   */
  async initialize(assets: string[]): Promise<void> {
    try {
      await this.logEvent("strategy_init_started", {
        assetCount: assets.length,
        correlationThreshold: this.correlationThreshold,
        minDataPoints: this.minDataPoints
      });

      // Get correlation data for asset pairs
      const correlatedPairs = await this.refreshCorrelations(assets);

      // Initialize pairs with default values
      this.tradablePairs = correlatedPairs.map(pair => ({
        pairA: pair.pairA,
        pairB: pair.pairB,
        correlation: pair.correlation,
        cointegrated: pair.cointegrated,
        regressionCoefficient: pair.regressionCoefficient,
        spreadMean: pair.spreadMean,
        spreadStd: pair.spreadStd,
        spreadZScore: pair.spreadZScore,
        halfLife: pair.halfLife,
        timestamp: pair.timestamp
      }));

      await this.logEvent("strategy_init_completed", {
        tradablePairsCount: this.tradablePairs.length,
      });

      logger.info(`Strategy initialized with ${this.tradablePairs.length} tradable pairs`);
    } catch (error) {
      this.handleError("Error initializing strategy", error);
      throw error;
    }
  }

  /**
   * Helper function to log events to Firestore
   */
  private async logEvent(eventName: string, data?: Record<string, any>): Promise<void> {
    try {
      await this.firestoreService.logEvent(eventName, {
        ...data,
        timestamp: new Date()
      });
    } catch (error) {
      logger.error(`Error logging event ${eventName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle errors with logging and error reporting
   * @param message Error message
   * @param error Error object
   */
  private handleError(message: string, error: unknown): void {
    if (error instanceof Error) {
      logger.error(`${message}: ${error.message}`);
      logger.error(error.stack);
    } else if (error !== null && typeof error === 'object') {
      logger.error(`${message}: ${JSON.stringify(error)}`);
    } else if (error !== null) {
      logger.error(`${message}: ${String(error)}`);
    } else {
      logger.error(`${message}: Unknown error`);
    }
  }

  /**
   * Refresh correlation data for all pairs
   */
  async refreshCorrelations(assets: string[]): Promise<CorrelatedPairData[]> {
    try {
      await this.logEvent("correlation_refresh_started", {
        assetCount: assets.length,
      });

      // Find highly correlated pairs
      const correlatedPairsData = await this.correlationAnalyzer.findCorrelatedPairs(
        assets,
        this.correlationThreshold
      );

      // Convert CorrelatedPairData to CorrelatedPair format
      const correlatedPairs: CorrelatedPairData[] = correlatedPairsData.map((pairData) => ({
        pairA: pairData.pairA,
        pairB: pairData.pairB,
        correlation: pairData.correlation,
        cointegrated: pairData.cointegrated,
        regressionCoefficient: pairData.regressionCoefficient,
        spreadMean: pairData.spreadMean,
        spreadStd: pairData.spreadStd,
        spreadZScore: pairData.spreadZScore,
        halfLife: pairData.halfLife,
        timestamp: pairData.timestamp
      }));

      // Store pairs in Firestore
      await Promise.all(
        correlatedPairs.map(async (pair) => {
          const pairId = `${pair.pairA}_${pair.pairB}`;
          await this.firestoreService.updateCorrelatedPair(pairId, {
            pairA: pair.pairA,
            pairB: pair.pairB,
            correlation: pair.correlation,
            cointegrated: pair.cointegrated,
            regressionCoefficient: pair.regressionCoefficient,
            spreadMean: pair.spreadMean,
            spreadStd: pair.spreadStd,
            spreadZScore: pair.spreadZScore,
            halfLife: pair.halfLife,
            timestamp: pair.timestamp
          });
        })
      );

      await this.logEvent("correlation_refresh_completed", {
        correlatedPairsCount: correlatedPairs.length,
      });

      if (correlatedPairs.length > 0) {
        logger.info(`Found ${correlatedPairs.length} correlated pairs`);
        await this.logEvent("correlated_pairs_found", {
          count: correlatedPairs.length,
          pairs: correlatedPairs.map((p) => ({
            pairA: p.pairA,
            pairB: p.pairB,
            correlation: p.correlation,
          })),
        });
      }
      return correlatedPairs;
    } catch (error) {
      this.handleError("Error refreshing correlations", error);
      throw error;
    }
  }

  /**
   * Update correlation data for all whitelisted assets
   */
  public async updateCorrelations(): Promise<void> {
    try {
      logger.info("Updating correlations...");

      // Get all whitelisted assets
      const assets = Object.keys(coinGeckoIds);
      
      // Use the refreshCorrelations method to avoid code duplication
      const correlatedPairs = await this.refreshCorrelations(assets);

      // Calculate statistical measures for each pair
      await Promise.all(correlatedPairs.map((pair) => this.calculatePairStatistics(pair)));

      this.tradablePairs = correlatedPairs;
    } catch (error) {
      this.handleError("Error updating correlations", error);
      throw error;
    }
  }

  // updateCorrelationData method removed as it duplicates refreshCorrelations functionality

  /**
   * Calculate statistics for a pair of correlated assets
   * @param pair Correlated pair data
   */
  private async calculatePairStatistics(pair: CorrelatedPairData): Promise<CorrelatedPairData> {
    try {
      // Get historical price data for both assets
      const pricesA = await this.priceDataService.getHistoricalPriceDataByPoints(pair.pairA, this.minDataPoints);
      const pricesB = await this.priceDataService.getHistoricalPriceDataByPoints(pair.pairB, this.minDataPoints);

      // Log the number of data points retrieved
      logger.info(`Retrieved ${pricesA.length} price data points for ${pair.pairA}`);
      logger.info(`Retrieved ${pricesB.length} price data points for ${pair.pairB}`);

      // Ensure we have enough data points
      if (!pricesA.length || !pricesB.length) {
        logger.warn(`Insufficient data points for pair ${pair.pairA}/${pair.pairB}`);
        return pair;
      }

      // Ensure arrays are of equal length
      const len = Math.min(pricesA.length, pricesB.length);
      const alignedPricesA = pricesA.slice(-len);
      const alignedPricesB = pricesB.slice(-len);

      // Extract prices for analysis
      const priceSeriesA = alignedPricesA.map((price) => price.price);
      const priceSeriesB = alignedPricesB.map((price) => price.price);

      // Calculate correlation
      const correlation = this.correlationAnalyzer.calculateCorrelation(priceSeriesA, priceSeriesB);
      
      // Test for cointegration
      const cointegrationResult = await this.correlationAnalyzer.testForCointegration(priceSeriesA, priceSeriesB);

      // Update pair data
      pair.correlation = correlation;
      // Proper cointegration check - half-life must exist and be within reasonable range (6-15 periods)
      pair.cointegrated = cointegrationResult.halfLife !== null && 
                         cointegrationResult.halfLife >= 6 && 
                         cointegrationResult.halfLife <= 15;
      pair.regressionCoefficient = cointegrationResult.regressionCoefficient;
      pair.spreadMean = cointegrationResult.spreadMean;
      pair.spreadStd = cointegrationResult.spreadStd;
      pair.spreadZScore = cointegrationResult.spreadZScore;
      pair.halfLife = cointegrationResult.halfLife;
      pair.timestamp = Date.now();

      return pair;
    } catch (error) {
      logger.error(`Error calculating pair statistics for ${pair.pairA}/${pair.pairB}:`, error);
      throw error;
    }
  }




  /**
   * Execute a pair trade with enhanced transaction-like safety measures, equal dollar value sizing
   * and multiple retries for handling low liquidity conditions
   * Uses immediate-or-cancel orders with automatic fallbacks to ensure execution
   */
  private async executePairTrade(
    pair: CorrelatedPairData,
    sideA: 'long' | 'short',
    sideB: 'long' | 'short'
  ): Promise<void> {
    try {
      logger.info(`Executing pair trade for ${pair.pairA}/${pair.pairB}: ${sideA}/${sideB}`);
      
      // First, validate that this pair can be traded
      const isValidPair = await this.validatePairTrade(pair.pairA, pair.pairB, sideA);
      if (!isValidPair) {
        logger.error(`Pair trade validation failed for ${pair.pairA}/${pair.pairB}`);
        await this.logEvent("pair_trade_rejected", {
          pairA: pair.pairA, 
          pairB: pair.pairB,
          reason: "validation_failed"
        });
        return;
      }
      
      // Get current prices for both assets
      const currentPrices = await this.priceDataService.getCurrentPrices([
        pair.pairA,
        pair.pairB
      ]);

      if (!currentPrices) {
        logger.warn(`No price snapshot available for pair ${pair.pairA}/${pair.pairB}`);
        await this.logEvent("pair_trade_failed", {
          pairA: pair.pairA,
          pairB: pair.pairB,
          reason: "no_price_data"
        });
        return;
      }

      const priceA = currentPrices[pair.pairA];
      const priceB = currentPrices[pair.pairB];

      if (!priceA || !priceB) {
        logger.warn(`Missing price data for pair ${pair.pairA}/${pair.pairB}`);
        await this.logEvent("pair_trade_failed", {
          pairA: pair.pairA,
          pairB: pair.pairB,
          reason: "incomplete_price_data",
          hasA: !!priceA,
          hasB: !!priceB
        });
        return;
      }

      // Get portfolio value to determine trade size
      const { portfolioValue } = await this.executor.getAccountBalanceAndPortfolioValue();
      const tradeSize = new Decimal(portfolioValue * this.tradeSizePercent);

      logger.info(`Portfolio value: ${portfolioValue}, Using ${(this.tradeSizePercent * 100).toFixed(1)}% = ${tradeSize.toNumber().toFixed(2)} USDC for trade`);

      // Calculate minimum sizes based on Hyperliquid's requirements
      const minOrderValue = 10; // Minimum $10 order value requirement

      // Calculate size for each leg with equal dollar value
      const baseDollarValue = tradeSize.div(2); // Split portfolio value equally between both legs
      
      logger.info(`Base dollar value per asset: ${baseDollarValue.toNumber().toFixed(2)} USDC`);
      
      // Calculate base sizes that would achieve equal dollar value
      const baseSizeA = baseDollarValue.div(priceA);
      const baseSizeB = baseDollarValue.div(priceB);

      logger.info(`Raw base sizes: ${pair.pairA}: ${baseSizeA.toNumber()}, ${pair.pairB}: ${baseSizeB.toNumber()}`);

      // Get size increments for both assets
      const sizeIncrementA = await this.getTickSize(pair.pairA);
      const sizeIncrementB = await this.getTickSize(pair.pairB);

      logger.info(`Size increments: ${pair.pairA}: ${sizeIncrementA}, ${pair.pairB}: ${sizeIncrementB}`);

      // Round sizes according to exchange requirements
      const decimalPlacesA = Math.max(0, -Math.floor(Math.log10(sizeIncrementA)));
      const decimalPlacesB = Math.max(0, -Math.floor(Math.log10(sizeIncrementB)));

      let sizeA = baseSizeA.toDecimalPlaces(decimalPlacesA, Decimal.ROUND_HALF_UP);
      let sizeB = baseSizeB.toDecimalPlaces(decimalPlacesB, Decimal.ROUND_HALF_UP);

      logger.info(`Rounded sizes: ${pair.pairA}: ${sizeA.toNumber()}, ${pair.pairB}: ${sizeB.toNumber()}`);

      // Calculate initial dollar values after rounding
      let valueA = sizeA.mul(priceA);
      let valueB = sizeB.mul(priceB);
      
      logger.info(`Initial dollar values: ${pair.pairA}: ${valueA.toNumber().toFixed(2)}, ${pair.pairB}: ${valueB.toNumber().toFixed(2)}`);

      // Ensure both sizes meet minimum value requirement
      while (valueA.lessThan(minOrderValue) || valueB.lessThan(minOrderValue)) {
        if (valueA.lessThan(minOrderValue)) {
          sizeA = sizeA.add(sizeIncrementA);
          valueA = sizeA.mul(priceA);
        }
        if (valueB.lessThan(minOrderValue)) {
          sizeB = sizeB.add(sizeIncrementB);
          valueB = sizeB.mul(priceB);
        }
      }

      logger.info(`Sizes after minimum order adjustment: ${pair.pairA}: ${sizeA.toNumber()}, ${pair.pairB}: ${sizeB.toNumber()}`);

      // Fine-tune sizes to get closer to equal dollar value
      // If one size is more than 5% different from the other, adjust it
      let valueDiff = valueA.sub(valueB).abs();
      let valueDiffPercent = valueDiff.div(valueA.add(valueB).div(2)).mul(100);
      
      // Try to reduce the difference to under 5% by adjusting the larger side
      const maxIterations = 5; // Limit adjustments to prevent infinite loops
      let iterations = 0;
      
      while (valueDiffPercent.greaterThan(5) && iterations < maxIterations) {
        iterations++;
        
        if (valueA.greaterThan(valueB)) {
          // A is larger, reduce size if possible
          const newSizeA = sizeA.sub(sizeIncrementA);
          const newValueA = newSizeA.mul(priceA);
          
          // Only reduce if it still meets minimum requirements
          if (newValueA.greaterThanOrEqualTo(minOrderValue)) {
            sizeA = newSizeA;
            valueA = newValueA;
          } else {
            // Can't reduce A, try increasing B
            const newSizeB = sizeB.add(sizeIncrementB);
            sizeB = newSizeB;
            valueB = newSizeB.mul(priceB);
          }
        } else {
          // B is larger, reduce size if possible
          const newSizeB = sizeB.sub(sizeIncrementB);
          const newValueB = newSizeB.mul(priceB);
          
          // Only reduce if it still meets minimum requirements
          if (newValueB.greaterThanOrEqualTo(minOrderValue)) {
            sizeB = newSizeB;
            valueB = newValueB;
          } else {
            // Can't reduce B, try increasing A
            const newSizeA = sizeA.add(sizeIncrementA);
            sizeA = newSizeA;
            valueA = newSizeA.mul(priceA);
          }
        }
        
        // Recalculate difference
        valueDiff = valueA.sub(valueB).abs();
        valueDiffPercent = valueDiff.div(valueA.add(valueB).div(2)).mul(100);
      }
      
      // Final dollar values for both legs
      const finalValueA = sizeA.mul(priceA);
      const finalValueB = sizeB.mul(priceB);

      // Calculate the final percentage difference in dollar value
      const finalValueDiff = finalValueA.sub(finalValueB).abs();
      const finalValueDiffPercent = finalValueDiff.div(finalValueA.add(finalValueB).div(2)).mul(100);

      logger.info(`Final trade sizes: ${pair.pairA}: ${sizeA.toNumber()} (${finalValueA.toNumber().toFixed(2)} USDC), ${pair.pairB}: ${sizeB.toNumber()} (${finalValueB.toNumber().toFixed(2)} USDC)`);
      logger.info(`Final dollar value difference: ${finalValueDiffPercent.toNumber().toFixed(2)}%`);

      // Verify that the size values are valid
      if (sizeA.isNaN() || sizeA.lessThanOrEqualTo(0) || sizeB.isNaN() || sizeB.lessThanOrEqualTo(0)) {
        logger.error(`Invalid position sizes calculated: ${pair.pairA}: ${sizeA.toNumber()}, ${pair.pairB}: ${sizeB.toNumber()}`);
        await this.logEvent("pair_trade_failed", {
          pairA: pair.pairA,
          pairB: pair.pairB,
          reason: "invalid_position_sizes",
          sizeA: sizeA.toString(),
          sizeB: sizeB.toString()
        });
        return;
      }

      // Save trade details for monitoring and validation
      await this.firestoreService.logEvent("pair_trade_details", {
        timestamp: Date.now(),
        pairA: pair.pairA,
        pairB: pair.pairB,
        sideA,
        sideB,
        sizeA: sizeA.toString(),
        sizeB: sizeB.toString(),
        valueA: finalValueA.toString(),
        valueB: finalValueB.toString(),
        valueDiffPercent: finalValueDiffPercent.toString(),
        correlation: pair.correlation,
        spreadZScore: pair.spreadZScore
      });

      // TRANSACTION-LIKE EXECUTION APPROACH
      // We use a 2-phase approach: 
      // 1. Prepare both trade details but don't execute
      // 2. Execute both trades in quick succession with immediate-or-cancel orders
      // 3. Verify both positions are open, if not, roll back as needed
      
      // Prepare the normalized symbols
      const tradingPairA = this.priceDataService.normalizeSymbol(pair.pairA, true);
      const tradingPairB = this.priceDataService.normalizeSymbol(pair.pairB, true);
      
      // Prepare trade execution parameters
      let firstPositionId: string | null = null;
      let secondPositionId: string | null = null;
      
      try {
        // Final check before execution - validate that positions are still valid
        const validationResult = await this.validatePairTrade(pair.pairA, pair.pairB);
        if (!validationResult) {
          logger.error(`Final validation failed before execution for ${pair.pairA}/${pair.pairB}`);
          throw new Error(`Pre-execution validation failed for ${pair.pairA}/${pair.pairB}`);
        }

        // RETRY LOGIC FOR ILLIQUID MARKETS
        // Try up to 3 times with backoff to open the first position
        let firstPositionOpened = false;
        let firstPositionAttempts = 0;
        const maxFirstPositionAttempts = 3;
        
        // First position retry loop
        while (!firstPositionOpened && firstPositionAttempts < maxFirstPositionAttempts) {
          firstPositionAttempts++;
          
          try {
            logger.info(`Opening first position (attempt ${firstPositionAttempts}/${maxFirstPositionAttempts}): ${tradingPairA} ${sideA}`);
            
            // Execute first position
            firstPositionId = await this.positionManager.openPosition(
              tradingPairA,
              sideA,
              sizeA,
              1, // leverage
              undefined, // stop loss
              undefined, // take profit
              { symbol: pair.pairB, correlation: pair.correlation }
            );
            
            logger.info(`First position opened successfully: ${tradingPairA} ${sideA} with ID ${firstPositionId}`);
            firstPositionOpened = true;
          } catch (firstPosError) {
            if (firstPositionAttempts < maxFirstPositionAttempts) {
              const errorMsg = firstPosError instanceof Error ? firstPosError.message : String(firstPosError);
              logger.warn(`Failed to open first position (attempt ${firstPositionAttempts}): ${errorMsg}, retrying in 2 seconds...`);
              
              // Exponential backoff between retries
              await new Promise(resolve => setTimeout(resolve, 2000 * firstPositionAttempts));
              
              // If error mentions "Order could not immediately match", adjust size slightly to target different resting orders
              if (errorMsg.includes("Order could not immediately match")) {
                const adjustment = 0.01; // 1% adjustment
                logger.info(`Adjusting size by ${adjustment * 100}% to target different liquidity pools`);
                sizeA = sizeA.mul(1 + (Math.random() * adjustment));
                sizeA = sizeA.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
              }
            } else {
              // Last attempt failed, rethrow
              throw firstPosError;
            }
          }
        }
        
        // If we couldn't open the first position after all retries, fail early
        if (!firstPositionOpened) {
          throw new Error(`Failed to open first position ${tradingPairA} after ${maxFirstPositionAttempts} attempts`);
        }
        
        // Similar retry logic for second position
        let secondPositionOpened = false;
        let secondPositionAttempts = 0;
        const maxSecondPositionAttempts = 3;
        
        // Second position retry loop
        while (!secondPositionOpened && secondPositionAttempts < maxSecondPositionAttempts) {
          secondPositionAttempts++;
          
          try {
            logger.info(`Opening second position (attempt ${secondPositionAttempts}/${maxSecondPositionAttempts}): ${tradingPairB} ${sideB}`);
            
            // Execute second position
            secondPositionId = await this.positionManager.openPosition(
              tradingPairB,
              sideB,
              sizeB,
              1, // leverage
              undefined, // stop loss
              undefined, // take profit
              { symbol: pair.pairA, correlation: pair.correlation }
            );
            
            logger.info(`Second position opened successfully: ${tradingPairB} ${sideB} with ID ${secondPositionId}`);
            secondPositionOpened = true;
          } catch (secondPosError) {
            if (secondPositionAttempts < maxSecondPositionAttempts) {
              const errorMsg = secondPosError instanceof Error ? secondPosError.message : String(secondPosError);
              logger.warn(`Failed to open second position (attempt ${secondPositionAttempts}): ${errorMsg}, retrying in 2 seconds...`);
              
              // Exponential backoff between retries
              await new Promise(resolve => setTimeout(resolve, 2000 * secondPositionAttempts));
              
              // If error mentions "Order could not immediately match", adjust size slightly
              if (errorMsg.includes("Order could not immediately match")) {
                const adjustment = 0.01; // 1% adjustment
                logger.info(`Adjusting size by ${adjustment * 100}% to target different liquidity pools`);
                sizeB = sizeB.mul(1 + (Math.random() * adjustment));
                sizeB = sizeB.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
              }
            } else {
              // Failed all retries for second position, need to roll back first position
              logger.error(`Failed all attempts to open second position. Rolling back first position.`);
              
              // Store the error to rethrow after cleanup
              const finalError = secondPosError;
              
              // Try to rollback the first position
              try {
                if (firstPositionId) {
                  await this.positionManager.closePosition(firstPositionId, "pair_incomplete");
                  logger.info(`Successfully rolled back first position ${firstPositionId}`);
                }
              } catch (rollbackError) {
                logger.error(`Failed to roll back first position: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
                
                // Try direct close as fallback
                try {
                  await this.executor.closePosition(tradingPairA, sizeA);
                  logger.info(`Successfully closed position ${tradingPairA} directly through executor`);
                } catch (directCloseError) {
                  logger.error(`CRITICAL: Failed all attempts to close position ${tradingPairA}`);
                  
                  // Log this critical failure
                  await this.firestoreService.logEvent("critical_rollback_failure", {
                    symbol: tradingPairA,
                    tradeId: firstPositionId,
                    error: String(directCloseError),
                    timestamp: Date.now()
                  });
                }
              }
              
              // Now rethrow the original error
              throw finalError;
            }
          }
        }
        
        // VERIFICATION STEP: Check positions are actually open on the exchange
        logger.info(`Verifying both positions are open on the exchange...`);
        const exchangePositions = await this.executor.getPositions();
        
        // Check if both positions exist and have the expected sizes
        const positionA = exchangePositions.find(p => p.coin === tradingPairA);
        const positionB = exchangePositions.find(p => p.coin === tradingPairB);
        
        const hasPosA = positionA && Math.abs(parseFloat(positionA.position)) > 0.001;
        const hasPosB = positionB && Math.abs(parseFloat(positionB.position)) > 0.001;
        
        if (!hasPosA || !hasPosB) {
          // At least one position is missing or too small - log the issue
          logger.error(`VERIFICATION FAILED: Positions not properly opened - A:${hasPosA}, B:${hasPosB}`);
          
          // We need to roll back the positions that did get opened
          let rollbackSuccess = true;
          
          if (hasPosA) {
            logger.warn(`Rolling back first position ${tradingPairA} as second position failed verification`);
            try {
              if (firstPositionId) {
                await this.positionManager.closePosition(firstPositionId, "verification_failed");
              } else {
                // Direct close via executor if position ID is not available
                await this.executor.closePosition(tradingPairA, sizeA);
              }
            } catch (rollbackError) {
              rollbackSuccess = false;
              logger.error(`Failed to roll back first position: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
          }
          
          if (hasPosB) {
            logger.warn(`Rolling back second position ${tradingPairB} as pair verification failed`);
            try {
              if (secondPositionId) {
                await this.positionManager.closePosition(secondPositionId, "verification_failed");
              } else {
                // Direct close via executor if position ID is not available
                await this.executor.closePosition(tradingPairB, sizeB);
              }
            } catch (rollbackError) {
              rollbackSuccess = false;
              logger.error(`Failed to roll back second position: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
            }
          }
          
          await this.logEvent("pair_trade_verification_failed", {
            pairA: tradingPairA,
            pairB: tradingPairB,
            hasPosA,
            hasPosB,
            firstPositionId,
            secondPositionId,
            rollbackSuccess
          });
          
          throw new Error(`Verification failed: One or both positions not opened properly`);
        }
        
        // Success path - both positions verified
        logger.info(`Verification successful - both positions are open on the exchange`);
      } catch (tradeError) {
        const error = tradeError instanceof Error ? tradeError : new Error(String(tradeError));
        logger.error(`Error during pair trade execution: ${error.message}`);
        
        // Attempt rollback if first position was opened but second failed
        if (firstPositionId && !secondPositionId) {
          logger.warn(`Second position failed to open. Cleaning up first position ${firstPositionId} to maintain pair integrity.`);
          try {
            await this.positionManager.closePosition(firstPositionId, "pair_incomplete");
            logger.info(`Successfully closed incomplete pair position ${firstPositionId}`);
          } catch (closeError) {
            logger.error(`Failed to close incomplete pair position: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            
            // Attempt direct exchange close as a fallback
            try {
              await this.executor.closePosition(tradingPairA, sizeA);
              logger.info(`Successfully closed position ${tradingPairA} directly through executor`);
            } catch (directCloseError) {
              logger.error(`CRITICAL: Failed all attempts to close position ${tradingPairA}: ${directCloseError instanceof Error ? directCloseError.message : String(directCloseError)}`);
              
              // Log this critical error for immediate attention
              await this.firestoreService.logEvent("critical_rollback_failure", {
                symbol: tradingPairA,
                tradeId: firstPositionId,
                error: error.message,
                timestamp: Date.now()
              });
            }
          }
        }
        
        await this.logEvent("pair_trade_execution_error", {
          pairA: pair.pairA,
          pairB: pair.pairB,
          sideA,
          sideB,
          firstPositionOpened: !!firstPositionId,
          secondPositionOpened: !!secondPositionId,
          error: error.message,
          errorType: error.name,
          timestamp: Date.now()
        });
        
        throw error;
      }

      // Log the successful trade execution
      await this.logEvent("pair_trade_executed", {
        pairA: pair.pairA,
        pairB: pair.pairB,
        sideA,
        sideB,
        tradeSize: tradeSize.toNumber(),
        sizeA: sizeA.toNumber(),
        sizeB: sizeB.toNumber(),
        valueA: finalValueA.toNumber(),
        valueB: finalValueB.toNumber(),
        valueDiffPercent: finalValueDiffPercent.toNumber(),
        positionIdA: firstPositionId,
        positionIdB: secondPositionId,
        correlation: pair.correlation,
        spreadZScore: pair.spreadZScore
      });
      
      logger.info(`Pair trade executed successfully for ${pair.pairA}/${pair.pairB}`);
    } catch (error) {
      logger.error(`Error executing pair trade for ${pair.pairA}/${pair.pairB}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.logEvent("trade_execution_error", {
        pairA: pair.pairA,
        pairB: pair.pairB,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }


  // testAndUpdateCointegration method removed - unused in the codebase

  /**
   * Evaluate a potential pairs trading strategy based on cointegration data and current prices.
   * @param pairData Cointegration test results
   * @returns Strategy action (none, long spread, short spread)
   */
  private async evaluatePairStrategy(
    pairData: CorrelatedPairData
  ): Promise<StrategyAction> {
    const pairA = pairData.pairA;
    const pairB = pairData.pairB;
    try {
 
      const currentPrices = await this.priceDataService.getCurrentPrices([
        `${pairA}`,
        `${pairB}`
      ]);
      if (!currentPrices) {
        logger.warn(`No price snapshot available for pair ${pairA}/${pairB}`);
        return StrategyAction.None;
      }

      const priceA = currentPrices[`${pairA}`];
      const priceB = currentPrices[`${pairB}`];

      if (!priceA || !priceB) {
        logger.warn(`Missing price data for pair ${pairA}/${pairB}`);
        return StrategyAction.None;
      }

      // Calculate current spread using the stored hedge ratio
      const currentSpread = priceB - pairData.regressionCoefficient * priceA;

      // Calculate Z-score
      const spreadZScore = pairData.spreadStd !== 0
        ? (currentSpread - (pairData.spreadMean || 0)) / (pairData.spreadStd || 0)
        : 0;

      // Check if spread is mean-reverting
      if (pairData.halfLife === null || pairData.halfLife <= 0) {
        logger.warn(`Invalid half-life for pair ${pairA}/${pairB}: ${pairData.halfLife}`);
        return StrategyAction.None;
      }

      // Determine position based on Z-score
      if (spreadZScore > this.zScoreThreshold) {
        // Spread is above threshold, short spread (buy A, sell B)
        return StrategyAction.ShortSpread;
      } else if (spreadZScore < -this.zScoreThreshold) {
        // Spread is below threshold, long spread (sell A, buy B)
        return StrategyAction.LongSpread;
      }

      return StrategyAction.None;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error evaluating strategy for pair ${pairA}/${pairB}: ${errorMessage}`);
      return StrategyAction.None;
    }
  }

  /**
   * Check for trading opportunities in tracked pairs
   * Uses the improved execution approach to ensure positions are opened correctly
   */
  async checkForOpportunities(): Promise<void> {
    try {
      logger.info('Checking for trading opportunities...');

      // First check: Verify we don't already have any imbalanced positions
      const exchangePositions = await this.executor.getPositions();
      const significantPositions = exchangePositions.filter(pos => {
        const positionSize = Math.abs(parseFloat(pos.position));
        return positionSize > 0.001; // Ignore very small positions
      });
      
      // Count short and long positions
      const shortPositions = significantPositions.filter(pos => parseFloat(pos.position) < 0);
      const longPositions = significantPositions.filter(pos => parseFloat(pos.position) > 0);
      
      // Check if positions are balanced
      const isBalanced = longPositions.length === shortPositions.length;
      
      // Log details about positions for debugging
      logger.info(`Current positions: ${significantPositions.length} total, ${longPositions.length} longs, ${shortPositions.length} shorts`);
      
      if (significantPositions.length > 0 && !isBalanced) {
        logger.error(`ABORTING: Existing positions are imbalanced (${longPositions.length} longs, ${shortPositions.length} shorts)`);
        
        // Additional logging to show detailed position information
        logger.error(`Position imbalance detected:`);
        for (const pos of significantPositions) {
          logger.error(`  ${pos.coin}: ${pos.position} (${parseFloat(pos.position) > 0 ? 'LONG' : 'SHORT'})`);
        }
        
        // Log the issue to Firestore
        await this.firestoreService.logEvent("opportunities_check_aborted", {
          reason: "imbalanced_positions",
          longCount: longPositions.length,
          shortCount: shortPositions.length,
          positions: significantPositions.map(p => ({ 
            symbol: p.coin, 
            size: p.position,
            side: parseFloat(p.position) > 0 ? 'long' : 'short' 
          })),
          timestamp: Date.now()
        });
        
        // Check if we need emergency correction
        if (Math.abs(longPositions.length - shortPositions.length) === 1) {
          logger.warn("Position imbalance appears to be a single position. Will attempt to correct by closing unpaired position.");
          
          const excessPositions = longPositions.length > shortPositions.length ? longPositions : shortPositions;
          // Get the position with the smallest absolute size to minimize market impact
          const positionToClose = excessPositions.sort((a, b) => 
            Math.abs(parseFloat(a.position)) - Math.abs(parseFloat(b.position))
          )[0];
          
          if (positionToClose) {
            logger.warn(`Attempting to correct imbalance by closing position: ${positionToClose.coin} (${positionToClose.position})`);
            try {
              // Get position size as decimal
              const positionSize = new Decimal(Math.abs(parseFloat(positionToClose.position)));
              
              // Close the position
              await this.executor.closePosition(positionToClose.coin, positionSize);
              
              logger.info(`Successfully closed unpaired position: ${positionToClose.coin}`);
              
              // Log the emergency correction
              await this.firestoreService.logEvent("position_imbalance_corrected", {
                symbol: positionToClose.coin,
                size: positionToClose.position,
                timestamp: Date.now()
              });
            } catch (correctionError) {
              logger.error(`Failed to correct position imbalance: ${correctionError instanceof Error ? correctionError.message : String(correctionError)}`);
            }
          }
        }
        
        // Don't proceed with opening new positions
        return;
      }
      
      // Load latest strategy parameters from Firestore
      try {
        const params = await this.firestoreService.getStrategyParams();
        
        // Update the strategy parameters
        this.tradeSizePercent = params.tradeSizePercent;
        this.maxPositions = params.maxPositions;
        this.correlationThreshold = params.correlationThreshold;
        this.zScoreThreshold = params.zScoreThreshold;
        
        logger.info(`Loaded strategy parameters from Firestore: tradeSize=${this.tradeSizePercent}, maxPositions=${this.maxPositions}, correlationThreshold=${this.correlationThreshold}, zScoreThreshold=${this.zScoreThreshold}`);
      } catch (error) {
        logger.warn(`Could not load strategy parameters from Firestore, using defaults: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Get all correlated pairs from Firestore
      const correlatedPairs = await this.firestoreService.getCorrelatedPairs();

      if (!correlatedPairs || correlatedPairs.length === 0) {
        logger.warn('No correlated pairs found');
        return;
      }

      // Get portfolio value to determine trade size
      const { portfolioValue, availableMargin } = await this.executor.getAccountBalanceAndPortfolioValue();
      
      // Safety check - ensure we have enough margin and a reasonable portfolio value
      if (availableMargin < 100 || portfolioValue < 100) {
        logger.warn(`Insufficient margin or portfolio value for trading: $${availableMargin.toFixed(2)} available, $${portfolioValue.toFixed(2)} total`);
        return;
      }
      
      // Only use the available margin for calculating trade size
      const tradeSize = new Decimal(availableMargin * this.tradeSizePercent);
      logger.info(`Using ${(this.tradeSizePercent * 100).toFixed(1)}% of available margin: $${tradeSize.toNumber().toFixed(2)}`);

      // Get active positions from database
      const activePositions = await this.positionManager.getActivePositions();
      const totalPositions = activePositions.length;

      // If we already have positions, don't open new ones
      if (totalPositions >= this.maxPositions) {
        logger.info(`Already have ${totalPositions}/${this.maxPositions} positions, skipping new trades`);
        return;
      }

      // Double-check on exchange as well
      if (significantPositions.length >= this.maxPositions) {
        logger.info(`Already have ${significantPositions.length}/${this.maxPositions} positions on exchange, skipping new trades`);
        return;
      }

      // Evaluate each pair and collect opportunities
      const opportunities: { pair: CorrelatedPairData; action: StrategyAction }[] = [];

      for (const pair of correlatedPairs as CorrelatedPairData[]) {
        try {
          // Validate the pair basic parameters
          if (!pair.cointegrated || pair.spreadZScore === null || pair.halfLife === null) {
            continue; // Skip non-cointegrated or incomplete pairs
          }
          
          // Make sure the half-life is in a reasonable range (6-15 periods)
          if (pair.halfLife < 6 || pair.halfLife > 15) {
            continue; // Skip pairs with half-life outside of reasonable range
          }
          
          // Make sure the correlation is strong enough (>0.8)
          if (pair.correlation < 0.8) {
            continue; // Skip pairs with weak correlation
          }
          
          const action = await this.evaluatePairStrategy(pair);

          if (action !== StrategyAction.None) {
            opportunities.push({ pair, action });
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error evaluating pair ${pair.pairA}/${pair.pairB}: ${errorMessage}`);
        }
      }

      // If no opportunities, return
      if (opportunities.length === 0) {
        logger.info('No trading opportunities found');
        return;
      }

      // Sort opportunities by absolute Z-score (strongest signal first)
      opportunities.sort((a, b) => 
        Math.abs(b.pair.spreadZScore || 0) - Math.abs(a.pair.spreadZScore || 0)
      );

      // Attempt to execute trades in order of opportunity strength
      logger.info(`Found ${opportunities.length} potential trading opportunities`);
      
      // Keep track of attempted pairs
      let attemptedPairs = 0;
      let executedTrade = false;
      
      // Try opportunities in order until one succeeds or we run out
      for (const opportunity of opportunities) {
        attemptedPairs++;
        const actionName = opportunity.action === StrategyAction.LongSpread ? 'Long Spread' : 'Short Spread';
        logger.info(`Trying opportunity ${attemptedPairs}/${opportunities.length}: ${opportunity.pair.pairA}/${opportunity.pair.pairB}: ${actionName} (Z-score: ${opportunity.pair.spreadZScore?.toFixed(2)})`);
        
        // Validate if this pair can be traded (assets not already in use)
        const isValidPair = await this.validatePairTrade(opportunity.pair.pairA, opportunity.pair.pairB);
        
        if (!isValidPair) {
          logger.warn(`Pair ${opportunity.pair.pairA}/${opportunity.pair.pairB} cannot be traded - assets already in use or validation failed`);
          
          // Log the skipped opportunity
          await this.firestoreService.logEvent("opportunity_skipped", {
            pairA: opportunity.pair.pairA,
            pairB: opportunity.pair.pairB,
            action: actionName,
            zScore: opportunity.pair.spreadZScore,
            reason: "validation_failed",
            attemptNumber: attemptedPairs
          });
          
          // Continue to the next opportunity
          continue;
        }
        
        // Found a valid opportunity to execute
        logger.info(`Valid opportunity found for ${opportunity.pair.pairA}/${opportunity.pair.pairB}: ${actionName} (Z-score: ${opportunity.pair.spreadZScore?.toFixed(2)})`);

        // Get current prices for both assets
        const currentPrices = await this.priceDataService.getCurrentPrices([
          opportunity.pair.pairA,
          opportunity.pair.pairB
        ]);

      if (!currentPrices) {
        logger.warn(`No price snapshot available for pair ${opportunity.pair.pairA}/${opportunity.pair.pairB}`);
        
        // Log the skipped opportunity
        await this.firestoreService.logEvent("opportunity_skipped", {
          pairA: opportunity.pair.pairA,
          pairB: opportunity.pair.pairB,
          action: actionName,
          zScore: opportunity.pair.spreadZScore,
          reason: "no_price_data",
          attemptNumber: attemptedPairs
        });
        
        // Try the next opportunity
        continue;
      }

      const priceA = currentPrices[opportunity.pair.pairA];
      const priceB = currentPrices[opportunity.pair.pairB];

      if (!priceA || !priceB) {
        logger.warn(`Missing price data for pair ${opportunity.pair.pairA}/${opportunity.pair.pairB}`);
        
        // Log the skipped opportunity
        await this.firestoreService.logEvent("opportunity_skipped", {
          pairA: opportunity.pair.pairA,
          pairB: opportunity.pair.pairB,
          action: actionName,
          zScore: opportunity.pair.spreadZScore,
          reason: "incomplete_price_data",
          hasA: !!priceA,
          hasB: !!priceB,
          attemptNumber: attemptedPairs
        });
        
        // Try the next opportunity
        continue;
      }

      // Calculate minimum sizes based on Hyperliquid's requirements
      const minOrderValue = 10; // Minimum $10 order value requirement

      // Calculate size for each leg with equal dollar value
      const baseDollarValue = tradeSize.div(2); // Split portfolio value equally between both legs
      
      // Calculate base sizes that would achieve equal dollar value
      const baseSizeA = baseDollarValue.div(priceA);
      const baseSizeB = baseDollarValue.div(priceB);

      // Get size increments for both assets
      const sizeIncrementA = await this.getTickSize(opportunity.pair.pairA);
      const sizeIncrementB = await this.getTickSize(opportunity.pair.pairB);

      // Round sizes according to exchange requirements
      const decimalPlacesA = Math.max(0, -Math.floor(Math.log10(sizeIncrementA)));
      const decimalPlacesB = Math.max(0, -Math.floor(Math.log10(sizeIncrementB)));

      let sizeA = baseSizeA.toDecimalPlaces(decimalPlacesA, Decimal.ROUND_HALF_UP);
      let sizeB = baseSizeB.toDecimalPlaces(decimalPlacesB, Decimal.ROUND_HALF_UP);

      // Calculate initial dollar values
      let valueA = sizeA.mul(priceA);
      let valueB = sizeB.mul(priceB);

      // Ensure both sizes meet minimum value requirement
      while (valueA.lessThan(minOrderValue) || valueB.lessThan(minOrderValue)) {
        if (valueA.lessThan(minOrderValue)) {
          sizeA = sizeA.add(sizeIncrementA);
          valueA = sizeA.mul(priceA);
        }
        if (valueB.lessThan(minOrderValue)) {
          sizeB = sizeB.add(sizeIncrementB);
          valueB = sizeB.mul(priceB);
        }
      }

      // Fine-tune sizes to get closer to equal dollar value
      let valueDiff = valueA.sub(valueB).abs();
      let valueDiffPercent = valueDiff.div(valueA.add(valueB).div(2)).mul(100);
      
      // Try to reduce the difference to under 5% by adjusting the larger side
      const maxIterations = 5;
      let iterations = 0;
      
      while (valueDiffPercent.greaterThan(5) && iterations < maxIterations) {
        iterations++;
        
        if (valueA.greaterThan(valueB)) {
          // A is larger, reduce size if possible
          const newSizeA = sizeA.sub(sizeIncrementA);
          const newValueA = newSizeA.mul(priceA);
          
          // Only reduce if it still meets minimum requirements
          if (newValueA.greaterThanOrEqualTo(minOrderValue)) {
            sizeA = newSizeA;
            valueA = newValueA;
          } else {
            // Can't reduce A, try increasing B
            const newSizeB = sizeB.add(sizeIncrementB);
            sizeB = newSizeB;
            valueB = newSizeB.mul(priceB);
          }
        } else {
          // B is larger, reduce size if possible
          const newSizeB = sizeB.sub(sizeIncrementB);
          const newValueB = newSizeB.mul(priceB);
          
          // Only reduce if it still meets minimum requirements
          if (newValueB.greaterThanOrEqualTo(minOrderValue)) {
            sizeB = newSizeB;
            valueB = newValueB;
          } else {
            // Can't reduce B, try increasing A
            const newSizeA = sizeA.add(sizeIncrementA);
            sizeA = newSizeA;
            valueA = newSizeA.mul(priceA);
          }
        }
        
        // Recalculate difference
        valueDiff = valueA.sub(valueB).abs();
        valueDiffPercent = valueDiff.div(valueA.add(valueB).div(2)).mul(100);
      }

      // Final dollar values
      const finalValueA = sizeA.mul(priceA);
      const finalValueB = sizeB.mul(priceB);
      const finalValueDiffPercent = finalValueA.sub(finalValueB).abs().div(finalValueA.add(finalValueB).div(2)).mul(100);

      logger.info(`Trade sizes: ${opportunity.pair.pairA}: ${sizeA.toNumber()} (${finalValueA.toNumber().toFixed(2)} USDC), ${opportunity.pair.pairB}: ${sizeB.toNumber()} (${finalValueB.toNumber().toFixed(2)} USDC)`);
      logger.info(`Dollar value difference: ${finalValueDiffPercent.toNumber().toFixed(2)}%`);

      // Determine sides for the pair trade based on the strategy action
      const sideA = opportunity.action === StrategyAction.LongSpread ? 'short' : 'long';
      const sideB = opportunity.action === StrategyAction.LongSpread ? 'long' : 'short';

      try {
        // Execute the trade
        await this.executePairTrade(
          opportunity.pair,
          sideA,
          sideB
        );
        
        // Mark that we executed a trade successfully
        executedTrade = true;
        
        // Log the opportunity taken
        await this.firestoreService.logEvent("opportunity_taken", {
          pairA: opportunity.pair.pairA,
          pairB: opportunity.pair.pairB,
          action: actionName,
          zScore: opportunity.pair.spreadZScore,
          correlation: opportunity.pair.correlation,
          sizeA: sizeA.toString(),
          sizeB: sizeB.toString(),
          valueA: finalValueA.toString(),
          valueB: finalValueB.toString(),
          attemptNumber: attemptedPairs,
          timestamp: Date.now()
        });
        
        // Break out of the loop since we successfully executed a trade
        break;
      } catch (tradeError) {
        // Log the failed attempt
        logger.error(`Failed to execute trade for ${opportunity.pair.pairA}/${opportunity.pair.pairB}: ${tradeError instanceof Error ? tradeError.message : String(tradeError)}`);
        
        await this.firestoreService.logEvent("opportunity_execution_failed", {
          pairA: opportunity.pair.pairA,
          pairB: opportunity.pair.pairB,
          action: actionName,
          zScore: opportunity.pair.spreadZScore,
          error: tradeError instanceof Error ? tradeError.message : String(tradeError),
          attemptNumber: attemptedPairs
        });
        
        // Continue to the next opportunity
        continue;
      }
      } // End of for loop for opportunities
      
      // If we tried opportunities but couldn't execute any of them
      if (opportunities.length > 0 && !executedTrade) {
        logger.warn(`Attempted ${attemptedPairs} opportunities but couldn't execute any trades`);
        
        await this.firestoreService.logEvent("all_opportunities_failed", {
          attemptedCount: attemptedPairs,
          totalOpportunities: opportunities.length,
          timestamp: Date.now()
        });
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error in checkForOpportunities: ${errorMessage}`);
      
      // Log the error to Firestore for monitoring
      await this.firestoreService.logEvent("opportunities_check_error", {
        error: errorMessage,
        timestamp: Date.now(),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  /**
   * Get current strategy dashboard data
   */
  async getDashboardData(assets: string[]): Promise<{
    tradablePairs: CorrelatedPairData[];
    activeTrades: any[];
    totalPositions: number;
    portfolioValue: number;
    availableMargin: number;
  }> {
    try {
      // Get current positions
      const positions = await this.positionManager.getActivePositions();

      // Get portfolio value and available margin
      const { portfolioValue, availableMargin } = await this.executor.getAccountBalanceAndPortfolioValue();

      return {
        tradablePairs: this.tradablePairs,
        activeTrades: positions,
        totalPositions: positions.length,
        portfolioValue,
        availableMargin,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error getting dashboard data: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Update all open trades
   */
  async updateOpenTrades(): Promise<void> {
    try {
      await this.logEvent("update_trades_started");
      logger.info("Updating open trades");

      // Let position manager handle updates
      await this.positionManager.updateOpenPositions();

      await this.logEvent("update_trades_completed");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Error updating open trades: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validate that a pair trade can be executed without creating duplicate asset positions
   * Performs comprehensive checks across database and exchange to ensure pair consistency
   * @param pairA First asset in the pair
   * @param pairB Second asset in the pair
   * @param side Optional trade direction (long/short)
   * @returns true if the trade is valid, false otherwise
   */
  private async validatePairTrade(pairA: string, pairB: string, side?: 'long' | 'short'): Promise<boolean> {
    try {
      logger.info(`Validating pair trade for ${pairA}/${pairB}`);
      
      // Format trading pairs with -PERP suffix for exchange interactions
      const formatAssetSymbol = (symbol: string): string => {
        // Add -PERP suffix if not already present
        if (!symbol.endsWith("-PERP")) {
          return `${symbol}-PERP`;
        }
        return symbol;
      };
      
      const tradingPairA = formatAssetSymbol(pairA);
      const tradingPairB = formatAssetSymbol(pairB);
      
      // First check: Get current positions directly from the exchange (source of truth)
      // This gets the actual positions on the exchange regardless of our DB state
      const exchangePositions = await this.executor.getPositions();
      const activeExchangeAssets = exchangePositions
        .filter((pos: { position: string; coin: string }) => {
          // Consider positions with significant size (not tiny leftover positions)
          // Convert position to number and check if it's greater than a small threshold
          const positionSize = parseFloat(pos.position);
          return positionSize !== 0 && Math.abs(positionSize) > 0.001;
        })
        .map((pos: { coin: string }) => pos.coin);
      
      logger.info(`Active positions on exchange: ${activeExchangeAssets.join(', ') || 'none'}`);
      
      // Get positions from our database for cross-reference
      const dbPositions = await this.positionManager.getActivePositions();
      
      // Check if either asset is already in an active position on the exchange
      const exchangeHasPairA = activeExchangeAssets.includes(tradingPairA);
      const exchangeHasPairB = activeExchangeAssets.includes(tradingPairB);
      
      // Check if either asset is already in our database
      const dbHasPairA = dbPositions.some(p => p.symbol === tradingPairA);
      const dbHasPairB = dbPositions.some(p => p.symbol === tradingPairB);
      
      // Critical check: Reject if we already have inconsistent positions
      // If one asset is in an active position on the exchange but not the other, something is wrong
      if (exchangeHasPairA !== exchangeHasPairB) {
        logger.error(`CRITICAL: Exchange position inconsistency detected: ${tradingPairA}=${exchangeHasPairA}, ${tradingPairB}=${exchangeHasPairB}`);
        
        await this.firestoreService.logEvent("critical_pair_inconsistency", {
          pairA: tradingPairA,
          pairB: tradingPairB,
          exchangeHasPairA,
          exchangeHasPairB,
          activeExchangeAssets
        });
        
        return false;
      }
      
      // Check for database vs exchange inconsistencies (our records don't match reality)
      if (dbHasPairA !== exchangeHasPairA || dbHasPairB !== exchangeHasPairB) {
        logger.error(`Database and exchange position mismatch detected!`);
        logger.error(`Exchange: ${tradingPairA}=${exchangeHasPairA}, ${tradingPairB}=${exchangeHasPairB}`);
        logger.error(`Database: ${tradingPairA}=${dbHasPairA}, ${tradingPairB}=${dbHasPairB}`);
        
        await this.firestoreService.logEvent("db_exchange_mismatch", {
          pairA: tradingPairA,
          pairB: tradingPairB,
          exchangeHasPairA,
          exchangeHasPairB,
          dbHasPairA,
          dbHasPairB
        });
        
        return false;
      }
      
      // If we're already trading these assets, don't open new positions
      if (exchangeHasPairA || exchangeHasPairB) {
        logger.warn(`Cannot execute trade for ${pairA}/${pairB} - assets are already in active positions`);
        
        await this.firestoreService.logEvent("trade_validation_failed", {
          reason: "assets_already_in_use",
          pairA,
          pairB,
          exchangeHasPairA,
          exchangeHasPairB
        });
        
        return false;
      }
      
      // Check for pending trades to prevent race conditions
      const pendingTrades = await this.firestoreService.getPendingTrades();
      const pendingAssets = pendingTrades
        .map(trade => trade.symbol)
        .filter(symbol => symbol === tradingPairA || symbol === tradingPairB);
        
      if (pendingAssets.length > 0) {
        logger.warn(`Cannot execute trade for ${pairA}/${pairB} - assets have pending trades: ${pendingAssets.join(', ')}`);
        
        await this.firestoreService.logEvent("trade_validation_failed", {
          reason: "pending_trades_exist",
          pairA,
          pairB,
          pendingAssets
        });
        
        return false;
      }
      
      // Verify trade doesn't conflict with any existing positions
      // This is a higher-level check to ensure we don't exceed our risk limits
      // Count existing positions and make sure we stay within limits
      const totalExistingPositions = activeExchangeAssets.length;
      if (totalExistingPositions >= this.maxPositions) {
        logger.warn(`Cannot execute trade for ${pairA}/${pairB} - already have ${totalExistingPositions}/${this.maxPositions} positions open`);
        
        await this.firestoreService.logEvent("trade_validation_failed", {
          reason: "position_limit_reached",
          pairA,
          pairB,
          currentPositionCount: totalExistingPositions,
          maxAllowed: this.maxPositions
        });
        
        return false;
      }
      
      // Verify current prices exist for both assets
      try {
        const currentPrices = await this.priceDataService.getCurrentPrices([pairA, pairB]);
        if (!currentPrices) {
          logger.warn(`Cannot execute trade for ${pairA}/${pairB} - no price data available`);
          
          await this.firestoreService.logEvent("trade_validation_failed", {
            reason: "no_price_data",
            pairA,
            pairB
          });
          
          return false;
        }
        
        // Check if we have prices for both assets
        const hasPriceA = !!currentPrices[pairA];
        const hasPriceB = !!currentPrices[pairB];
        
        if (!hasPriceA || !hasPriceB) {
          logger.warn(`Cannot execute trade for ${pairA}/${pairB} - missing price data: A=${hasPriceA}, B=${hasPriceB}`);
          
          await this.firestoreService.logEvent("trade_validation_failed", {
            reason: "incomplete_price_data",
            pairA,
            pairB,
            hasPriceA,
            hasPriceB
          });
          
          return false;
        }
      } catch (priceCheckError) {
        logger.warn(`Error checking prices: ${priceCheckError instanceof Error ? priceCheckError.message : String(priceCheckError)}`);
      }
      
      logger.info(`Pair trade validation successful for ${pairA}/${pairB}`);
      return true;
    } catch (error) {
      logger.error(`Error validating pair trade for ${pairA} and ${pairB}:`, error);
      await this.firestoreService.logEvent("trade_validation_error", {
        pairA,
        pairB,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  

  /**
   * Close an existing position - delegated to PositionManager which will handle both positions
   */
  async closePosition(
    tradeId: string,
    reason: string
  ): Promise<boolean> {
    try {
      logger.info(`Strategy closing position ${tradeId} with reason: ${reason}`);
      return await this.positionManager.closePosition(tradeId, reason);
    } catch (error) {
      logger.error(`Failed to close trade ${tradeId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.firestoreService.logEvent('error_closing_position', {
        tradeId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Open a new position with enhanced validation
   */
  async openPosition(
    symbol: string,
    side: 'long' | 'short',
    size: Decimal,
    leverage: number = 1,
    stopLoss?: Decimal,
    takeProfit?: Decimal,
    correlatedPair?: { symbol: string; correlation: number }
  ): Promise<string> {
    try {
      logger.info(`Strategy opening position for ${symbol} (${side}) with size ${size}`);
      
      // If this is part of a pair trade, validate the pair
      if (correlatedPair) {
        logger.info(`Validating pair trade between ${symbol} and ${correlatedPair.symbol}`);
        const isValidPair = await this.validatePairTrade(symbol, correlatedPair.symbol, side);
        if (!isValidPair) {
          const errorMsg = `Pair trade validation failed for ${symbol} and ${correlatedPair.symbol}`;
          logger.error(errorMsg);
          await this.firestoreService.logEvent('position_open_failed', {
            symbol,
            correlatedPair: correlatedPair.symbol,
            reason: 'validation_failed'
          });
          throw new Error(errorMsg);
        }
      } else {
        // Even for single positions, check existing positions to avoid duplicates
        const activePositions = await this.positionManager.getActivePositions();
        const hasActivePosition = activePositions.some(p => p.symbol === symbol);
        
        if (hasActivePosition) {
          const errorMsg = `Cannot open position for ${symbol} - asset already has an active position`;
          logger.error(errorMsg);
          await this.firestoreService.logEvent('position_open_failed', {
            symbol,
            reason: 'asset_already_in_use'
          });
          throw new Error(errorMsg);
        }
      }

      // Get current price to log dollar value of position
      const currentPrices = await this.priceDataService.getCurrentPrices([symbol]);
      if (currentPrices && currentPrices[symbol]) {
        const currentPrice = currentPrices[symbol];
        const dollarValue = size.mul(currentPrice);
        logger.info(`Opening position for ${symbol} with size ${size} (${dollarValue.toNumber().toFixed(2)} USDC)`);
      }

      // Delegate to position manager
      const positionId = await this.positionManager.openPosition(
        symbol,
        side,
        size,
        leverage,
        stopLoss,
        takeProfit,
        correlatedPair
      );
      
      logger.info(`Successfully opened position for ${symbol}, ID: ${positionId}`);
      return positionId;
    } catch (error) {
      logger.error(`Failed to open position for ${symbol}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      await this.firestoreService.logEvent('error_opening_position', {
        symbol,
        side,
        size: size.toString(),
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Get the tick size for a given asset
   * @param asset The asset symbol
   * @returns The tick size for the asset
   */
  private async getTickSize(asset: string): Promise<number> {
    try {
      // Get the correct tick size from Hyperliquid
      const tickSize = await this.executor.getTickSize(asset);
      return tickSize;
    } catch (error) {
      logger.error(`Error getting tick size for ${asset}:`, error);
      throw error;
    }
  }
}
