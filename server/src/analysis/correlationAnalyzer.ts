import { FirestoreService, OHLCV } from "../services/firestoreService";
import { logger } from "../utils/logger";
import { PriceDataService } from "../services/priceDataService";
import { isWhitelisted } from "../utils/assetMappings";

// Define the structure for correlated pair data
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
  /** P-value from cointegration test (if available) */
  pValue?: number | null;
  timestamp: number;
}

// Define the structure for cointegration test results
interface CointegrationTestResult {
  /** Regression coefficient (hedge ratio) from OLS regression */
  regressionCoefficient: number;
  /** Mean of the spread series */
  spreadMean: number | null;
  /** Standard deviation of the spread series */
  spreadStd: number | null;
  /** Current spread Z-score */
  spreadZScore: number | null;
  /** Half-life of mean reversion */
  halfLife: number | null;
  /** P-value from cointegration test (if available) */
  pValue?: number | null;
}

// Helper type for strategy decisions
type StrategyAction = "open_long" | "open_short" | "close" | "hold" | "none";

// OLS regression result interface
interface OLSResult {
  slope: number;
  intercept: number;
  stdErr: number;
  tStat: number;
}

/**
 * Analyzes correlations and cointegration between assets
 */
export class CorrelationAnalyzer {
  private readonly firestoreService: FirestoreService;
  private readonly priceDataService: PriceDataService;

  constructor(
    firestoreService: FirestoreService,
    priceDataService: PriceDataService
  ) {
    this.firestoreService = firestoreService;
    this.priceDataService = priceDataService;
    logger.info("Initializing CorrelationAnalyzer");
  }

  private initialize() {
    logger.info("CorrelationAnalyzer initialized");
  }

  /**
   * Converts timeframe string (e.g., '30d', '1h') to days
   */
  private timeframeToDays(timeframe: string): number {
    const unit = timeframe.slice(-1).toLowerCase();
    const value = parseInt(timeframe.slice(0, -1), 10);
    if (isNaN(value)) return 30; // Default to 30 days if parse fails

    switch (unit) {
      case "d":
        return value;
      case "h":
        return value / 24;
      case "m":
        return value / (24 * 60);
      default:
        return 30; // Default if unit is unrecognized
    }
  }

  /**
   * Calculate variance of a price series
   * @param prices Array of prices
   * @returns Variance
   */
  private calculateVariance(prices: number[]): number {
    const n = prices.length;
    if (n < 2) return 0;
    
    const mean = prices.reduce((sum, val) => sum + val, 0) / n;
    const variance = prices.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / n;
    return variance;
  }

  /**
   * Calculate correlation between two price series
   * @param pricesA Array of prices for asset A
   * @param pricesB Array of prices for asset B
   * @returns Correlation coefficient
   */
  public calculateCorrelation(pricesA: number[], pricesB: number[]): number {
    if (pricesA.length !== pricesB.length) {
      logger.warn("Price series have different lengths");
      return 0;
    }

    const n = pricesA.length;
    if (n < 2) {
      logger.warn("Not enough data points to calculate correlation");
      return 0;
    }

    // Calculate means
    const meanA = pricesA.reduce((sum, val) => sum + val, 0) / n;
    const meanB = pricesB.reduce((sum, val) => sum + val, 0) / n;

    // Calculate covariance and variances
    let cov = 0;
    let varA = 0;
    let varB = 0;

    for (let i = 0; i < n; i++) {
      const diffA = pricesA[i] - meanA;
      const diffB = pricesB[i] - meanB;
      cov += diffA * diffB;
      varA += diffA * diffA;
      varB += diffB * diffB;
    }

    // Calculate correlation coefficient
    const correlation = cov / Math.sqrt(varA * varB);
    return correlation;
  }

  /**
   * Performs Ordinary Least Squares (OLS) regression: y = slope * x + intercept
   * Returns slope, intercept, and standard error of the slope estimate.
   */
  performOLS(x: number[], y: number[]): OLSResult {
    const n = x.length;
    if (n < 2 || n !== y.length) {
      logger.error("Input arrays must have the same length and at least two elements for OLS.");
      return { slope: NaN, intercept: NaN, stdErr: NaN, tStat: NaN };
    }

    let sumX = 0,
      sumY = 0,
      sumXY = 0,
      sumX2 = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
      sumXY += x[i] * y[i];
      sumX2 += x[i] * x[i];
    }

