import express, { Request, Response, Router } from "express";
import { initServices } from "../services";
import { logger } from "../utils/logger";
import { analysisWhitelist, formatAssetSymbol } from "../utils/assetMappings";
import { CorrelatedPairData } from "../analysis/correlationAnalyzer";

/**
 * Retry an operation with exponential backoff
 * @param operation Function to retry
 * @param maxRetries Maximum number of retry attempts
 * @returns Result of the operation
 */
async function retryWithBackoff<T>(operation: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`API operation failed (attempt ${attempt}/${maxRetries}):`, error);
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, 8s, etc.
        const delay = 1000 * Math.pow(2, attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Operation failed after multiple retries");
}

/**
 * Utility function to get account balance from Hyperliquid using the SDK
 * @returns The account balance as a number
 */
async function getAccountBalance(): Promise<number> {
  try {
    const { executor } = initServices();
    // Use retry mechanism for critical API call
    const { balance } = await retryWithBackoff(() => executor.getAccountBalanceAndPortfolioValue());
    return typeof balance === "number" ? balance : 0;
  } catch (error) {
    logger.error("Error getting account balance via SDK:", error);
    return 0;
  }
}

/**
 * Wrapper for route handlers to catch errors and provide consistent error responses
 */
function asyncHandler(fn: (req: Request, res: Response) => Promise<any>) {
  return async (req: Request, res: Response) => {
    try {
      await fn(req, res);
    } catch (error) {
      logger.error(`Unhandled error in route handler: ${req.method} ${req.path}`, error);
      res.status(500).json({
        status: "error",
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  };
}

/**
 * Check if wallet address is configured
 * @returns Object with success flag and wallet address or error message
 */
function checkWalletConfig(): { success: boolean; walletAddress?: string; error?: string } {
  const walletAddress = process.env.HYPERLIQUID_MAIN_WALLET_ADDRESS;
  if (!walletAddress) {
    logger.error("HYPERLIQUID_MAIN_WALLET_ADDRESS environment variable is not set");
    return {
      success: false,
      error: "Wallet address not configured",
    };
  }
  return {
    success: true,
    walletAddress,
  };
}

/**
 * Get tradable assets with error handling
 */
async function getTradableAssets(): Promise<{ success: boolean; assets?: string[]; error?: string }> {
  try {
    const assets = analysisWhitelist.map((symbol) => formatAssetSymbol(symbol));

    if (!assets || assets.length === 0) {
      logger.warn("No tradable assets available");
      return {
        success: false,
        error: "No tradable assets available",
        assets: [],
      };
    }

    return {
      success: true,
      assets,
    };
  } catch (error) {
    logger.error("Error getting tradable assets:", error);
    return {
      success: false,
      error: String(error),
    };
  }
}

// Create router instance
export const apiRouter: Router = express.Router();

// Health check endpoint
apiRouter.get(
  "/health-check",
  asyncHandler(async (req: Request, res: Response) => {
    // Check wallet configuration
    const walletConfig = checkWalletConfig();
    if (!walletConfig.success) {
      return res.status(500).json({
        status: "error",
        timestamp: Date.now(),
        error: walletConfig.error,
      });
    }

    // Fetch tradable assets
    const assetsResult = await getTradableAssets();
    if (!assetsResult.success) {
      return res.status(200).json({
        status: "unhealthy",
        timestamp: Date.now(),
        environment: process.env.NODE_ENV || "unknown",
        assets: assetsResult.error,
        assetCount: 0,
        balance: 0,
        walletAddress: walletConfig.walletAddress,
      });
    }

    // Get balance using the SDK
    const balance = await getAccountBalance();
    logger.info(`Account value from SDK: ${balance}`);

    // Return the health check response
    return res.status(200).json({
      status: "healthy",
      timestamp: Date.now(),
      environment: process.env.NODE_ENV || "unknown",
      assets: `Found ${assetsResult.assets!.length} assets`,
      assetCount: assetsResult.assets!.length,
      balance: balance,
      walletAddress: walletConfig.walletAddress,
    });
  })
);

// Dashboard data endpoint (replaces the Firebase function)
apiRouter.get(
  "/dashboard-data",
  asyncHandler(async (req: Request, res: Response) => {
    // Check wallet configuration
    const walletConfig = checkWalletConfig();
    if (!walletConfig.success) {
      return res.status(500).json({
        error: "Configuration error",
        message: walletConfig.error,
      });
    }

    // Get tradable assets
    const assetsResult = await getTradableAssets();
    if (!assetsResult.success && !assetsResult.assets?.length) {
      return res.status(200).json({
        performance: { totalPnl: 0, winRate: 0, profitableTrades: 0, totalTrades: 0, pnlHistory: [] },
        activeTrades: [],
        correlatedPairs: [],
        riskMetrics: {
          totalBalance: 0,
          availableMargin: 0,
          maxOpenPositions: 4,  // Fixed to match our settings
          currentRiskPercent: 0,
          maxRiskPercent: 0.25,  // 25% per position
          positionSizePercent: 0.25,  // 25% position size
        },
        message: assetsResult.error,
        timestamp: Date.now(),
      });
    }

    // Get account balance through SDK
    const accountBalance = await getAccountBalance();
    logger.info(`Account balance from SDK: ${accountBalance}`);

    // Get dashboard data and performance metrics
    const { pairsStrategy, firestoreService } = initServices();

    try {
      // Get dashboard data from strategy
      const dashboardData = await pairsStrategy.getDashboardData(assetsResult.assets || []);

      // Override the portfolio value with our SDK balance
      if (accountBalance > 0) {
        logger.info(`Overriding portfolio value with SDK balance: ${accountBalance}`);
        dashboardData.portfolioValue = accountBalance;
      }

      // Get performance data
      const botPerformance = await firestoreService.getBotPerformance();

      // Format and return response with consistent types
      const formattedResponse = {
        performance: {
          totalPnl: Number(botPerformance?.totalPnl || 0),
          dailyPnl: Number(botPerformance?.dailyPnl || 0),
          winRate: Number(botPerformance?.winRate || 0),
          profitableTrades: Number(botPerformance?.profitableTrades || 0),
          totalTrades: Number(botPerformance?.totalTrades || 0),
          pnlHistory: Array.isArray(botPerformance?.pnlHistory) 
            ? botPerformance.pnlHistory.map((entry: any) => ({
                date: entry.date,
                value: Number(entry.value || 0)
              }))
            : [],
        },
        activeTrades: (dashboardData.activeTrades || []).map(trade => {
          // Normalize active trades
          const executedPrice = typeof trade.executedPrice === 'string' 
            ? parseFloat(trade.executedPrice) 
            : (trade.executedPrice || 0);
            
          const executedSize = typeof trade.executedSize === 'string' 
            ? parseFloat(trade.executedSize) 
            : (trade.executedSize || 0);
            
          // Normalize side
          let side = (trade.side || 'unknown').toLowerCase();
          if (side === 'buy') side = 'long';
          if (side === 'sell') side = 'short';
          
          return {
            id: trade.id,
            symbol: trade.symbol,
            side,
            status: 'open',
            executedPrice,
            executedSize,
            leverage: Number(trade.leverage || 1),
            timestamp: Number(trade.timestamp || Date.now()),
            pnl: Number(trade.pnl || 0),
            correlatedPair: trade.correlatedPair || null
          };
        }),
        correlatedPairs: dashboardData.tradablePairs.map((pair) => ({
          id: `${pair.pairA}_${pair.pairB}`,
          pairA: pair.pairA,
          pairB: pair.pairB,
          correlation: Number(pair.correlation || 0),
          cointegrated: !!pair.cointegrated,
          regressionCoefficient: pair.regressionCoefficient !== null ? Number(pair.regressionCoefficient) : null,
          spreadMean: pair.spreadMean !== null ? Number(pair.spreadMean) : null,
          spreadStd: pair.spreadStd !== null ? Number(pair.spreadStd) : null,
          spreadZScore: pair.spreadZScore !== null ? Number(pair.spreadZScore) : null,
          halfLife: pair.halfLife !== null ? Number(pair.halfLife) : null,
          pValue: pair.pValue !== null ? Number(pair.pValue) : null,
          timestamp: Date.now(),
        })),
        riskMetrics: {
          totalBalance: Number(dashboardData.portfolioValue || 0),
          availableMargin: Number(dashboardData.availableMargin || 0),
          maxOpenPositions: 4,  // Fixed to match our settings
          currentRiskPercent: Number(dashboardData.activeTrades.length) / 4,
          maxRiskPercent: 0.25,  // 25% per position
          positionSizePercent: 0.25,  // 25% position size
        },
        accountMetrics: {
          id: 'current',
          totalBalance: Number(dashboardData.portfolioValue || 0),
          availableMargin: Number(dashboardData.availableMargin || 0),
          dailyPnl: Number(botPerformance?.dailyPnl || 0),
          totalPnl: Number(botPerformance?.totalPnl || 0),
          timestamp: Date.now(),
          updatedAt: new Date().toISOString()
        },
        walletAddress: walletConfig.walletAddress,
        timestamp: Date.now(),
      };

      return res.status(200).json(formattedResponse);
    } catch (dataError) {
      logger.error("Error getting dashboard or performance data:", dataError);

      // Return a default response with the balance we got from the SDK call
      return res.status(200).json({
        performance: { 
          totalPnl: 0, 
          dailyPnl: 0, 
          winRate: 0, 
          profitableTrades: 0, 
          totalTrades: 0, 
          pnlHistory: [] 
        },
        activeTrades: [],
        correlatedPairs: [],
        riskMetrics: {
          totalBalance: Number(accountBalance),
          availableMargin: Number(accountBalance),
          maxOpenPositions: 4,  // Fixed to match our settings
          currentRiskPercent: 0,
          maxRiskPercent: 0.25,  // 25% per position
          positionSizePercent: 0.25,  // 25% position size
        },
        accountMetrics: {
          id: 'current',
          totalBalance: Number(accountBalance),
          availableMargin: Number(accountBalance),
          dailyPnl: 0,
          totalPnl: 0,
          timestamp: Date.now(),
          updatedAt: new Date().toISOString()
        },
        walletAddress: walletConfig.walletAddress,
        assetCount: assetsResult.assets?.length || 0,
        timestamp: Date.now(),
      });
    }
  })
);

// Asset whitelist endpoint
apiRouter.get(
  "/assets",
  asyncHandler(async (req: Request, res: Response) => {
    // Get all tradable assets
    const assetsResult = await getTradableAssets();

    if (!assetsResult.success) {
      return res.status(200).json({
        status: "warning",
        message: assetsResult.error,
        timestamp: Date.now(),
        assets: {
          all: [],
          whitelisted: [],
        },
      });
    }

    // Filter for whitelisted assets
    const whitelistedAssets = assetsResult.assets!.filter((asset) => analysisWhitelist.includes(asset));

    return res.status(200).json({
      status: "success",
      timestamp: Date.now(),
      assets: {
        all: assetsResult.assets,
        whitelisted: whitelistedAssets,
      },
    });
  })
);

// Trigger manual opportunity check (admin endpoint)
apiRouter.post(
  "/manual-check",
  asyncHandler(async (req: Request, res: Response) => {
    const { pairsStrategy } = initServices();
    await pairsStrategy.checkForOpportunities();

    res.status(200).json({
      message: "Manual opportunity check completed successfully",
      timestamp: Date.now(),
    });
  })
);

// Cloud Run scheduled endpoints for Cloud Scheduler

// Opportunity check endpoint for Cloud Scheduler
apiRouter.post(
  "/opportunity-check",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Opportunity check job triggered by Cloud Scheduler");
    const { firestoreService, pairsStrategy } = initServices();

    try {
      // Run the opportunity check
      await pairsStrategy.checkForOpportunities();

      // Log the completion
      await firestoreService.logEvent("opportunity_check_completed", {
        timestamp: Date.now(),
      });

      res.status(200).json({
        status: "success",
        message: "Opportunity check completed",
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error("Error in opportunity check:", error);
      await firestoreService.logEvent("opportunity_check_error", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error; // Will be caught by asyncHandler
    }
  })
);

// Strategy Initialization (daily at 1 AM)
apiRouter.post(
  "/strategy-initialization",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Strategy initialization job triggered by Cloud Scheduler");
    const { firestoreService, pairsStrategy } = initServices();

    await firestoreService.logEvent("strategy_init_started");

    // Get tradable assets
    const assetsResult = await getTradableAssets();
    if (!assetsResult.success || !assetsResult.assets?.length) {
      logger.warn("No tradable assets returned for strategy initialization");
      await firestoreService.logEvent("strategy_init_skipped", { reason: "No tradable assets returned" });
      return res.status(200).json({
        status: "skipped",
        reason: "No tradable assets returned",
      });
    }

    // Initialize strategy
    await pairsStrategy.initialize(assetsResult.assets);
    await firestoreService.logEvent("strategy_init_completed");

    res.status(200).json({
      status: "success",
      message: "Strategy initialization completed",
      timestamp: Date.now(),
    });
  })
);

// Trade Updates (every 15 minutes)
apiRouter.post(
  "/trade-updates",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Trade updates job triggered by Cloud Scheduler");
    const { firestoreService, pairsStrategy } = initServices();

    await firestoreService.logEvent("trade_update_started");

    // Update existing trades
    await pairsStrategy.updateOpenTrades();
    await firestoreService.logEvent("trade_update_completed");

    res.status(200).json({
      status: "success",
      message: "Trade updates completed",
      timestamp: Date.now(),
    });
  })
);

