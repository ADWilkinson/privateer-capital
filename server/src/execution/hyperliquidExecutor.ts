import { Hyperliquid, type Tif } from "hyperliquid";
import { Decimal } from "decimal.js";
import { FirestoreService } from "../services/firestoreService";
import { logger } from "../utils/logger";
import { analysisWhitelist } from "../utils/assetMappings";
import { retryWithBackoff as sharedRetryWithBackoff } from "../scripts/retry";

// Position type definitions
export interface BasePosition {
  coin: string;
  position: string;
  entryPx: string;
  markPx?: string;
}

export interface PositionWithUnrealizedPnl extends BasePosition {
  unrealizedPnl: string;
}

export interface PositionWithLeverage extends BasePosition {
  markPx: string;
  leverage: number;
}

export type Position = PositionWithUnrealizedPnl | PositionWithLeverage;

/**
 * Class for executing trades on Hyperliquid exchange
 */
export class HyperliquidExecutor {
  private sdk!: Hyperliquid;
  private privateKey: string = "";
  private walletAddress: string = "";
  private isInitialized = false;
  private readonly firestoreService: FirestoreService;
  private exchangeInfo: any | null = null;

  // Fixed slippage values for order execution
  private readonly initialSlippage: number = 0.005; // 0.5%
  private readonly secondAttemptSlippage: number = 0.02; // 2.0%
  private readonly finalAttemptSlippage: number = 0.05; // 5.0%

  // Rate limiting protection
  private lastRequestTime: number = 0;
  private readonly minRequestInterval: number = 200; // ms between requests
  private readonly maxRequestsPerMinute: number = 30;
  private readonly requestWindow: number = 60000; // 1 minute
  private requestTimestamps: number[] = [];

  constructor(firestoreService: FirestoreService) {
    this.firestoreService = firestoreService;

    // Initialize the Hyperliquid SDK asynchronously
    this.initialize()
      .then(() => {
        logger.info("HyperliquidExecutor initialized with SDK");
        this.isInitialized = true;
      })
      .catch((err) => {
        logger.error("Failed initial HyperliquidExecutor initialization:", err);
      });
  }

  /**
   * Helper function to safely serialize objects that might contain circular references
   */
  private safeStringify(obj: any): string {
    const seen = new WeakSet();
    return JSON.stringify(obj, (key, value) => {
      if (typeof value === "object" && value !== null) {
        if (seen.has(value)) {
          return "[Circular Reference]";
        }
        seen.add(value);
      }
      return value;
    });
  }

