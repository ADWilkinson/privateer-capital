import axios, { AxiosInstance } from "axios";
import { FirestoreService, PriceDataPoint } from "./firestoreService";
import { logger } from "../utils/logger";
import { getCoinGeckoId, isWhitelisted, coinGeckoIds } from "../utils/assetMappings";
import { CacheService } from "../utils/cacheService";
import dotenv from "dotenv";

// Load environment variables
dotenv.config({
  path: `.env.${process.env.NODE_ENV || "development"}`,
});

/**
 * Service for collecting and storing price data
 */
export interface OHLCV {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class PriceDataService {
  private readonly firestoreService: FirestoreService;
  private readonly cacheService: CacheService;
  private readonly apiClient: AxiosInstance;

  // Cache configuration
  private readonly PRICE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes in milliseconds
  private readonly MAX_RETRIES = 3;
  private readonly SNAPSHOT_CACHE_KEY = "recent_price_snapshot";

  constructor(firestoreService: FirestoreService) {
    this.firestoreService = firestoreService;
    this.cacheService = CacheService.getInstance();

    // Initialize CoinGecko API client
    this.apiClient = axios.create({
      baseURL: "https://api.coingecko.com/api/v3",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-cg-demo-api-key": process.env.COINGECKO_API_KEY || "",
      },
    });

    // Add retry mechanism with exponential backoff for API calls
    this.apiClient.interceptors.response.use(undefined, async (error) => {
      if (error.response && error.response.status === 429) {
        logger.warn("Rate limit exceeded, retrying with backoff");
        await new Promise((resolve) => setTimeout(resolve, 2000));
        return this.apiClient.request(error.config);
      }
      return Promise.reject(error);
    });
  }

  /**
   * Normalize a cryptocurrency symbol
   * Removes -PERP suffix for CoinGecko API calls but preserves it for trading
   */
  public normalizeSymbol(symbol: string, forTrading = false): string {
    const baseSymbol = symbol.toUpperCase();
    
    // For trading, ensure symbol has -PERP suffix
    if (forTrading) {
      return baseSymbol.endsWith("-PERP") 
        ? baseSymbol
        : `${baseSymbol}-PERP`;
    }
    
    // For CoinGecko API calls, remove -PERP suffix if present
    return baseSymbol.replace(/-PERP$/, "");
  }

  /**
   * Checks if a symbol has perpetual contract suffix
   */
  private isPerpetualContract(symbol: string): boolean {
    return symbol.toUpperCase().endsWith("-PERP");
  }

  /**
   * Collect and store price snapshots for all whitelisted assets
   * This method takes a snapshot of current prices and stores it in Firestore
   * @returns Object mapping asset symbols to their current prices
   */
  async collectAndStorePriceSnapshots(): Promise<{ [key: string]: number }> {
    try {
      logger.info("Collecting price snapshots for all whitelisted assets");

      // Get all whitelisted assets from the coinGeckoIds mapping
      const whitelistedAssets = Object.keys(coinGeckoIds);

      if (whitelistedAssets.length === 0) {
        logger.warn("No whitelisted assets found for price collection");
        return {};
      }

      // Fetch current prices from CoinGecko using normalized symbols (without -PERP)
      const normalizedSymbols = whitelistedAssets.map((symbol) => this.normalizeSymbol(symbol, false));
      const prices = await this.getPricesFromCoinGecko(normalizedSymbols);

      if (Object.keys(prices).length === 0) {
        logger.warn("No prices returned from CoinGecko");
        return {};
      }

      // Map the normalized prices back to the original symbols (with -PERP if needed)
      const timestamp = Date.now();
      const snapshotData = {
        timestamp,
        prices: {} as { [key: string]: number },
        source: "coingecko",
      };

      // Map each price back to its original symbol
      whitelistedAssets.forEach((originalSymbol) => {
        const normalizedSymbol = this.normalizeSymbol(originalSymbol, false);
        if (prices[normalizedSymbol] !== undefined) {
          snapshotData.prices[originalSymbol] = prices[normalizedSymbol];
        }
      });

      // Store the snapshot document
      const snapshotRef = this.firestoreService.getCollection("priceSnapshots").doc(`${timestamp}`);
      await this.firestoreService.createBatch().set(snapshotRef, snapshotData).commit();

      // Update cache with the latest snapshot
      this.cacheService.set(this.SNAPSHOT_CACHE_KEY, snapshotData, this.PRICE_CACHE_TTL);

      logger.info(
        `Successfully stored price snapshot for ${Object.keys(snapshotData.prices).length} assets at ${new Date(
          timestamp
        ).toISOString()}`
      );

      return snapshotData.prices;
    } catch (error) {
      logger.error("Error collecting and storing price snapshots:", error);
      throw error;
    }
  }