// Price data collection and correlation analysis endpoint
apiRouter.post(
  "/collect-price-data",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Price data collection and correlation analysis job triggered by Cloud Scheduler");
    const { firestoreService, priceDataService, correlationAnalyzer } = initServices();

    await firestoreService.logEvent("price_data_collection_started");

    // Collect price data
    await priceDataService.collectAndStorePriceSnapshots();
    logger.info("Price data collection completed successfully");

    // Get tradable assets for correlation analysis
    const assetsResult = await getTradableAssets();
    if (!assetsResult.success || !assetsResult.assets?.length) {
      logger.warn("No tradable assets returned from Hyperliquid API");
      await firestoreService.logEvent("correlation_analysis_skipped", { reason: "No tradable assets returned" });
      return res.status(200).json({
        status: "success",
        message: "Price data collection completed, no tradable assets for correlation analysis",
        timestamp: Date.now(),
      });
    }

    // Filter to only include whitelisted assets
    const whitelistedAssets = assetsResult.assets.filter((asset) => analysisWhitelist.includes(asset));
    logger.info(
      `Using ${whitelistedAssets.length} whitelisted assets out of ${assetsResult.assets.length} total assets`
    );

    // Find correlated pairs
    const correlatedPairs = await correlationAnalyzer.findCorrelatedPairs(
      whitelistedAssets,
      0.95 // Updated correlation threshold
    );

    logger.info(`Found ${correlatedPairs.length} correlated pairs`);

    // Update correlated pairs in Firestore
    await Promise.all(
      correlatedPairs.map((pair: CorrelatedPairData) =>
        firestoreService.updateCorrelatedPair(`${pair.pairA}_${pair.pairB}`, {
          pairA: pair.pairA,
          pairB: pair.pairB,
          correlation: pair.correlation,
          cointegrated: pair.cointegrated,
          regressionCoefficient: pair.regressionCoefficient,
          spreadMean: pair.spreadMean,
          spreadStd: pair.spreadStd,
          halfLife: pair.halfLife,
          timestamp: Date.now(),
        })
      )
    );

    logger.info(
      `Correlation analysis completed successfully. Found ${correlatedPairs.length} correlated pairs`
    );

    await firestoreService.logEvent("price_data_collection_completed", {
      correlatedPairsCount: correlatedPairs.length,
    });

    res.status(200).json({
      status: "success",
      message: "Price data collection and correlation analysis completed",
      timestamp: Date.now(),
      results: {
        correlatedPairsCount: correlatedPairs.length,
      },
    });
  })
);