    const meanX = sumX / n;
    const meanY = sumY / n;
    const denominator = sumX2 - sumX * meanX; // sum((xi - meanX)^2)

    // Handle constant X case (denominator is zero or near-zero)
    if (Math.abs(denominator) < 1e-10) {
      logger.warn("OLS failed: Denominator close to zero, likely constant X values.");
      return { slope: NaN, intercept: meanY, stdErr: NaN, tStat: NaN };
    }

    const slope = (sumXY - sumX * meanY) / denominator;
    const intercept = meanY - slope * meanX;

    // Calculate Standard Error of the slope
    let ssr = 0; // Sum of Squared Residuals
    for (let i = 0; i < n; i++) {
      const predictedY = slope * x[i] + intercept;
      const error = y[i] - predictedY;
      ssr += error * error;
    }

    // Need at least 3 points for variance estimate in simple linear regression
    if (n <= 2) {
      return { slope, intercept, stdErr: NaN, tStat: NaN };
    }

    const variance = ssr / (n - 2);
    if (variance < 0) {
      logger.warn("OLS calculated negative variance for residuals.");
      return { slope, intercept, stdErr: NaN, tStat: NaN };
    }

    // Standard Error of the slope estimate
    const stdErrSlope = Math.sqrt(variance / denominator);

    // Calculate t-statistic
    const tStat = slope / stdErrSlope;