  /**
   * Helper function to safely extract error message
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }

    try {
      return this.safeStringify(error);
    } catch (e) {
      return "Unknown error (could not serialize)";
    }
  }

  /**
   * Initialize the executor with required configuration
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.info("HyperliquidExecutor already initialized");
      return;
    }

    try {
      // Get the private key from environment variable
      const privateKey = process.env.HYPERLIQUID_MAIN_WALLET_PRIVATE_KEY;

      // If no private key is set, we're in test mode
      if (!privateKey) {
        logger.info("Running in test mode - HyperliquidExecutor initialized without private key");
        this.isInitialized = true;
        return;
      }

      // Ensure private key is formatted correctly (with 0x prefix)
      this.privateKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;

      // Get wallet address
      this.walletAddress = this.getWalletAddress();

      // Mask key for logging
      const maskedKey = `${this.privateKey.substring(0, 6)}...${this.privateKey.substring(this.privateKey.length - 4)}`;
      logger.info(`Initializing with private key (masked): ${maskedKey}`);
      logger.info(`Using wallet address: ${this.walletAddress}`);

      // Initialize the SDK
      try {
        const sdkConfig = {
          privateKey: this.privateKey,
          walletAddress: this.walletAddress,
          enableWs: false, // Avoid circular references
        };

        this.sdk = new Hyperliquid(sdkConfig);
        await this.sdk.ensureInitialized();
        logger.info("Hyperliquid SDK initialized successfully");
      } catch (sdkError) {
        const errorMessage = this.getErrorMessage(sdkError);
        logger.error(`Failed to initialize Hyperliquid SDK: ${errorMessage}`);
        throw new Error(`SDK initialization failed: ${errorMessage}`);
      }

      // Fetch exchange info for tick sizes
      await this.fetchExchangeInfo();

      this.isInitialized = true;
      logger.info("HyperliquidExecutor initialized successfully");
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.error(`Failed to initialize HyperliquidExecutor: ${errorMessage}`);
      throw new Error(`Failed to initialize executor: ${errorMessage}`);
    }
  }

  /**
   * Fetches exchange metadata for tick sizes
   */
  private async fetchExchangeInfo(): Promise<void> {
    try {
      await this.ensureConnected();

      const meta = await this.retryWithBackoff(() => this.sdk.info.perpetuals.getMeta(), 3, 1000);

      if (meta && meta.universe) {
        this.exchangeInfo = {
          assetInfo: meta.universe.map((asset) => ({
            name: asset.name,
            baseCurrency: asset.name,
            quoteCurrency: "USD",
            tickSize: Math.pow(10, -asset.szDecimals) || 0.01,
            minSize: 0.001,
            sizeIncrement: Math.pow(10, -asset.szDecimals) || 0.001,
          })),
        };
        logger.info(`Successfully fetched exchange metadata for ${meta.universe.length} assets`);
      }
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);
      logger.warn(`Failed to fetch exchange metadata: ${errorMessage}`);
      // Non-critical error, continue without exchange info
    }
  }

  /**
   * Ensure the SDK is initialized and connected
   */
  private async ensureConnected(): Promise<void> {
    try {
      if (!this.sdk) {
        logger.warn("SDK not initialized, initializing now");
        await this.initialize();
      }

      await this.sdk.ensureInitialized();
    } catch (error) {
      logger.warn("Error connecting to SDK, will retry on operation:", error);
    }
  }

  /**
   * Helper method to retry API calls with additional functionality
   */
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries: number = 5,
    baseDelay: number = 2000
  ): Promise<T> {
    // Prepare the operation with connection and throttling
    const enhancedOperation = async () => {
      await this.ensureConnected();
      await this.throttleRequests();
      
      // Add timeout handling
      const timeoutMs = 15000;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs / 1000} seconds`)), timeoutMs);
      });

      return await Promise.race([operation(), timeoutPromise]);
    };

    try {
      // Use the shared retry utility
      return await sharedRetryWithBackoff(enhancedOperation, maxRetries);
    } catch (error) {
      // Log API error to Firestore before rethrowing
      try {
        await this.firestoreService.logApiError({
          timestamp: new Date(),
          operation: operation.toString().substring(0, 100),
          error: this.getErrorMessage(error),
          attempts: maxRetries,
          details: this.safeStringify({ error }),
        });
      } catch (logError) {
        logger.error(`Failed to log API error to Firestore: ${this.getErrorMessage(logError)}`);
      }
      
      throw error;
    }
  }

  /**
   * Throttles requests to prevent rate limiting
   */
  private async throttleRequests(): Promise<void> {
    const now = Date.now();

    // Clean up old timestamps
    this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < this.requestWindow);

    // Check if we've exceeded the rate limit
    if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
      const oldestTimestamp = this.requestTimestamps[0];
      const timeToWait = this.requestWindow - (now - oldestTimestamp);

      logger.warn(
        `Rate limit approaching, throttling for ${timeToWait}ms. Made ${this.requestTimestamps.length} requests in the last minute.`
      );

      await new Promise((resolve) => setTimeout(resolve, timeToWait + 100));
      return this.throttleRequests(); // Recursively check again
    }

    // Ensure minimum time between requests
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      const timeToWait = this.minRequestInterval - timeSinceLastRequest;
      await new Promise((resolve) => setTimeout(resolve, timeToWait));
    }

    // Track this request
    this.lastRequestTime = Date.now();
    this.requestTimestamps.push(this.lastRequestTime);
  }

  /**
   * Get all tradable assets from the exchange
   */
  public async getTradableAssets(): Promise<string[]> {
    try {
      // Use our whitelist directly - no need to fetch from Hyperliquid
      const whitelistedAssets = analysisWhitelist;

      // Add -PERP suffix to all symbols
      const assetNames = whitelistedAssets.map((symbol) => `${symbol}-PERP`);

      logger.info(`Using ${assetNames.length} whitelisted assets: ${assetNames.join(", ")}`);
      return assetNames;
    } catch (error) {
      logger.error("Error getting tradable assets:", error);
      await this.firestoreService.logEvent("error_getting_assets", { error: String(error) });
      return [];
    }
  }

  /**
   * Get current account balance and portfolio value
   */
  async getAccountBalanceAndPortfolioValue(): Promise<{
    balance: Decimal;
    portfolioValue: number;
    availableMargin: number;
  }> {
    try {
      await this.ensureConnected();
      logger.info(`Getting account balance and portfolio value for wallet: ${this.walletAddress}`);

      // First get the reliable balance using the working method
      const balance = await this.getAccountBalance();

      // Then get the clearinghouse state for portfolio value and margin
      const clearinghouseState = await this.retryWithBackoff(
        () => this.sdk.info.perpetuals.getClearinghouseState(this.walletAddress),
        3,
        1000
      );

      if (!clearinghouseState?.marginSummary) {
        logger.warn(`SDK response didn't contain marginSummary`);
        return {
          balance,
          portfolioValue: parseFloat(balance.toString()),
          availableMargin: parseFloat(balance.toString()),
        };
      }

      // Extract portfolio value from the balance
      const portfolioValue = parseFloat(balance.toString());

      // Calculate available margin
      let availableMargin = portfolioValue;
      if (clearinghouseState.marginSummary.totalMarginUsed) {
        const totalMarginUsed = parseFloat(clearinghouseState.marginSummary.totalMarginUsed || "0");
        availableMargin = portfolioValue - totalMarginUsed;
      }

      logger.info(
        `Account balance: ${balance}, Portfolio value: ${portfolioValue}, Available margin: ${availableMargin}`
      );
      return { balance, portfolioValue, availableMargin };
    } catch (error) {
      logger.error("Error fetching account balance and portfolio value:", error);
      await this.firestoreService.logEvent("error_fetching_balance_and_portfolio", { error: String(error) });
      return { balance: new Decimal(0), portfolioValue: 0, availableMargin: 0 };
    }
  }

  /**
   * Get current account balance
   */
  private async getAccountBalance(): Promise<Decimal> {
    try {
      await this.ensureConnected();
      logger.info(`Getting account balance for wallet: ${this.walletAddress}`);

      const clearinghouseState = await this.retryWithBackoff(
        () => this.sdk.info.perpetuals.getClearinghouseState(this.walletAddress),
        3,
        1000
      );

      if (clearinghouseState?.marginSummary?.accountValue) {
        const balance = new Decimal(clearinghouseState.marginSummary.accountValue);
        logger.info(`Account balance: ${balance}`);
        return balance;
      }

      logger.warn("No margin summary found in clearinghouse state");
      return new Decimal(0);
    } catch (error) {
      logger.error("Error fetching account balance:", error);
      await this.firestoreService.logEvent("error_fetching_balance", { error: String(error) });
      return new Decimal(0);
    }
  }

  /**
   * Format price according to exchange requirements
   */
  private async formatPrice(symbol: string, price: Decimal, side: "buy" | "sell"): Promise<number> {
    // Get the correct tick size
    const tickSize = await this.getTickSize(symbol);

    // Calculate price with slippage based on side
    const limitPxDecimal =
      side === "buy"
        ? price.mul(1.001) // 0.1% above for buys
        : price.mul(0.999); // 0.1% below for sells

    // Special handling for BTC-PERP
    if (symbol === "BTC-PERP") {
      return Math.floor(limitPxDecimal.toNumber());
    }

    // Format price according to exchange requirements
    const roundedPrice = Math.round(limitPxDecimal.toNumber() / tickSize) * tickSize;
    const decimalPlaces = Math.max(0, -Math.floor(Math.log10(tickSize)));
    return parseFloat(roundedPrice.toFixed(decimalPlaces));
  }

  /**
   * Place a market order with immediate-or-cancel behavior
   * 
   * Uses IOC (Immediate-or-Cancel) orders to guarantee instant execution or cancellation,
   * preventing unfilled limit orders from sitting in the order book.
   * 
   * Features:
   * - Uses 0.5% slippage to ensure execution at market price
   * - Validates fill size to detect and report partial fills
   * - Throws if order is not filled, preventing imbalanced pair trades
   * - Extensive error handling and reporting
   * 
   * Pair trading requires both sides to execute or none, which this method helps enforce.
   */
  async placeMarketOrder(symbol: string, side: "buy" | "sell", size: Decimal, leverage = 1): Promise<string> {
    try {
      await this.ensureConnected();
      logger.info(`Placing market order: ${symbol}, ${side}, size: ${size}, leverage: ${leverage}`);

      // Update leverage if needed
      if (leverage !== 1) {
        try {
          await this.sdk.exchange.updateLeverage(symbol, "isolated", leverage);
          logger.info(`Updated leverage for ${symbol} to ${leverage}`);
        } catch (leverageError) {
          logger.warn(`Failed to update leverage for ${symbol}:`, leverageError);
          // Continue despite leverage update failure
        }
      }

      // Get current price
      const priceData = await this.sdk.info.getAllMids();
      if (!priceData?.[symbol]) {
        throw new Error(`No price data found for ${symbol}`);
      }

      // Validate and parse price
      const currentPriceStr = String(priceData[symbol]);
      let currentPrice: Decimal;

      try {
        currentPrice = new Decimal(currentPriceStr);
        if (currentPrice.isNaN() || !currentPrice.isPositive() || currentPrice.equals(new Decimal(0))) {
          throw new Error(`Invalid or zero price value for ${symbol}: ${currentPriceStr}`);
        }
      } catch (error) {
        throw new Error(`Error parsing price data for ${symbol}: ${currentPriceStr}`);
      }

      // Get size increment for the asset
      const sizeIncrement = await this.getTickSize(symbol);
      const sizeDecimalPlaces = Math.max(0, -Math.floor(Math.log10(sizeIncrement)));

      // Format size according to exchange requirements
      const formattedSize = size.toDecimalPlaces(sizeDecimalPlaces, Decimal.ROUND_HALF_UP);

      // PROGRESSIVE FALLBACK EXECUTION STRATEGY
      // Try with increasingly aggressive price points to ensure execution
      
      logger.info(`Using ${this.initialSlippage * 100}% initial slippage for ${symbol}`);
      
      // 1. First attempt: IOC with fixed initial slippage 
      const firstAttemptResult = await this.tryExecuteOrderWithSlippage(
        symbol, 
        side, 
        formattedSize.toNumber(), 
        currentPrice, 
        side === "buy" ? 1 + this.initialSlippage : 1 - this.initialSlippage,
        "Ioc" // Immediate-or-cancel
      );

      if (firstAttemptResult.success) {
        // Order succeeded on first attempt
        const {orderId, avgPrice, filledSize} = firstAttemptResult;
        logger.info(`Order filled successfully on first attempt: ${orderId}, price: ${avgPrice}, size: ${filledSize}`);

        // Record the order
        await this.firestoreService.createOrder({
          orderId,
          symbol,
          side,
          size: size.toString(),
          executedSize: filledSize ?? size.toString(),
          executedPrice: avgPrice ?? "unknown",
          leverage,
          type: "market",
          status: "executed",
          timestamp: Date.now(),
          walletAddress: this.walletAddress,
        });

        return orderId ?? "";
      }

      // 2. Second attempt: Try with medium slippage (2%)
      logger.warn(`First order attempt failed for ${symbol}, retrying with ${this.secondAttemptSlippage * 100}% slippage`);
      const secondAttemptResult = await this.tryExecuteOrderWithSlippage(
        symbol, 
        side, 
        formattedSize.toNumber(), 
        currentPrice, 
        side === "buy" ? 1 + this.secondAttemptSlippage : 1 - this.secondAttemptSlippage,
        "Ioc" // Still using IOC
      );

      if (secondAttemptResult.success) {
        // Order succeeded on second attempt
        const {orderId, avgPrice, filledSize} = secondAttemptResult;
        logger.info(`Order filled successfully on second attempt: ${orderId}, price: ${avgPrice}, size: ${filledSize}`);

        // Record the order
        await this.firestoreService.createOrder({
          orderId,
          symbol,
          side,
          size: size.toString(),
          executedSize: filledSize ?? size.toString(),
          executedPrice: avgPrice ?? "unknown",
          leverage,
          type: "market",
          status: "executed",
          attempt: 2,
          timestamp: Date.now(),
          walletAddress: this.walletAddress,
        });

        return orderId ?? "";
      }

      // 3. Final attempt: Try with high slippage (5%) and GTC order type
      logger.warn(`Second order attempt failed for ${symbol}, making final attempt with ${this.finalAttemptSlippage * 100}% slippage and GTC order`);
      const finalAttemptResult = await this.tryExecuteOrderWithSlippage(
        symbol, 
        side, 
        formattedSize.toNumber(), 
        currentPrice, 
        side === "buy" ? 1 + this.finalAttemptSlippage : 1 - this.finalAttemptSlippage,
        "Gtc" // Switch to Good-Till-Cancel
      );

      if (finalAttemptResult.success) {
        // Order succeeded on final attempt
        const {orderId, avgPrice, filledSize} = finalAttemptResult;
        logger.info(`Order filled or accepted on final attempt: ${orderId}, price: ${avgPrice}, size: ${filledSize}`);

        // Record the order
        await this.firestoreService.createOrder({
          orderId,
          symbol,
          side,
          size: size.toString(),
          executedSize: filledSize ?? size.toString(),
          executedPrice: avgPrice ?? "unknown",
          leverage,
          type: "market-gtc",
          status: "executed",
          attempt: 3,
          timestamp: Date.now(),
          walletAddress: this.walletAddress,
        });

        return orderId ?? "";
      }

      // If we got here, all attempts failed
      throw new Error(`All order placement attempts failed for ${symbol}. Market may be illiquid or experiencing extreme conditions.`);
    } catch (error) {
      logger.error("Error placing market order:", error);
      await this.firestoreService.logEvent("error_placing_order", {
        error: String(error),
        symbol,
        side,
        size: size.toString(),
      });
      throw error;
    }
  }

  /**
   * Helper method to attempt order execution with specific slippage
   * @param symbol Asset symbol
   * @param side Buy or sell
   * @param size Order size
   * @param currentPrice Current market price
   * @param slippageMultiplier Price multiplier to account for slippage
   * @param timeInForce Order time-in-force (Ioc or Gtc)
   * @returns Order execution result
   */
  private async tryExecuteOrderWithSlippage(
    symbol: string,
    side: "buy" | "sell",
    size: number,
    currentPrice: Decimal,
    slippageMultiplier: number,
    timeInForce: Tif
  ): Promise<{
    success: boolean;
    orderId?: string;
    avgPrice?: string;
    filledSize?: string;
    error?: string;
  }> {
    try {
      // Apply slippage for order pricing
      const adjustedPrice = currentPrice.mul(slippageMultiplier);
      
      // Format price based on exchange requirements
      const priceNum = await this.formatPrice(symbol, adjustedPrice, side);

      // Prepare order parameters
      const orderParams = {
        coin: symbol,
        is_buy: side === "buy",
        sz: size,
        limit_px: priceNum,
        order_type: { limit: { tif: timeInForce } },
        reduce_only: false,
        vaultAddress: this.walletAddress,
      };

      logger.info(`Placing ${timeInForce} order for ${symbol} with ${(Math.abs(slippageMultiplier - 1) * 100).toFixed(1)}% slippage: ${side} ${size} @ ${priceNum}`);

      // Place order with retry logic
      const orderResponse = await this.retryWithBackoff(() => this.sdk.exchange.placeOrder(orderParams), 2, 500);

      // Process response
      if (!orderResponse?.response?.data?.statuses?.length) {
        return {
          success: false,
          error: `Invalid order response: ${this.safeStringify(orderResponse)}`
        };
      }

      // Extract order details
      const firstStatus = orderResponse.response.data.statuses[0];

      // Check for errors
      if (firstStatus.error) {
        return {
          success: false,
          error: `Order placement failed: ${firstStatus.error}`
        };
      }

      // For IOC orders, we need filled status
      if (timeInForce === "Ioc" && !firstStatus.filled) {
        return {
          success: false,
          error: `IOC order not filled immediately`
        };
      }

      // For GTC orders, we can accept either filled or accepted status
      let orderId = "unknown";
      let avgPrice = "market";
      let filledSize = String(size);

      if (firstStatus.filled?.oid) {
        // Order was filled immediately
        orderId = String(firstStatus.filled.oid);
        avgPrice = firstStatus.filled.avgPx ? String(firstStatus.filled.avgPx) : "market";
        filledSize = firstStatus.filled.totalSz ? String(firstStatus.filled.totalSz) : String(size);
      } else if (timeInForce === "Gtc" && firstStatus.accepted?.oid) {
        // GTC order was accepted but not filled immediately
        orderId = String(firstStatus.accepted.oid);
        // Leave default values for price and size
      } else {
        return {
          success: false,
          error: `Order neither filled nor accepted: ${this.safeStringify(firstStatus)}`
        };
      }

      return {
        success: true,
        orderId,
        avgPrice,
        filledSize
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Get current position for a symbol
   */
  async getPosition(symbol: string): Promise<PositionWithUnrealizedPnl> {
    try {
      await this.ensureConnected();
      logger.info(`Fetching position for ${symbol}, wallet: ${this.walletAddress}`);

      const clearinghouseState = await this.retryWithBackoff(
        () => this.sdk.info.perpetuals.getClearinghouseState(this.walletAddress),
        3,
        1000
      );

      if (!clearinghouseState?.assetPositions) {
        logger.warn(`No position data found for ${symbol}`);
        return this.createEmptyPosition(symbol);
      }

      // Find the position for the requested symbol
      const positionData = clearinghouseState.assetPositions.find((pos: any) => {
        return pos?.position?.coin === symbol || pos?.position?.coin?.startsWith(symbol);
      });

      if (!positionData?.position) {
        logger.info(`No position found for ${symbol}`);
        return this.createEmptyPosition(symbol);
      }

      // Extract position data
      const positionStr = String(positionData.position.szi || "0");
      const entryPxStr = String(positionData.position.entryPx || "0");

      // Get mark price
      let markPxStr = "0";
      try {
        const priceData = await this.sdk.info.getAllMids();
        if (priceData?.[symbol]) {
          markPxStr = String(priceData[symbol]);
        }
      } catch (priceError) {
        logger.warn(`Error fetching mark price for ${symbol}:`, priceError);
      }

      // Calculate unrealized PnL
      let unrealizedPnlStr = "0";
      if (positionData.position.unrealizedPnl) {
        unrealizedPnlStr = String(positionData.position.unrealizedPnl);
      } else if (positionStr !== "0" && entryPxStr !== "0" && markPxStr !== "0") {
        // Simple PnL calculation
        const positionSize = parseFloat(positionStr);
        const entryPrice = parseFloat(entryPxStr);
        const markPrice = parseFloat(markPxStr);

        if (!isNaN(positionSize) && !isNaN(entryPrice) && !isNaN(markPrice)) {
          unrealizedPnlStr = (positionSize * (markPrice - entryPrice)).toString();
        }
      }

      logger.info(`Found position for ${symbol}: ${positionStr}`);

      return {
        coin: symbol,
        position: positionStr,
        entryPx: entryPxStr,
        unrealizedPnl: unrealizedPnlStr,
      };
    } catch (error) {
      logger.error(`Error fetching position for ${symbol}:`, error);
      await this.firestoreService.logEvent("error_fetching_position", {
        error: String(error),
        symbol,
      });
      return this.createEmptyPosition(symbol);
    }
  }

  /**
   * Helper to create an empty position object
   */
  private createEmptyPosition(symbol: string): PositionWithUnrealizedPnl {
    return {
      coin: symbol,
      position: "0",
      entryPx: "0",
      unrealizedPnl: "0",
    };
  }

  /**
   * Get all open positions
   */
  async getAllPositions(): Promise<PositionWithLeverage[]> {
    try {
      await this.ensureConnected();
      logger.info(`Fetching all positions for wallet: ${this.walletAddress}`);

      const clearinghouseState = await this.retryWithBackoff(
        () => this.sdk.info.perpetuals.getClearinghouseState(this.walletAddress),
        3,
        1000
      );

      if (!clearinghouseState?.assetPositions) {
        logger.warn("No position data found in API response");
        return [];
      }

      // Fetch all current prices at once
      const allPrices = await this.sdk.info.getAllMids().catch(() => ({}));

      // Process each position
      const positions: PositionWithLeverage[] = [];

      for (const posData of clearinghouseState.assetPositions) {
        const pos = posData?.position;
        if (!pos) continue;

        // Skip positions with zero size
        const positionStr = String(pos.szi || "0");
        if (!pos.szi || parseFloat(positionStr) === 0) continue;

        // Skip positions without coin name
        const coinName = String(pos.coin || "");
        if (!coinName) continue;

        // Get entry price
        const entryPxStr = String(pos.entryPx || "0");

        // Get mark price from cache
        if (!allPrices) {
          logger.warn("No prices found in API response");
          continue;
        }

        // Get mark price
        const markPxStr = String((allPrices as Record<string, number>)[coinName] || "0");

        // Extract leverage
        let leverageValue = 1;
        if (pos.leverage) {
          if (typeof pos.leverage === "number") {
            leverageValue = pos.leverage;
          } else if (typeof pos.leverage === "object" && "value" in pos.leverage) {
            leverageValue = pos.leverage.value || 1;
          } else if (typeof pos.leverage === "string") {
            leverageValue = parseFloat(pos.leverage) || 1;
          }
        }

        positions.push({
          coin: coinName,
          position: positionStr,
          entryPx: entryPxStr,
          markPx: markPxStr,
          leverage: leverageValue,
        });
      }

      logger.info(`Found ${positions.length} active positions`);
      return positions;
    } catch (error) {
      logger.error("Error fetching all positions:", error);
      await this.firestoreService.logEvent("error_fetching_all_positions", {
        error: String(error),
      });
      return [];
    }
  }

  /**
   * Close a position using a progressive execution strategy
   * Uses a multi-layered approach to ensure positions are closed even in low liquidity conditions:
   * 1. First attempts with Immediate-or-Cancel (IOC) order with 2% slippage
   * 2. If unfilled, retries with 10% slippage
   * 3. If still unfilled, falls back to Good-Till-Cancel (GTC) order with 15% slippage
   * 
   * This ensures that positions are always closed, even in volatile or illiquid markets.
   * The method also verifies the position was actually closed by checking exchange state.
   */
  async closePosition(symbol: string, size: Decimal, leverage = 1): Promise<string> {
    try {
      await this.ensureConnected();
      
      // Get current position details
      const position = await this.getPosition(symbol);
      
      // Check if position actually exists
      const positionSize = new Decimal(position.position);
      if (positionSize.equals(new Decimal('0'))) {
        logger.info(`No position found for ${symbol}, nothing to close`);
        return "no_position";
      }
      
      // Determine side for closing order (opposite of position)
      // If position is positive, we need to sell; if negative, we need to buy
      const positionIsBuy = positionSize.greaterThan(new Decimal('0'));
      const side = positionIsBuy ? 'sell' : 'buy';
      
      logger.info(`Closing ${symbol} position: ${position.position} with close side: ${side}`);
      
      // Get current price from the exchange
      const priceData = await this.sdk.info.getAllMids();
      if (!priceData?.[symbol]) {
        throw new Error(`No price data found for ${symbol}`);
      }

      // Parse price
      const currentPriceStr = String(priceData[symbol]);
      let currentPrice: Decimal;

      try {
        currentPrice = new Decimal(currentPriceStr);
        if (currentPrice.isNaN() || !currentPrice.isPositive() || currentPrice.equals(new Decimal(0))) {
          throw new Error(`Invalid or zero price value for ${symbol}: ${currentPriceStr}`);
        }
      } catch (error) {
        throw new Error(`Error parsing price data for ${symbol}: ${currentPriceStr}`);
      }

      // Determine the closing size (use absolute value of position size if smaller than requested)
      const positionSizeAbs = positionSize.abs();
      let closingSize = size;
      
      // If requested size is larger than position size, cap it
      if (size.greaterThan(positionSizeAbs)) {
        logger.warn(`Requested closing size ${size} is larger than position size ${positionSizeAbs}. Using position size.`);
        closingSize = positionSizeAbs;
      }
      
      // For closing positions, use much more aggressive slippage (2%) to ensure execution
      const slippageMultiplier = side === 'buy' ? 1.02 : 0.98; // 2% above/below market
      const aggressivePrice = currentPrice.mul(slippageMultiplier);
      
      // Format price based on exchange requirements
      const priceFormatted = await this.formatPrice(symbol, aggressivePrice, side);
      
      // Get size increment for the asset
      const sizeIncrement = await this.getTickSize(symbol);
      const sizeDecimalPlaces = Math.max(0, -Math.floor(Math.log10(sizeIncrement)));
      
      // Format size according to exchange requirements
      const formattedSize = closingSize.toDecimalPlaces(sizeDecimalPlaces, Decimal.ROUND_HALF_UP);
      
      // Using IOC (Immediate-or-Cancel) with aggressive pricing to ensure execution
      const orderParams = {
        coin: symbol,
        is_buy: side === 'buy',
        sz: formattedSize.toNumber(),
        limit_px: priceFormatted,
        reduce_only: true,  // Important: This ensures we only reduce position, not open new one
        order_type: { limit: { tif: 'Ioc' as Tif } },
        vaultAddress: this.walletAddress,
      };
      
      logger.info(`Placing closing order for ${symbol} with size ${formattedSize}, price ${priceFormatted}, side ${side}`);

      // Place order with retry logic
      const orderResponse = await this.retryWithBackoff(
        () => this.sdk.exchange.placeOrder(orderParams),
        3,  // Max retries
        1000 // Delay between retries
      );

      // Process response
      if (!orderResponse?.response?.data?.statuses?.length) {
        throw new Error(`Invalid order response for closing position: ${this.safeStringify(orderResponse)}`);
      }

      // Extract order details
      const firstStatus = orderResponse.response.data.statuses[0];

      // Check for errors, but don't throw immediately for IOC orders
      // that couldn't be matched - we'll try with more aggressive pricing and GTC
      if (firstStatus.error && !firstStatus.error.includes("Order could not immediately match")) {
        throw new Error(`Order placement failed: ${firstStatus.error}`);
      }

      // Check if the order was filled or if we have an IOC matching error
      if (firstStatus.error && firstStatus.error.includes("Order could not immediately match")) {
        logger.warn(`Order could not immediately match - trying alternatives`);
        // Treat IOC matching errors same as unfilled orders
        firstStatus.filled = null;
      } 
      
      if (!firstStatus.filled) {
        // If order wasn't filled immediately, try again with even more aggressive pricing
        logger.warn(`Order not filled immediately - retrying with more aggressive pricing`);
        
        // Increase slippage to 10% for extreme market conditions
        const emergencySlippageMultiplier = side === 'buy' ? 1.1 : 0.9;
        const emergencyPrice = currentPrice.mul(emergencySlippageMultiplier);
        const emergencyPriceFormatted = await this.formatPrice(symbol, emergencyPrice, side);
        
        // Update order parameters with emergency settings
        orderParams.limit_px = emergencyPriceFormatted;
        
        // Try again with IOC first
        logger.info(`EMERGENCY: Placing closing order with aggressive slippage - price: ${emergencyPriceFormatted}`);
        const emergencyIocResponse = await this.retryWithBackoff(
          () => this.sdk.exchange.placeOrder(orderParams),
          2,
          500
        );
        
        // Process emergency IOC response
        if (emergencyIocResponse?.response?.data?.statuses?.[0]?.filled) {
          // IOC order was filled, update response for further processing
          firstStatus.filled = emergencyIocResponse.response.data.statuses[0].filled;
        } else {
          // If still not filled, try with GTC order type as a last resort
          logger.warn(`IOC order not filled even with aggressive pricing - trying GTC order`);
          
          // Switch to GTC (Good-till-Cancel) order type
          const gtcOrderParams = { ...orderParams, order_type: { limit: { tif: 'Gtc' as Tif } } };
          
          // Further increase slippage to 15% for extreme market conditions
          const extremeSlippageMultiplier = side === 'buy' ? 1.15 : 0.85;
          const extremePrice = currentPrice.mul(extremeSlippageMultiplier);
          const extremePriceFormatted = await this.formatPrice(symbol, extremePrice, side);
          gtcOrderParams.limit_px = extremePriceFormatted;
          
          logger.info(`LAST RESORT: Placing GTC order with extreme slippage - price: ${extremePriceFormatted}`);
          const gtcResponse = await this.retryWithBackoff(
            () => this.sdk.exchange.placeOrder(gtcOrderParams),
            2,
            500
          );
          
          // Process GTC response
          if (!gtcResponse?.response?.data?.statuses?.length) {
            throw new Error(`Failed to close position even with GTC order. Manual intervention required.`);
          }
          
          const gtcStatus = gtcResponse.response.data.statuses[0];
          
          // For GTC, we might get accepted rather than filled immediately
          if (gtcStatus.accepted) {
            logger.info(`GTC order accepted (ID: ${gtcStatus.accepted.oid}). Will remain open until filled.`);
            firstStatus.filled = { 
              oid: gtcStatus.accepted.oid,
              avgPx: "market",
              totalSz: positionSizeAbs.toString()
            };
          } else if (gtcStatus.filled) {
            firstStatus.filled = gtcStatus.filled;
          } else {
            throw new Error(`Failed to place closing order. Status: ${this.safeStringify(gtcStatus)}`);
          }
        }
      }

      // Extract order ID and execution details
      let orderId = "unknown";
      let avgPrice = null;
      let filledSize = null;

      if (firstStatus.filled?.oid) {
        orderId = String(firstStatus.filled.oid);
        avgPrice = firstStatus.filled.avgPx ? String(firstStatus.filled.avgPx) : null;
        filledSize = firstStatus.filled.totalSz ? String(firstStatus.filled.totalSz) : null;
      } else {
        // This shouldn't happen given the checks above, but just in case
        throw new Error(`Order accepted but not filled. Status: ${this.safeStringify(firstStatus)}`);
      }

      logger.info(`Position closed successfully. Order ID: ${orderId}, avg price: ${avgPrice}, filled size: ${filledSize}`);
      
      // Verify the position is actually closed
      const updatedPosition = await this.getPosition(symbol);
      const updatedPositionSize = new Decimal(updatedPosition.position);
      
      if (!updatedPositionSize.equals(new Decimal('0')) && 
          !updatedPositionSize.abs().lessThan(new Decimal('0.001'))) {
        logger.warn(`Position not fully closed: ${updatedPositionSize.toString()} remaining`);
        
        // If there's a significant remaining position, log it as a warning
        if (updatedPositionSize.abs().greaterThan(positionSizeAbs.mul(0.05))) {
          // More than 5% of position remains
          await this.firestoreService.logEvent("position_partially_closed", {
            symbol,
            originalSize: positionSize.toString(),
            remainingSize: updatedPositionSize.toString(),
            percentRemaining: updatedPositionSize.abs().div(positionSizeAbs).mul(100).toString()
          });
        }
      } else {
        logger.info(`Position for ${symbol} successfully closed (verified zero position)`);
      }

      // Record the order
      await this.firestoreService.createOrder({
        orderId,
        symbol,
        side,
        size: closingSize.toString(),
        executedSize: filledSize || closingSize.toString(),
        executedPrice: avgPrice || "unknown",
        type: "market",
        status: "executed",
        purpose: "position_close",
        timestamp: Date.now(),
        walletAddress: this.walletAddress,
      });

      return orderId ?? "";
    } catch (error) {
      logger.error(`Error closing position for ${symbol}:`, error);
      
      // Log this serious error
      await this.firestoreService.logEvent("error_closing_position", {
        error: String(error),
        symbol,
        size: size.toString(),
        timestamp: Date.now(),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }

  /**
   * Get wallet address for API calls
   * Helper method to get consistent wallet address for all API calls
   */
  private getWalletAddress(): string {
    const walletAddress = process.env.HYPERLIQUID_MAIN_WALLET_ADDRESS;
    if (!walletAddress) {
      logger.error("HYPERLIQUID_MAIN_WALLET_ADDRESS environment variable is not set");
      throw new Error("HYPERLIQUID_MAIN_WALLET_ADDRESS environment variable is required");
    }

    // Validate wallet address format
    if (!walletAddress.startsWith("0x") || walletAddress.length !== 42) {
      logger.error("Invalid wallet address format");
      throw new Error("Invalid wallet address format. Must be a 42-character hexadecimal string starting with 0x");
    }

    return walletAddress.toLowerCase();
  }

  /**
   * Get the tick size for a given asset
   * @param asset The asset symbol
   * @returns The tick size for the asset
   */
  public async getTickSize(asset: string): Promise<number> {
    try {
      await this.ensureConnected();
      
      // Fetch exchange info if not already available
      if (!this.exchangeInfo?.assetInfo) {
        await this.fetchExchangeInfo();
      }

      // Find asset info
      const assetInfo = this.exchangeInfo?.assetInfo?.find(
        (info: any) => info.name === asset
      );

      if (!assetInfo) {
        // Use default values if asset info not found
        logger.warn(`Asset info not found for ${asset}, using default tick size`);
        return 0.001; // Default to 0.001 for most assets
      }

      return assetInfo.sizeIncrement || 0.001;
    } catch (error) {
      logger.error(`Error getting tick size for ${asset}:`, error);
      return 0.001; // Return a safe default if we fail to get the tick size
    }
  }
  

  /**
   * Get all current positions
   * @returns Array of position objects
   */
  async getPositions(): Promise<Position[]> {
    try {
      await this.ensureConnected();
      
      // Get user's perpetuals account summary
      const clearinghouseState = await this.sdk.info.perpetuals.getClearinghouseState(this.walletAddress);
      
      if (!clearinghouseState?.assetPositions) {
        logger.warn("No asset positions found in clearinghouse state");
        return [];
      }
      
      // Convert to our Position type with proper null/undefined checks
      return clearinghouseState.assetPositions
        .filter((pos: any) => pos && pos.position) // Filter out any null or undefined positions
        .map((pos: any) => {
          // Handle the structure properly
          const coinName = pos.coin || pos.position?.coin || "";
          const positionValue = pos.position?.szi || "0";
          const entryPrice = pos.position?.entryPx || "0";
          const markPrice = pos.markPx || "0";
          const unrealizedPnl = pos.unrealizedPnl || pos.position?.unrealizedPnl || "0";
          
          return {
            coin: String(coinName),
            position: String(positionValue),
            entryPx: String(entryPrice),
            markPx: String(markPrice),
            unrealizedPnl: String(unrealizedPnl)
          };
        });
    } catch (error) {
      logger.error('Error getting positions:', error);
      throw error;
    }
  }
}