// Data cleanup endpoint
apiRouter.post(
  "/cleanup-data",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Data cleanup job triggered by Cloud Scheduler");
    const { firestoreService } = initServices();

    await firestoreService.logEvent("data_cleanup_started");

    // Define cleanup thresholds (in milliseconds)
    const thresholds = {
      botEvents: 1 * 24 * 60 * 60 * 1000, // 1 day
      trades: 180 * 24 * 60 * 60 * 1000, // 180 days
      correlationPairs: 365 * 24 * 60 * 60 * 1000, // 365 days
    };

    // Clean up old data
    const cleanupResult = await firestoreService.cleanupOldData(thresholds);

    await firestoreService.logEvent("data_cleanup_completed", {
      botEventsDeleted: cleanupResult.botEventsDeleted,
      tradesDeleted: cleanupResult.tradesDeleted,
      correlationPairsDeleted: cleanupResult.correlationPairsDeleted,
    });

    res.status(200).json({
      status: "success",
      message: "Data cleanup completed",
      results: cleanupResult,
      timestamp: Date.now(),
    });
  })
);

// Strategy health check endpoint
apiRouter.post(
  "/strategy-health-check",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Strategy health check job triggered by Cloud Scheduler");
    const { firestoreService, correlationAnalyzer } = initServices();

    // Process active trades in batches
    async function processActiveTradesInBatches(trades: any[], batchSize: number): Promise<void> {
      for (let i = 0; i < trades.length; i += batchSize) {
        const batch = trades.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (trade) => {
            if (trade.correlatedPair) {
              try {
                const correlatedPair = JSON.parse(trade.correlatedPair as string);
                const zScore = await correlationAnalyzer.calculateCurrentZScore(correlatedPair);
                await firestoreService.updateTrade(trade.id as string, {
                  currentZScore: zScore,
                  lastChecked: Date.now(),
                });
                logger.info(`Updated z-score for ${trade.symbol}: ${zScore}`);
              } catch (error) {
                logger.error(`Error updating z-score for trade ${trade.id}:`, error);
              }
            }
          })
        );
      }
    }

    // 1. Get active trades
    const activeTrades = await firestoreService.getActiveTrades();
    logger.info(`Found ${activeTrades.length} active trades to check`);

    // 2. Recalculate all z-scores for active trades in batches
    await processActiveTradesInBatches(activeTrades, 10);

    // 3. Verify cointegration status of pairs
    const correlatedPairs = await firestoreService.getCorrelatedPairs();
    let staleCointegrationCount = 0;

    // Check for stale cointegration data (older than 3 days)
    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
    correlatedPairs.forEach((pair) => {
      if (pair.timestamp && Date.now() - Number(pair.timestamp) > THREE_DAYS_MS) {
        staleCointegrationCount++;
        logger.warn(`Stale cointegration data for ${pair.pairA}/${pair.pairB}`);
      }
    });

    // 4. Record health metrics
    await firestoreService.logEvent("strategy_health_check_completed", {
      activeTradesCount: activeTrades.length,
      pairsWithStaleDataCount: staleCointegrationCount,
      timestamp: Date.now(),
    });

    return res.status(200).json({
      status: "success",
      message: "Strategy health check completed",
      activeTradesCount: activeTrades.length,
      staleCointegrationCount,
      timestamp: Date.now(),
    });
  })
);