    return {
      slope,
      intercept,
      stdErr: isNaN(stdErrSlope) ? NaN : stdErrSlope,
      tStat: isNaN(tStat) ? NaN : tStat,
    };
  }

  /**
   * Perform cointegration test using spread analysis on price data
   * This test:
   * 1. Performs OLS regression to find the hedge ratio
   * 2. Calculates the spread between the assets
   * 3. Calculates spread statistics (mean, std, Z-score)
   * 4. Calculates the half-life of mean reversion
   * 5. Validates the cointegration results with quality checks
   * @param pricesA Array of prices for asset A
   * @param pricesB Array of prices for asset B
   * @returns Cointegration test results
   */
  public testForCointegration(pricesA: number[], pricesB: number[]): CointegrationTestResult {
    try {
      // Ensure arrays are of equal length and have sufficient elements
      // Need at least 30 data points for reliable cointegration testing
      const len = Math.min(pricesA.length, pricesB.length);
      const MIN_DATA_POINTS = 30;
      
      if (len < MIN_DATA_POINTS) {
        logger.warn(`Not enough data points for reliable cointegration test: ${len} < ${MIN_DATA_POINTS}`);
        return {
          regressionCoefficient: 0,
          spreadMean: null,
          spreadStd: null,
          spreadZScore: null,
          halfLife: null
        };
      }

      // Truncate arrays to the same length
      const alignedPricesA = pricesA.slice(-len);
      const alignedPricesB = pricesB.slice(-len);

      // Check for non-zero variance in each price series
      const varA = this.calculateVariance(alignedPricesA);
      const varB = this.calculateVariance(alignedPricesB);
      
      if (varA < 1e-10 || varB < 1e-10) {
        logger.warn(`Price series has near-zero variance: varA=${varA}, varB=${varB}`);
        return {
          regressionCoefficient: 0,
          spreadMean: null,
          spreadStd: null,
          spreadZScore: null,
          halfLife: null
        };
      }

      // Perform OLS regression to find hedge ratio
      const regressionResult = this.performOLS(alignedPricesA, alignedPricesB);
      if (isNaN(regressionResult.slope)) {
        logger.warn("OLS failed to produce valid slope");
        return {
          regressionCoefficient: 0,
          spreadMean: null,
          spreadStd: null,
          spreadZScore: null,
          halfLife: null
        };
      }

      const hedgeRatio = regressionResult.slope;

      // Calculate spread: y - hedge_ratio * x
      const spread = alignedPricesB.map((price, i) => price - hedgeRatio * alignedPricesA[i]);

      // Calculate spread statistics
      const spreadMean = spread.reduce((sum, val) => sum + val, 0) / spread.length;
      const spreadStd = Math.sqrt(
        spread.reduce((sum, val) => sum + Math.pow(val - spreadMean, 2), 0) / spread.length
      );

      // Check if the spread standard deviation is too small
      if (spreadStd < 1e-8) {
        logger.warn(`Spread standard deviation is too small: ${spreadStd}`);
        return {
          regressionCoefficient: hedgeRatio,
          spreadMean,
          spreadStd,
          spreadZScore: null,
          halfLife: null
        };
      }

      // Calculate current spread Z-score
      const currentSpread = spread[spread.length - 1];
      const spreadZScore = (currentSpread - spreadMean) / spreadStd;

      // Calculate half-life using exponential decay formula
      let halfLife: number | null = null;
      let pValue: number | null = null;
      
      if (spread.length > MIN_DATA_POINTS) {
        // Calculate lagged spread
        const laggedSpread = spread.slice(0, -1);
        
        // Calculate spread change
        const spreadChange = spread.slice(1).map((val, i) => val - laggedSpread[i]);
        
        // Calculate the correlation between spread change and lagged spread
        const spreadChangeMean = spreadChange.reduce((sum, val) => sum + val, 0) / spreadChange.length;
        const laggedSpreadMean = laggedSpread.reduce((sum, val) => sum + val, 0) / laggedSpread.length;
        
        const numerator = spreadChange.reduce((sum, val, i) => 
          sum + (val - spreadChangeMean) * (laggedSpread[i] - laggedSpreadMean), 0
        );
        
        const denominator = laggedSpread.reduce((sum, val) => 
          sum + Math.pow(val - laggedSpreadMean, 2), 0
        );
        
        // Ensure denominator is not too close to zero
        if (Math.abs(denominator) < 1e-10) {
          logger.warn("Denominator in half-life calculation is too close to zero");
          return {
            regressionCoefficient: hedgeRatio,
            spreadMean,
            spreadStd,
            spreadZScore,
            halfLife: null
          };
        }
        
        const beta = numerator / denominator;
        
        // For mean reversion, beta should be negative
        if (beta >= 0) {
          logger.warn(`Beta coefficient is not negative (${beta.toFixed(4)}), indicating no mean reversion`);
          return {
            regressionCoefficient: hedgeRatio,
            spreadMean,
            spreadStd,
            spreadZScore,
            halfLife: null
          };
        }
        
        // Calculate half-life in periods
        halfLife = Math.log(2) / Math.abs(beta);
        
        // Check if half-life is reasonable
        if (halfLife < 1 || halfLife > 100 || !isFinite(halfLife)) {
          logger.warn(`Half-life outside reasonable range: ${halfLife?.toFixed(2) || 'null'} periods`);
          halfLife = null;
        }
        
        // Log the half-life calculation details
        logger.debug(`Half-life calculation for pair: beta=${beta.toFixed(4)}, halfLife=${halfLife?.toFixed(2) || 'null'} periods`);
      }

      // Log spread statistics
      logger.info(`Spread statistics for pair: spreadMean=${spreadMean.toFixed(4)}, spreadStd=${spreadStd.toFixed(4)}, spreadZScore=${spreadZScore.toFixed(2)}, halfLife=${halfLife?.toFixed(2) || 'null'} periods`);

      return {
        regressionCoefficient: hedgeRatio,
        spreadMean,
        spreadStd,
        spreadZScore,
        halfLife
      };
    } catch (error) {
      logger.error("Error in cointegration test:", error);
      throw error;
    }
  }

  /**
   * Finds potentially correlated pairs based on historical price data.
   * Calculates correlation on log returns for better stationarity.
   */
  async findCorrelatedPairs(
    assets: string[],
    correlationThreshold: number = 0.9
  ): Promise<CorrelatedPairData[]> {
    const correlatedPairData: CorrelatedPairData[] = [];

    // Fetch all snapshots for all assets
    const allSnapshots = await this.priceDataService.getHistoricalPriceDataByPointsForMultipleAssets(assets, 96);
    
    // Log the number of data points retrieved for each asset
    Object.entries(allSnapshots).forEach(([asset, prices]) => {
      logger.info(`Retrieved ${prices.length} price data points for ${asset}`);
    });

    // Process each pair of assets
    for (let i = 0; i < assets.length; i++) {
      const assetA = assets[i];
      
      // Get price data for asset A
      const pricesA = allSnapshots[assetA];
      if (!pricesA || pricesA.length < 2) {
        logger.warn(`Insufficient data points for ${assetA} (${pricesA?.length || 0} points)`);
        continue;
      }

      for (let j = i + 1; j < assets.length; j++) {
        const assetB = assets[j];
        
        // Get price data for asset B
        const pricesB = allSnapshots[assetB];
        if (!pricesB || pricesB.length < 2) {
          logger.warn(`Insufficient data points for ${assetB} (${pricesB?.length || 0} points)`);
          continue;
        }

        // Ensure arrays are of equal length
        const len = Math.min(pricesA.length, pricesB.length);
        const alignedPricesA = pricesA.slice(-len);
        const alignedPricesB = pricesB.slice(-len);

        // Extract prices for correlation calculation
        const priceSeriesA = alignedPricesA.map((price) => price.price);
        const priceSeriesB = alignedPricesB.map((price) => price.price);

        // Log the number of aligned data points and the first few prices
        logger.info(`Analyzing pair ${assetA}/${assetB} with ${len} aligned data points`);
        logger.info(`First few prices for ${assetA}:`, priceSeriesA.slice(0, 5));
        logger.info(`First few prices for ${assetB}:`, priceSeriesB.slice(0, 5));

        // Calculate correlation
        const correlation = this.calculateCorrelation(priceSeriesA, priceSeriesB);
        
        if (correlation >= correlationThreshold) {
          // Test for cointegration
          const cointegrationResult = await this.testForCointegration(priceSeriesA, priceSeriesB);
          
          // Only consider pairs with a reasonable half-life (6-15 periods)
          const isCointegrated = cointegrationResult.halfLife !== null && 
            cointegrationResult.halfLife >= 6 && 
            cointegrationResult.halfLife <= 15;
          
          correlatedPairData.push({
            pairA: assetA,
            pairB: assetB,
            correlation,
            cointegrated: isCointegrated,
            regressionCoefficient: cointegrationResult.regressionCoefficient,
            spreadMean: cointegrationResult.spreadMean,
            spreadStd: cointegrationResult.spreadStd,
            spreadZScore: cointegrationResult.spreadZScore,
            halfLife: cointegrationResult.halfLife,
            timestamp: Date.now()
          });
        }
      }
    }

    return correlatedPairData;
  }

  /**
   * Tests previously identified correlated pairs for cointegration using the ADF test.
   * Updates Firestore records with cointegration results.
   */
  async updateCointegrationData(correlatedPairs: CorrelatedPairData[]): Promise<void> {
    logger.info(`Updating cointegration data for ${correlatedPairs.length} pairs`);

    // Get all unique symbols from the correlated pairs
    const uniqueSymbols = Array.from(new Set([
      ...correlatedPairs.map(p => p.pairA),
      ...correlatedPairs.map(p => p.pairB)
    ]));

    // Fetch snapshots for all unique symbols
    const allSnapshots = await this.priceDataService.getHistoricalPriceDataByPointsForMultipleAssets(
      uniqueSymbols,
      96
    );

    for (const pair of correlatedPairs) {
      try {
        // Get price data for both assets from snapshots
        const pricesA = allSnapshots[pair.pairA];
        const pricesB = allSnapshots[pair.pairB];

        if (!pricesA || !pricesB) {
          logger.warn(`Missing price data for pair ${pair.pairA}/${pair.pairB}`);
          continue;
        }

        // Ensure arrays are of equal length
        const len = Math.min(pricesA.length, pricesB.length);
        const alignedPricesA = pricesA.slice(-len);
        const alignedPricesB = pricesB.slice(-len);

        // Extract prices
        const priceSeriesA = alignedPricesA.map((price) => price.price);
        const priceSeriesB = alignedPricesB.map((price) => price.price);

        // Test for cointegration
        const cointegrationResult = await this.testForCointegration(priceSeriesA, priceSeriesB);

        // Update the pair data with new cointegration results
        pair.cointegrated = cointegrationResult.halfLife !== null && cointegrationResult.halfLife < 30;
        pair.regressionCoefficient = cointegrationResult.regressionCoefficient;
        pair.spreadMean = cointegrationResult.spreadMean;
        pair.spreadStd = cointegrationResult.spreadStd;
        pair.spreadZScore = cointegrationResult.spreadZScore;
        pair.halfLife = cointegrationResult.halfLife;
        pair.timestamp = Date.now();

        logger.info(`Updated cointegration data for pair ${pair.pairA}/${pair.pairB}`);
      } catch (error) {
        logger.error(`Error updating cointegration data for pair ${pair.pairA}/${pair.pairB}:`, error);
      }
    }
  }

  /**
   * Calculates the current Z-score for a given cointegrated pair.
   */
  async calculateCurrentZScore(pairData: CorrelatedPairData): Promise<number | null> {
    if (
      !pairData.cointegrated ||
      pairData.regressionCoefficient === null ||
      pairData.spreadMean === null ||
      pairData.spreadStd === null
    ) {
      logger.warn(
        `Cannot calculate Z-score for non-cointegrated or incomplete pair data: ${pairData.pairA}/${pairData.pairB}`
      );
      return null;
    }

    try {
      // Fetch current prices for both assets
      const currentPrices = await this.priceDataService.getCurrentPrices([pairData.pairA, pairData.pairB]);
      const priceA = currentPrices[pairData.pairA];
      const priceB = currentPrices[pairData.pairB];

      if (!priceA || !priceB) {
        logger.warn(`Could not fetch current prices for ${pairData.pairA} or ${pairData.pairB} to calculate Z-score.`);
        return null;
      }

      // Calculate current spread: log(priceA) - beta * log(priceB)
      const currentLogPriceA = Math.log(Number(priceA));
      const currentLogPriceB = Math.log(Number(priceB));
      const currentSpread = currentLogPriceA - pairData.regressionCoefficient * currentLogPriceB;

      // Calculate Z-score: (currentSpread - mean) / stdDev
      const zScore = (currentSpread - pairData.spreadMean) / pairData.spreadStd;

      if (isNaN(zScore) || !isFinite(zScore)) {
        logger.warn(`Z-score calculation resulted in NaN or Infinity for ${pairData.pairA}/${pairData.pairB}`);
        return null;
      }

      return zScore;
    } catch (error) {
      logger.error(`Error calculating current Z-score for ${pairData.pairA}/${pairData.pairB}: ${error}`, error);
      return null;
    }
  }

  /**
   * Evaluates a potential pairs trading strategy based on cointegration data and current prices.
   */
  async evaluatePairStrategy(pairA: string, pairB: string, pairData: CorrelatedPairData): Promise<StrategyAction> {
    try {
      // Calculate current Z-score to get the current spread and Z-score
      const zScore = await this.calculateCurrentZScore(pairData);
      if (zScore === null) {
        logger.warn(`Cannot evaluate pair ${pairA}/${pairB} due to missing data`);
        return "none";
      }

      // If half-life is null, we can still evaluate based on correlation and spread
      if (pairData.halfLife === null) {
        logger.warn(`No half-life data available for pair ${pairA}/${pairB}, evaluating based on correlation and spread`);
      }

      // Log the current state
      logger.info(`Pair ${pairA}/${pairB} - Z-Score: ${zScore.toFixed(2)}, Correlation: ${pairData.correlation.toFixed(2)}`);

      // Evaluate based on Z-score and correlation
      if (pairData.correlation >= 0.8) { // Require strong correlation
        if (zScore >= 1.5) {
          return "open_short";
        } else if (zScore <= -1.5) {
          return "open_long";
        } else if (zScore >= -0.5 && zScore <= 0.5) {
          return "close";
        }
      }

      return "none";
    } catch (error) {
      logger.error(`Error evaluating pair ${pairA}/${pairB}: ${error}`, error);
      return "none";
    }
  }
}