  /**
   * Group price points by day for OHLC calculation
   */
  private groupPricePointsByDay(pricePoints: { timestamp: number; price: number }[]): { [day: string]: number[] } {
    const pricesByDay: { [day: string]: number[] } = {};

    for (const point of pricePoints) {
      // Round to the beginning of the day (UTC)
      const dayTimestamp = Math.floor(point.timestamp / (24 * 60 * 60 * 1000)) * (24 * 60 * 60 * 1000);

      if (!pricesByDay[dayTimestamp]) {
        pricesByDay[dayTimestamp] = [];
      }

      pricesByDay[dayTimestamp].push(point.price);
    }

    return pricesByDay;
  }

  /**
   * Convert price points to OHLCV candles
   */
  private createOHLCVCandles(pricesByDay: { [day: string]: number[] }): OHLCV[] {
    const candles: OHLCV[] = [];

    for (const [dayTimestamp, prices] of Object.entries(pricesByDay)) {
      if (prices.length > 0) {
        candles.push({
          timestamp: parseInt(dayTimestamp),
          open: prices[0],
          high: Math.max(...prices),
          low: Math.min(...prices),
          close: prices[prices.length - 1],
          volume: 0, // We don't track volume in our snapshots
        });
      }
    }

    // Sort by timestamp ascending
    return candles.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Fetches historical price data for an asset
   * @param symbol Asset symbol
   * @returns Array of OHLCV data points
   */
  async getHistoricalPriceData(symbol: string): Promise<OHLCV[]> {
    try {
      // Calculate the start time (7 days ago)
      const startTime = Date.now() - 7 * 24 * 60 * 60 * 1000;

      // Fetch historical price data from Firestore
      return this.firestoreService.getHistoricalPriceData(symbol, startTime);
    } catch (error) {
      logger.error(`Error fetching historical price data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Get historical price data for multiple assets using a specific number of data points
   * This method retrieves the most recent N data points from our stored snapshots in Firestore
   * @param symbols Array of asset symbols to get historical data for
   * @param numDataPoints Number of data points to retrieve
   * @returns Object mapping symbols to their price points
   */
  async getHistoricalPriceDataByPointsForMultipleAssets(
    symbols: string[],
    numDataPoints: number
  ): Promise<{ [key: string]: { timestamp: number; price: number }[] }> {
    try {
      // Filter out non-whitelisted symbols
      // Always use base symbols without -PERP suffix for data retrieval
      const normalizedSymbols = symbols.map((symbol) => this.normalizeSymbol(symbol, false));
      const whitelistedSymbols = normalizedSymbols.filter((symbol) => isWhitelisted(symbol));

      if (whitelistedSymbols.length === 0) {
        logger.warn("No whitelisted symbols found for historical data");
        return {};
      }

      // Query the priceSnapshots collection for the most recent snapshots
      const snapshot = await this.firestoreService
        .getCollection("priceSnapshots")
        .orderBy("timestamp", "asc")
        .limit(numDataPoints)
        .get();

      if (snapshot.empty) {
        logger.warn("No price snapshots found");
        return {};
      }

      // Store all snapshots in a single array
      const allSnapshots: { timestamp: number; prices: { [key: string]: number } }[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        if (data.prices) {
          allSnapshots.push({
            timestamp: data.timestamp,
            prices: data.prices,
          });
        }
      });

      // Extract data for all requested symbols
      const result: { [key: string]: { timestamp: number; price: number }[] } = {};

      // Map the original symbols to their normalized versions to maintain input/output consistency
      const originalToNormalized: { [key: string]: string } = {};
      symbols.forEach((originalSymbol, index) => {
        if (index < normalizedSymbols.length) {
          originalToNormalized[originalSymbol] = normalizedSymbols[index];
        }
      });

      // Process each original symbol
      symbols.forEach((originalSymbol) => {
        // Get the normalized (base) symbol for database lookup
        const normalizedSymbol = originalToNormalized[originalSymbol];
        
        // Skip symbols not in the whitelist
        if (!normalizedSymbol || !isWhitelisted(normalizedSymbol)) {
          logger.warn(`Skipping non-whitelisted symbol: ${originalSymbol}`);
          return;
        }
        
        const pricePoints: { timestamp: number; price: number }[] = [];

        allSnapshots.forEach((snapshot) => {
          // Look up price using the normalized symbol (without -PERP)
          const price = snapshot.prices[normalizedSymbol];
          if (price !== undefined) {
            pricePoints.push({
              timestamp: snapshot.timestamp,
              price: price,
            });
          }
        });

        if (pricePoints.length > 0) {
          // Store the result under the original symbol (which might include -PERP)
          result[originalSymbol] = pricePoints;
          logger.info(`Retrieved ${pricePoints.length}/${numDataPoints} requested data points for ${originalSymbol}`);
        } else {
          logger.warn(`Insufficient data points for ${originalSymbol} (0 points)`);
        }
      });

      return result;
    } catch (error) {
      logger.error("Error fetching historical price data:", error);
      throw error;
    }
  }

  /**
   * Get historical price data for a specific asset using a specific number of data points
   * This method retrieves the most recent N data points from our stored snapshots in Firestore
   * @param symbol Asset symbol to get historical data for
   * @param numDataPoints Number of data points to retrieve
   * @returns Array of price points
   */
  async getHistoricalPriceDataByPoints(symbol: string, numDataPoints: number): Promise<{ timestamp: number; price: number }[]> {
    try {
      // Always normalize to base symbol without -PERP for data lookups
      const normalizedSymbol = this.normalizeSymbol(symbol, false);
      const originalSymbol = symbol; // Keep the original symbol for logging

      // Validate symbol
      if (!isWhitelisted(normalizedSymbol)) {
        logger.warn(`Symbol ${originalSymbol} is not whitelisted for historical data`);
        return [];
      }

      // Query the priceSnapshots collection for the most recent snapshots
      const snapshot = await this.firestoreService
        .getCollection("priceSnapshots")
        .orderBy("timestamp", "asc")
        .limit(numDataPoints)
        .get();

      if (snapshot.empty) {
        logger.warn(`No price snapshots found for ${originalSymbol}`);
        return [];
      }

      // Extract price points
      const pricePoints: { timestamp: number; price: number }[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        // Look up price using the normalized symbol (without -PERP)
        if (data.prices && data.prices[normalizedSymbol] !== undefined) {
          pricePoints.push({
            timestamp: data.timestamp,
            price: data.prices[normalizedSymbol],
          });
        }
      });

      if (pricePoints.length > 0) {
        logger.info(
          `Retrieved ${pricePoints.length}/${numDataPoints} requested data points for ${originalSymbol}`
        );
      } else {
        logger.warn(`Insufficient data points for ${originalSymbol} (0 points)`);
      }
      
      return pricePoints;
    } catch (error) {
      logger.error(`Error fetching historical price data for ${symbol}:`, error);
      throw error;
    }
  }

  /**
   * Check if we have a fresh price snapshot in cache or Firestore
   */
  private async getRecentPriceSnapshot(): Promise<any | null> {
    // First, check the cache
    const cachedSnapshot = this.cacheService.get(this.SNAPSHOT_CACHE_KEY);
    if (cachedSnapshot) {
      return cachedSnapshot;
    }

    // If not in cache, check Firestore
    const lastSnapshotQuery = this.firestoreService
      .getCollection("priceSnapshots")
      .orderBy("timestamp", "desc")
      .limit(1);

    const snapshot = await lastSnapshotQuery.get();

    if (!snapshot.empty) {
      const snapshotData = snapshot.docs[0].data();
      const snapshotTimestamp = snapshotData.timestamp;
      const currentTime = Date.now();

      // If snapshot is less than 5 minutes old, use it
      if (currentTime - snapshotTimestamp < this.PRICE_CACHE_TTL) {
        // Cache it for future use
        this.cacheService.set(
          this.SNAPSHOT_CACHE_KEY,
          snapshotData,
          this.PRICE_CACHE_TTL - (currentTime - snapshotTimestamp)
        );
        return snapshotData;
      }
    }

    return null;
  }

  /**
   * Get current prices for multiple assets
   * @param symbols Array of asset symbols to get prices for
   * @returns Object mapping symbols to their current prices
   */
  async getCurrentPrices(symbols: string[]): Promise<{ [key: string]: number }> {
    try {
      // Normalize symbols by removing -PERP suffix for data lookups
      const normalizedSymbols = symbols.map(symbol => this.normalizeSymbol(symbol, false));
      
      // Try to get recent price snapshot
      const snapshotData = await this.getRecentPriceSnapshot();

      if (!snapshotData || !snapshotData.prices) {
        logger.warn("No recent price snapshot available");
        return {};
      }

      // Map the normalized symbols back to the original format for the response
      const result: { [key: string]: number } = {};
      symbols.forEach((originalSymbol, index) => {
        const normalizedSymbol = normalizedSymbols[index];
        if (snapshotData.prices[normalizedSymbol] !== undefined) {
          // Store the result under the original input symbol format
          result[originalSymbol] = snapshotData.prices[normalizedSymbol];
        } else {
          logger.warn(`No price data found for ${originalSymbol} (normalized: ${normalizedSymbol})`);
        }
      });

      return result;
    } catch (error) {
      logger.error("Error getting current prices:", error);
      throw error;
    }
  }

  /**
   * Fetch with retry logic
   */
  private async fetchWithRetry(url: string, maxRetries = 3): Promise<any> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.apiClient.get(url);
        return response.data;
      } catch (error: any) {
        lastError = error;
        logger.warn(`CoinGecko API request failed (attempt ${attempt}/${maxRetries}): ${error.message}`);

        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s, 8s, etc.
          const delay = 1000 * Math.pow(2, attempt - 1);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Failed to fetch from CoinGecko API after multiple retries");
  }

  /**
   * Get prices from CoinGecko API
   * @param assets List of assets to get prices for
   * @returns Object mapping asset symbols to their prices
   */
  private async getPricesFromCoinGecko(assets: string[]): Promise<{ [key: string]: number }> {
    try {
      // Convert Hyperliquid symbols to CoinGecko IDs
      const coinGeckoIdsToFetch = assets
        .map((asset) => {
          const id = getCoinGeckoId(asset);
          if (!id) {
            logger.debug(`No CoinGecko ID found for asset: ${asset}`);
          }
          return id;
        })
        .filter(Boolean) as string[];

      if (coinGeckoIdsToFetch.length === 0) {
        logger.warn("No valid CoinGecko IDs found for the provided assets");
        return {};
      }

      // Build the API request URL with all IDs
      const idsParam = coinGeckoIdsToFetch.join(",");
      const endpoint = `simple/price?ids=${idsParam}&vs_currencies=usd&precision=full`;

      // Make the API request
      const response = await this.fetchWithRetry(endpoint, this.MAX_RETRIES);

      if (!response) {
        logger.warn("No data returned from CoinGecko API");
        return {};
      }

      // Convert the response to our format
      const prices: { [key: string]: number } = {};

      // Map CoinGecko IDs back to Hyperliquid symbols
      for (const [coinGeckoId, priceData] of Object.entries(response)) {
        // Find the original asset symbol for this CoinGecko ID
        const assetSymbol = assets.find((asset) => getCoinGeckoId(asset) === coinGeckoId);

        if (assetSymbol && priceData && (priceData as any).usd) {
          prices[assetSymbol] = (priceData as any).usd;
        }
      }

      return prices;
    } catch (error) {
      logger.error("Error fetching prices from CoinGecko:", error);
      throw error;
    }
  }
}