// Manual refresh correlations endpoint (for on-demand use only - normally run automatically after price data collection)
apiRouter.post(
  "/refresh-correlations",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Manual correlation refresh triggered");
    const { timeframe = "30d", minDataPoints = 10, correlationThreshold = 0.95 } = req.body;

    logger.info(
      `Parameters: timeframe=${timeframe}, minDataPoints=${minDataPoints}, correlationThreshold=${correlationThreshold}`
    );

    const { firestoreService, correlationAnalyzer } = initServices();

    await firestoreService.logEvent("manual_correlation_refresh_started", {
      timeframe,
      minDataPoints,
      correlationThreshold,
    });

    // Get tradable assets
    const assetsResult = await getTradableAssets();
    if (!assetsResult.success || !assetsResult.assets?.length) {
      logger.warn("No tradable assets returned for correlation analysis");
      await firestoreService.logEvent("manual_correlation_refresh_skipped", { reason: "No tradable assets returned" });
      return res.status(200).json({
        status: "skipped",
        reason: "No tradable assets returned",
      });
    }

    // Filter to only include whitelisted assets
    const whitelistedAssets = assetsResult.assets.filter((asset) => analysisWhitelist.includes(asset));
    logger.info(
      `Using ${whitelistedAssets.length} whitelisted assets out of ${assetsResult.assets.length} total assets`
    );

    // Find correlated pairs
    const correlatedPairs = await correlationAnalyzer.findCorrelatedPairs(
      whitelistedAssets,
      correlationThreshold
    );

    logger.info(`Found ${correlatedPairs.length} correlated pairs`);

    // Find cointegrated pairs
    const cointegratedPairs = await correlationAnalyzer.findCorrelatedPairs(
      correlatedPairs.map(pair => pair.pairA + "_" + pair.pairB),
      timeframe,
    );

    logger.info(`Found ${cointegratedPairs.length} cointegrated pairs`);

    await firestoreService.logEvent("manual_correlation_refresh_completed", {
      correlatedPairsCount: correlatedPairs.length,
      cointegratedPairsCount: cointegratedPairs.length,
    });

    res.status(200).json({
      status: "success",
      message: "Correlation refresh completed",
      results: {
        correlatedPairsCount: correlatedPairs.length,
        cointegratedPairsCount: cointegratedPairs.length,
        timeframe,
        minDataPoints,
        correlationThreshold,
      },
      timestamp: Date.now(),
    });
  })
);

// Get correlation pairs for dashboard
apiRouter.get(
  "/correlations",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Fetching correlation pairs for dashboard");
    const { firestoreService, correlationAnalyzer } = initServices();

    // Get correlation pairs from Firestore
    const correlatedPairs = await firestoreService.getCorrelatedPairs();
    logger.info(`Found ${correlatedPairs.length} correlation pairs to return to dashboard`);

    // Normalize and enhance pairs data for consistent types
    const normalizedPairs = correlatedPairs.map(pair => {
      // Ensure all values are properly typed and handle nulls consistently
      const normalizedPair = {
        id: `${pair.pairA}_${pair.pairB}`,
        pairA: pair.pairA,
        pairB: pair.pairB,
        correlation: typeof pair.correlation === 'number' ? pair.correlation : 0,
        cointegrated: !!pair.cointegrated, // Ensure boolean
        regressionCoefficient: typeof pair.regressionCoefficient === 'number' ? pair.regressionCoefficient : null,
        spreadMean: typeof pair.spreadMean === 'number' ? pair.spreadMean : null,
        spreadStd: typeof pair.spreadStd === 'number' ? pair.spreadStd : null,
        spreadZScore: typeof pair.spreadZScore === 'number' ? pair.spreadZScore : null,
        halfLife: typeof pair.halfLife === 'number' ? pair.halfLife : null,
        pValue: pair.pValue != null ? Number(pair.pValue) : null,
        timestamp: pair.timestamp || Date.now(),
        regressionFormula: pair.regressionCoefficient 
          ? `${pair.pairA} = ${Number(pair.regressionCoefficient).toFixed(4)} × ${pair.pairB}`
          : null,
        lastUpdated: pair.timestamp
      };
      
      // Calculate z-score if missing but we have mean and std
      if (normalizedPair.spreadZScore === null && 
          normalizedPair.spreadMean !== null && 
          normalizedPair.spreadStd !== null && 
          normalizedPair.spreadStd > 0) {
        normalizedPair.spreadZScore = normalizedPair.spreadMean / normalizedPair.spreadStd;
      }
      
      return normalizedPair;
    });
    
    // Sort by cointegration status and then correlation
    normalizedPairs.sort((a, b) => {
      // First by cointegration (cointegrated first)
      if (a.cointegrated !== b.cointegrated) {
        return a.cointegrated ? -1 : 1;
      }
      // Then by correlation (highest first)
      return b.correlation - a.correlation;
    });

    return res.status(200).json(normalizedPairs);
  })
);

// Get trades for dashboard
apiRouter.get(
  "/trades",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Fetching trades for dashboard");
    const { firestoreService } = initServices();
    const statusFilter = req.query.status as string | undefined;
    
    let trades: any[] = [];
    try {
      if (statusFilter === 'open') {
        // Get active trades (specifically for open status)
        logger.info("Requesting active trades from Firestore service");
        trades = await firestoreService.getActiveTrades();
        logger.info(`Found ${trades?.length || 0} active trades to return to dashboard`);
      } else if (statusFilter) {
        // Get all trades and filter by status
        logger.info(`Requesting all trades from Firestore service with filter: ${statusFilter}`);
        const allTrades = await firestoreService.getAllTrades();
        logger.info(`Retrieved ${allTrades?.length || 0} total trades before filtering`);
        
        const requestedStatus = statusFilter.toLowerCase();
        trades = allTrades.filter(trade => {
          const tradeStatus = ((trade.status || '') + '').toLowerCase();
          return tradeStatus === requestedStatus;
        });
        
        logger.info(`Found ${trades.length} trades with status "${statusFilter}" out of ${allTrades.length} total trades`);
      } else {
        // Get all trades
        logger.info("Requesting all trades from Firestore service");
        trades = await firestoreService.getAllTrades();
        logger.info(`Found ${trades?.length || 0} total trades to return to dashboard`);
      }
    } catch (error) {
      logger.error("Error fetching trades:", error);
      trades = [];
    }
    
    // If no trades found, return empty array
    if (!trades || trades.length === 0) {
      logger.info("No trades found in database");
      return res.status(200).json([]);
    }
    
    // Normalize and enhance trades data for consistent types and formatting
    const normalizedTrades = trades.map(trade => {
      // Parse numeric values to ensure consistent types
      const executedPrice = typeof trade.executedPrice === 'string' 
        ? parseFloat(trade.executedPrice) 
        : (trade.executedPrice || 0);
        
      const executedSize = typeof trade.executedSize === 'string' 
        ? parseFloat(trade.executedSize) 
        : (trade.executedSize || 0);
        
      const leverage = typeof trade.leverage === 'string' 
        ? parseFloat(trade.leverage) 
        : (trade.leverage || 1);
        
      const pnl = trade.pnl !== undefined 
        ? (typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : trade.pnl) 
        : (trade.finalPnl !== undefined 
          ? (typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl) : trade.finalPnl) 
          : 0);
      
      // Get trade side and normalize it
      let side = (trade.side || 'unknown').toLowerCase();
      if (side === 'buy') side = 'long';
      if (side === 'sell') side = 'short';
      
      // Get normalized status
      let status = (trade.status || 'unknown').toLowerCase();
      if (status === 'active') status = 'open';
      
      return {
        id: trade.id || `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: trade.timestamp || Date.now(),
        symbol: trade.symbol || 'Unknown',
        side,
        status,
        executedPrice,
        executedSize,
        leverage,
        orderId: trade.orderId || null,
        type: trade.type || 'market',
        walletAddress: trade.walletAddress || null,
        createdAt: trade.createdAt || new Date(trade.timestamp || Date.now()).toISOString(),
        pnl,
        stopLoss: trade.stopLoss !== undefined ? parseFloat(trade.stopLoss) : null,
        takeProfit: trade.takeProfit !== undefined ? parseFloat(trade.takeProfit) : null,
        correlatedPair: trade.correlatedPair || null,
        pairTradeId: trade.pairTradeId || null,
        openedAt: trade.openedAt || trade.timestamp || Date.now(),
        closedAt: trade.closedAt || (status === 'closed' ? Date.now() : null),
        closeReason: trade.closeReason || null,
        duration: trade.duration || null,
        updatedAt: trade.updatedAt || Date.now(),
        entryPrice: trade.entryPrice || executedPrice,
        exitPrice: trade.exitPrice || null
      };
    });

    logger.info(`Returning ${normalizedTrades.length} normalized trades to client`);
    return res.status(200).json(normalizedTrades);
  })
);

// Sync status endpoint
apiRouter.get(
  "/sync-status",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Fetching sync status for dashboard");
    const { firestoreService } = initServices();
    
    try {
      // Get the latest sync event
      const events = await firestoreService.getBotEvents({
        eventFilter: "position_sync_completed",
        limit: 1
      });
      
      if (events.length === 0) {
        // No sync events found
        return res.status(200).json({
          status: 'warning',
          message: 'No synchronization events found',
          timestamp: Date.now(),
          lastSynced: null,
          isInSync: false,
          syncActions: 0
        });
      }
      
      const latestSyncEvent = events[0];
      const eventData = latestSyncEvent.data || {};
      
      // Check if there were any mismatches
      const exchangeOnly = eventData.exchangeOnly || 0;
      const databaseOnly = eventData.databaseOnly || 0;
      const syncActions = eventData.syncActions || 0;
      
      // Determine if in sync (no mismatches found in latest sync)
      const isInSync = exchangeOnly === 0 && databaseOnly === 0;
      
      // Check for imbalances
      const hasImbalance = eventData.isBalanced === false;
      
      return res.status(200).json({
        status: 'success',
        message: isInSync ? 'Exchange and database are in sync' : 'Mismatches detected',
        timestamp: Date.now(),
        lastSynced: latestSyncEvent.timestamp,
        isInSync,
        syncActions,
        exchangeOnly,
        databaseOnly,
        hasImbalance,
        details: eventData
      });
    } catch (error) {
      logger.error("Error getting sync status:", error);
      return res.status(200).json({
        status: 'error',
        message: 'Error retrieving sync status',
        timestamp: Date.now(),
        lastSynced: null,
        isInSync: false,
        syncActions: 0
      });
    }
  })
);

// List all available API routes
apiRouter.get("/routes", (req: Request, res: Response) => {
  const routes = apiRouter.stack
    .filter((layer: any) => layer.route)
    .map((layer: any) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods || {}).filter((method) => method !== "options"),
      description: layer.route.stack[0].name || layer.route.path,
    }));

  res.json({
    routes,
    timestamp: Date.now(),
    environment: process.env.NODE_ENV || "unknown",
    serviceUrl: process.env.SERVICE_URL || "Not set",
  });
});

// Sync status endpoint is defined earlier at lines 885-948

// Endpoint to trigger position synchronization from the API router
apiRouter.post(
  "/sync-positions",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Position sync triggered from API router");
    
    // Simply call the actual sync implementation
    const { executor, firestoreService } = initServices();
    
    try {
      // Get all positions from the exchange
      const exchangePositions = await executor.getPositions();
      
      // Filter out tiny positions
      const significantPositions = exchangePositions.filter(pos => {
        const positionSize = Math.abs(parseFloat(pos.position));
        return positionSize > 0.001; // Ignore very small positions
      });
      
      logger.info(`Found ${significantPositions.length} significant positions on exchange`);
      
      // Get all active trades from the database
      const activeTrades = await firestoreService.getActiveTrades();
      logger.info(`Found ${activeTrades.length} active trades in database`);
      
      // Extract symbols from trades and positions
      const databasePositions = activeTrades.map(trade => trade.symbol as string);
      const exchangeSymbols = significantPositions.map(pos => pos.coin);
      
      // Find mismatches
      const exchangeOnly = exchangeSymbols.filter(symbol => !databasePositions.includes(symbol));
      const databaseOnly = databasePositions.filter(symbol => !exchangeSymbols.includes(symbol));
      
      let syncActions = 0;
      
      // Process mismatches
      if (exchangeOnly.length > 0 || databaseOnly.length > 0) {
        logger.warn("DATABASE-EXCHANGE MISMATCH DETECTED!");
        
        // 1. Create database records for exchange positions not in database
        if (exchangeOnly.length > 0) {
          for (const symbol of exchangeOnly) {
            const position = significantPositions.find(pos => pos.coin === symbol);
            if (position) {
              const positionVal = parseFloat(position.position);
              const side = positionVal > 0 ? 'long' : 'short';
              const size = Math.abs(positionVal);
              const entryPrice = position.entryPx;
              
              // Generate unique ID for the trade
              const tradeId = `trade_${symbol}_${Date.now()}_reconciled`;
              
              // Add to database
              await firestoreService.createTrade(tradeId, {
                symbol,
                side,
                size: String(size),
                entryPrice,
                leverage: 1,
                status: 'open',
                openedAt: Date.now(),
                orderId: 'exchange_reconciled',
                stopLoss: null,
                takeProfit: null,
                correlatedPair: null
              });
              
              logger.info(`Created database record for ${symbol} ${side} position`);
              syncActions++;
            }
          }
        }
        
        // 2. Close database records for positions not on exchange
        if (databaseOnly.length > 0) {
          for (const symbol of databaseOnly) {
            const trades = activeTrades.filter(trade => trade.symbol === symbol);
            
            for (const trade of trades) {
              await firestoreService.updateTrade(trade.id as string, {
                status: 'closed',
                closedAt: Date.now(),
                closeReason: 'exchange_mismatch',
                pnl: '0'
              });
              
              logger.info(`Marked phantom trade ${trade.id} (${symbol}) as closed`);
              syncActions++;
            }
          }
        }
        
        await firestoreService.logEvent("position_sync_completed", {
          exchangePositions: significantPositions.length,
          databasePositions: activeTrades.length,
          exchangeOnly: exchangeOnly.length,
          databaseOnly: databaseOnly.length,
          syncActions,
          timestamp: Date.now()
        });
      } else {
        logger.info("Database and exchange positions are already in sync.");
        
        // Even if no actions were taken, log a sync event
        await firestoreService.logEvent("position_sync_completed", {
          exchangePositions: significantPositions.length,
          databasePositions: activeTrades.length,
          exchangeOnly: 0,
          databaseOnly: 0,
          syncActions: 0,
          timestamp: Date.now()
        });
      }
      
      // Check if positions are balanced (equal number of shorts and longs)
      const shortPositions = significantPositions.filter(pos => parseFloat(pos.position) < 0);
      const longPositions = significantPositions.filter(pos => parseFloat(pos.position) > 0);
      const isBalanced = longPositions.length === shortPositions.length;
      
      if (!isBalanced) {
        logger.warn(`POSITION IMBALANCE DETECTED: ${longPositions.length} longs vs ${shortPositions.length} shorts`);
        
        // Log the imbalance for monitoring
        await firestoreService.logEvent("position_imbalance_detected", {
          longCount: longPositions.length,
          shortCount: shortPositions.length,
          totalPositions: significantPositions.length,
          timestamp: Date.now()
        });
      } else {
        logger.info("Position balance check: OK");
      }
      
      // Return the results
      return res.status(200).json({
        status: "success",
        message: "Position synchronization completed",
        timestamp: Date.now(),
        lastSynced: Date.now(),
        isInSync: exchangeOnly.length === 0 && databaseOnly.length === 0,
        syncActions,
        data: {
          exchangePositions: significantPositions.length,
          databasePositions: activeTrades.length,
          exchangeOnly,
          databaseOnly,
          isBalanced
        }
      });
    } catch (error) {
      await firestoreService.logEvent("position_sync_error", {
        error: error instanceof Error ? error.message : String(error),
        timestamp: Date.now()
      });
      
      // Re-throw the error for the asyncHandler
      throw error;
    }
  })
);

// Account balance endpoint
apiRouter.get(
  "/account-balance",
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const { executor } = initServices();
      // Use retry mechanism for critical API call
      const { balance } = await retryWithBackoff(() => executor.getAccountBalanceAndPortfolioValue());
      return res.status(200).json({
        balance: typeof balance === "number" ? balance : 0,
        timestamp: Date.now(),
      });
    } catch (error) {
      logger.error("Error getting account balance via SDK:", error);
      throw new Error("Failed to get account balance");
    }
  })
);

// Get strategy parameters endpoint
apiRouter.get(
  "/strategy-params",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Fetching strategy parameters");
    const { firestoreService } = initServices();

    // Get strategy parameters from Firestore
    const strategyParams = await firestoreService.getStrategyParams();
    logger.info(`Retrieved strategy parameters: ${JSON.stringify(strategyParams)}`);

    return res.status(200).json({
      status: "success",
      timestamp: Date.now(),
      params: strategyParams
    });
  })
);

// Update strategy parameters endpoint
apiRouter.post(
  "/strategy-params",
  asyncHandler(async (req: Request, res: Response) => {
    logger.info("Updating strategy parameters");
    const { firestoreService } = initServices();
    
    const params = req.body;
    logger.info(`New parameters: ${JSON.stringify(params)}`);
    
    // Validate parameters
    if (!params || typeof params !== 'object') {
      return res.status(400).json({
        status: "error",
        timestamp: Date.now(),
        error: "Invalid parameters format"
      });
    }
    
    // Get current parameters for validation and to fill in any missing fields
    const currentParams = await firestoreService.getStrategyParams();
    
    // Create updated parameters object with validation
    const updatedParams = {
      tradeSizePercent: typeof params.tradeSizePercent === 'number' ? params.tradeSizePercent : currentParams.tradeSizePercent,
      maxPositions: typeof params.maxPositions === 'number' ? params.maxPositions : currentParams.maxPositions,
      correlationThreshold: typeof params.correlationThreshold === 'number' ? params.correlationThreshold : currentParams.correlationThreshold,
      zScoreThreshold: typeof params.zScoreThreshold === 'number' ? params.zScoreThreshold : currentParams.zScoreThreshold,
      maxPortfolioAllocation: typeof params.maxPortfolioAllocation === 'number' ? params.maxPortfolioAllocation : currentParams.maxPortfolioAllocation
    };
    
    // Update parameters in Firestore
    await firestoreService.updateStrategyParams(updatedParams);
    logger.info("Strategy parameters updated successfully");

    return res.status(200).json({
      status: "success",
      message: "Strategy parameters updated successfully",
      timestamp: Date.now(),
      params: updatedParams
    });
  })
);
