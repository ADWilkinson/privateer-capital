import axios from "axios";
import { cacheService } from "../utils/cache";
import { collection, query, orderBy, limit, getDocs, where } from "firebase/firestore";
import { db } from "../firebase";

// Define types
export interface Trade {
  id: string;
  timestamp: number;
  symbol: string;
  side: 'long' | 'short' | string;
  executedPrice: string | number;
  executedSize: string;
  leverage: number;
  orderId: string;
  status: 'open' | 'closed' | string;
  type: string;
  walletAddress: string;
  createdAt: string;
  // Additional fields for trade details
  finalPnl?: number | string;
  entryPrice?: string | number;
  exitPrice?: string | number;
  exitTimestamp?: number; 
  duration?: number;
  correlatedPair?: {
    symbol: string;
    correlation: number;
    side?: string;
    id?: string;
  };
  stopLoss?: number | string;
  takeProfit?: number | string;
  closedAt?: number;
  pnl?: number | string;
  closeOrderId?: string;
  closeReason?: string;
  pairTradeId?: string;
  updatedAt?: any;
}

export interface CorrelationPair {
  id: string;  // Document ID (format: "ASSET1_ASSET2")
  pairA: string;
  pairB: string;
  correlation: number;
  correlationCoefficient?: number;
  dataPoints?: number;
  lookbackPeriod?: string;
  spreadMean: number | null;
  spreadStd: number | null;
  spreadZScore: number | null;
  pValue?: number | null;
  halfLife: number | null;
  cointegrated: boolean;
  regressionCoefficient: number | null;
  timestamp: number;
  createdAt?: any;
  updatedAt?: any;
  lastUpdated?: any;
  regressionFormula?: string;  // Added for UI display
}

export interface BotEvent {
  id: string;
  timestamp: number;
  type: string;
  eventType?: string; // For backward compatibility
  message: string;
  data?: Record<string, any>;
  createdAt?: any;
}

export interface RiskMetrics {
  totalBalance?: number;
  availableMargin?: number;
  maxOpenPositions?: 4; // Fixed to 4 positions (2 pair trades)
  currentRiskPercent?: number;
  maxRiskPercent?: 0.2; // 20% per trade
  positionSizePercent?: 0.2; // 20% per trade
}

export interface AccountMetrics {
  id: string;
  timestamp: number;
  totalBalance: number;
  availableMargin: number;
  dailyPnl: number;
  totalPnl?: number;
  winRate?: number;
  profitableTrades?: number;
  totalTrades?: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface DashboardData {
  performance?: {
    totalPnl?: number;
    dailyPnl?: number;
    winRate?: number;
    profitableTrades?: number;
    totalTrades?: number;
    pnlHistory?: Array<{date: string, value: number}>;
  };
  botEvents?: BotEvent[];
  activeTrades?: Trade[];
  correlatedPairs?: CorrelationPair[];
  riskMetrics?: RiskMetrics;
  accountMetrics?: AccountMetrics;
  positionSizePercent?: number;
  walletAddress?: string;
  timestamp?: number;
  apiErrors?: any[];
}

// API Configuration
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";
const API_URL = `${BASE_URL}/api`; // Append /api to the base URL

// Create an axios instance with defaults
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Add response interceptor for global error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Parse and enhance error message
    let errorMessage = "An unknown error occurred";

    if (error.response) {
      // The server responded with a status code outside the 2xx range
      errorMessage = error.response.data?.message || `Error ${error.response.status}: ${error.response.statusText}`;
    } else if (error.request) {
      // The request was made but no response was received
      errorMessage = "No response received from server. Please check your connection.";
    } else {
      // Something happened in setting up the request
      errorMessage = error.message;
    }

    console.error("API Error:", errorMessage, error);

    // Add additional context to the error
    error.friendlyMessage = errorMessage;
    return Promise.reject(error);
  }
);

// Call the trading bot API
export async function fetchDashboardData(): Promise<DashboardData> {
  try {
    // Try to fetch from API first (note: api.baseURL already contains the /api path)
    const response = await api.get('/dashboard-data');
    return response.data;
  } catch (error) {
    console.error('Error fetching dashboard data from API:', error);
    
    try {
      // Fall back to direct Firestore access
      const accountMetricsRef = collection(db, 'accountMetrics');
      const botEventsRef = collection(db, 'botEvents');
      const tradesRef = collection(db, 'trades');
      const pairsRef = collection(db, 'correlatedPairs');
      const apiErrorsRef = collection(db, 'apiErrors');
      
      const [accountMetricsData, botEventsData, tradesData, pairsData, apiErrorsData] = await Promise.all([
        getDocs(query(accountMetricsRef, orderBy('timestamp', 'desc'), limit(30))),
        getDocs(query(botEventsRef, orderBy('timestamp', 'desc'), limit(20))),
        getDocs(query(tradesRef, orderBy('timestamp', 'desc'))),
        getDocs(query(pairsRef, where('cointegrated', '==', true), orderBy('timestamp', 'desc'))),
        getDocs(query(apiErrorsRef, orderBy('timestamp', 'desc'), limit(10)))
      ]);

      // Extract the latest account metrics
      const latestMetrics = accountMetricsData.docs[0]?.data() || {};
      
      // Create historical PnL data from account metrics
      // Get docs sorted by timestamp (oldest first)
      const sortedDocs = [...accountMetricsData.docs].sort((a, b) => {
        const aTime = a.data().timestamp || 0;
        const bTime = b.data().timestamp || 0;
        return aTime - bTime;
      });
      
      // Get the earliest recorded balance to use as baseline
      const baselineValue = sortedDocs.length > 0 ? sortedDocs[0].data().totalBalance || 0 : 0;
      
      // Calculate PnL relative to first entry
      const pnlHistory = sortedDocs.map(doc => {
        const data = doc.data();
        const currentValue = data.totalBalance || 0;
        return {
          date: new Date(data.timestamp).toLocaleDateString(),
          value: currentValue - baselineValue, // Show as PnL relative to starting point
          actualValue: currentValue // Keep track of the actual value for tooltips
        };
      });
      
      // Extract events
      const botEvents = botEventsData.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as BotEvent[];

      // Extract API errors
      const apiErrors = apiErrorsData.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Filter for active trades with any case of 'open' status
      const activeTrades = tradesData.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status?.toString().toLowerCase();
          return status === 'open' || status === 'active'; // Accept 'open' or 'active' in any case
        })
        .map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            timestamp: data.timestamp,
            symbol: data.symbol || 'Unknown',
            side: data.side || 'unknown',
            executedPrice: data.entryPrice || data.executedPrice || '0',
            executedSize: data.size || data.executedSize || '0',
            leverage: data.leverage || 1,
            orderId: data.orderId || '',
            status: (data.status || 'open').toLowerCase(), // Always normalize status
            type: data.type || '',
            walletAddress: data.walletAddress || '',
            createdAt: data.createdAt || new Date().toISOString(),
            pnl: data.pnl || '0',
            stopLoss: data.stopLoss,
            takeProfit: data.takeProfit,
            correlatedPair: data.correlatedPair,
            pairTradeId: data.pairTradeId
          };
        }) as Trade[];

      // Extract all closed trades for calculating performance metrics
      const closedTrades = tradesData.docs
        .filter(doc => {
          const data = doc.data();
          const status = data.status?.toString().toLowerCase();
          return status === 'closed';
        })
        .map(doc => doc.data());
      
      // Calculate performance metrics from closed trades
      const totalTrades = closedTrades.length;
      const profitableTrades = closedTrades.filter(trade => {
        const pnl = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : (trade.pnl || 0);
        return pnl > 0;
      }).length;
      const winRate = totalTrades > 0 ? profitableTrades / totalTrades : 0;
      const totalPnl = closedTrades.reduce((sum, trade) => {
        const pnl = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : (trade.pnl || 0);
        return sum + pnl;
      }, 0);

      // Extract correlated pairs
      const correlatedPairs = pairsData.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          pairA: data.pairA,
          pairB: data.pairB,
          correlation: data.correlation || 0,
          cointegrated: data.cointegrated || false,
          regressionCoefficient: data.regressionCoefficient || null,
          spreadMean: data.spreadMean !== undefined ? data.spreadMean : null,
          spreadStd: data.spreadStd !== undefined ? data.spreadStd : null,
          spreadZScore: data.spreadZScore !== undefined ? data.spreadZScore : null,
          halfLife: data.halfLife || null,
          timestamp: data.timestamp || 0,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt
        };
      }) as CorrelationPair[];

      // Construct the dashboard data
      const accountMetrics: AccountMetrics = {
        id: accountMetricsData.docs[0]?.id || 'latest',
        timestamp: latestMetrics.timestamp || Date.now(),
        totalBalance: latestMetrics.totalBalance || 0,
        availableMargin: latestMetrics.availableMargin || 0,
        dailyPnl: latestMetrics.dailyPnl || 0,
        totalPnl,
        winRate,
        profitableTrades,
        totalTrades,
        createdAt: latestMetrics.createdAt,
        updatedAt: latestMetrics.updatedAt
      };

      return {
        performance: {
          totalPnl,
          dailyPnl: latestMetrics.dailyPnl || 0,
          winRate,
          profitableTrades,
          totalTrades,
          pnlHistory
        },
        botEvents,
        activeTrades,
        correlatedPairs,
        accountMetrics,
        riskMetrics: {
          totalBalance: latestMetrics.totalBalance,
          availableMargin: latestMetrics.availableMargin
        },
        timestamp: Date.now(),
        apiErrors
      };
    } catch (firestoreError) {
      console.error('Error fetching dashboard data from Firestore:', firestoreError);
      throw new Error('Failed to fetch dashboard data');
    }
  }
};

// Get detailed correlation data
export const fetchCorrelationData = async (): Promise<CorrelationPair[]> => {
  try {
    const response = await api.get('/api/correlations');
    return response.data;
  } catch (error) {
    console.error('Error fetching correlation data from API:', error);
    
    try {
      const pairsRef = collection(db, 'correlatedPairs');
      const querySnapshot = await getDocs(
        query(pairsRef, where('cointegrated', '==', true), orderBy('timestamp', 'desc'))
      );

      return querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as CorrelationPair[];
    } catch (firestoreError) {
      console.error('Error fetching correlation data from Firestore:', firestoreError);
      throw new Error('Failed to fetch correlation data');
    }
  }
};

// Get detailed correlation data
export const fetchCorrelationPairs = async (): Promise<CorrelationPair[]> => {
  try {
    const cachedData = cacheService.get<CorrelationPair[]>("correlationPairs");
    if (cachedData) {
      console.log("Using cached correlation pairs data:", cachedData.length, "pairs");
      return cachedData;
    }

    try {
      // Try Firestore first
      console.log("Attempting to fetch correlation pairs from Firestore...");
      console.log("Firebase project ID:", import.meta.env.VITE_FIREBASE_PROJECT_ID);
      
      try {
        const pairsRef = collection(db, "correlatedPairs");
        console.log("Collection reference created successfully");
        
        const pairsQuery = query(pairsRef, orderBy("correlation", "desc"));
        console.log("Query created successfully");
        
        const pairsSnapshot = await getDocs(pairsQuery);
        console.log("Query executed successfully");
        console.log("Firestore query complete. Found", pairsSnapshot.docs.length, "documents");
        
        if (pairsSnapshot.empty) {
          console.log("No correlation pairs found in Firestore collection 'correlatedPairs'");
          return [];
        }
        
        const pairs = pairsSnapshot.docs.map((doc) => {
          const data = doc.data();
          console.log("Processing document:", doc.id, "with data:", data);
          const regressionCoeff = data.regressionCoefficient || null;
          
          return {
            id: doc.id,
            pairA: data.pairA,
            pairB: data.pairB,
            correlation: data.correlation || 0,
            correlationCoefficient: data.correlationCoefficient || 0,
            dataPoints: data.dataPoints || 0,
            lookbackPeriod: data.lookbackPeriod || "",
            spreadMean: data.spreadMean || null,
            spreadStd: data.spreadStd || null,
            spreadZScore: data.spreadZScore || null,
            pValue: data.pValue || null,
            halfLife: data.halfLife || null,
            cointegrated: data.cointegrated || false,
            regressionCoefficient: regressionCoeff,
            regressionFormula: regressionCoeff ? `${data.pairA} = ${regressionCoeff.toFixed(4)} × ${data.pairB}` : undefined,
            timestamp: data.lastUpdated?.toMillis?.() || data.timestamp || Date.now(),
          };
        });
        
        // Sort pairs by cointegration status (true first)
        pairs.sort((a, b) => (b.cointegrated ? 1 : 0) - (a.cointegrated ? 1 : 0));
        
        console.log("Successfully mapped", pairs.length, "correlation pairs from Firestore");
        cacheService.set("correlationPairs", pairs, 30000);
        return pairs;
      } catch (innerError) {
        console.error("Detailed Firestore error:", innerError);
        if (innerError instanceof Error) {
          console.error("Error message:", innerError.message);
          console.error("Error stack:", innerError.stack);
        }
        throw innerError;
      }
    } catch (firestoreError) {
      console.error("Error fetching correlation pairs from Firestore:", firestoreError);
      
      // If Firestore fails, try the API
      console.log("Falling back to API endpoint for correlation pairs...");
      try {
        const response = await api.get<CorrelationPair[]>("/correlations");
        const pairs = response.data;
        
        // Sort pairs by cointegration status (true first)
        pairs.sort((a, b) => (b.cointegrated ? 1 : 0) - (a.cointegrated ? 1 : 0));
        
        console.log("API returned", pairs.length, "correlation pairs");
        cacheService.set("correlationPairs", pairs, 30000);
        return pairs;
      } catch (apiError) {
        console.error("API Error:", apiError);
        if (apiError instanceof Error) {
          console.error("API Error message:", apiError.message);
          console.error("API Error stack:", apiError.stack);
        }
        throw apiError;
      }
    }
  } catch (error) {
    console.error("Error in fetchCorrelationPairs:", error);
    throw error;
  }
};

// Get performance history
export const fetchPerformanceHistory = async (days = 30): Promise<any[]> => {
  try {
    const cacheKey = `performanceHistory_${days}`;
    const cachedData = cacheService.get<any[]>(cacheKey);
    if (cachedData) return cachedData;

    try {
      // Try Firestore first - using accountMetrics collection
      const metricsRef = collection(db, "accountMetrics");
      const metricsQuery = query(
        metricsRef,
        orderBy("timestamp", "desc"),
        limit(days)
      );
      const metricsSnapshot = await getDocs(metricsQuery);
      const metrics = metricsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          date: new Date(data.timestamp).toLocaleDateString(),
          value: data.totalBalance,
        };
      });
      
      cacheService.set(cacheKey, metrics, 120000);
      return metrics;
    } catch (firestoreError) {
      console.error("Error fetching performance history from Firestore:", firestoreError);
      
      // If Firestore fails, try the API
      const response = await api.get<any[]>(`/performance/history?days=${days}`);
      const metrics = response.data;
      
      cacheService.set(cacheKey, metrics, 120000);
      return metrics;
    }
  } catch (error) {
    console.error("Error in fetchPerformanceHistory:", error);
    throw error;
  }
};

// Get bot events
export const fetchBotEvents = async (limitCount = 20): Promise<BotEvent[]> => {
  try {
    const cacheKey = `botEvents_${limitCount}`;
    const cachedData = cacheService.get<BotEvent[]>(cacheKey);
    if (cachedData) return cachedData;

    try {
      // Try Firestore first
      const eventsRef = collection(db, "botEvents");
      const eventsQuery = query(
        eventsRef,
        orderBy("timestamp", "desc"),
        limit(limitCount)
      );
      const eventsSnapshot = await getDocs(eventsQuery);
      const events = eventsSnapshot.docs.map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp,
          // Handle both eventType and type for backward compatibility
          type: data.type || data.eventType,
          eventType: data.eventType || data.type,
          message: data.message || '',
          data: data.data || {},
          createdAt: data.createdAt
        };
      }) as BotEvent[];
      
      cacheService.set(cacheKey, events, 15000);
      return events;
    } catch (firestoreError) {
      console.error("Error fetching bot events from Firestore:", firestoreError);
      
      // If Firestore fails, try the API
      const response = await api.get<BotEvent[]>(`/events?limit=${limitCount}`);
      const events = response.data;
      
      cacheService.set(cacheKey, events, 15000);
      return events;
    }
  } catch (error) {
    console.error("Error in fetchBotEvents:", error);
    throw error;
  }
};

// Get bot health status
export const checkBotHealth = async (): Promise<any> => {
  try {
    const cachedData = cacheService.get("botHealth");
    if (cachedData) return cachedData;
    
    const response = await api.get("/health-check");
    const healthData = response.data;
    
    cacheService.set("botHealth", healthData, 60000); // Cache for 1 minute
    return healthData;
  } catch (error) {
    console.error("Error checking bot health:", error);
    throw error;
  }
};

// Trigger manual position synchronization
export const triggerSyncPositions = async (): Promise<any> => {
  try {
    // Use the API route for synchronization
    console.log('Using API sync endpoint:', `${API_URL}/sync-positions`);
    const response = await api.post('/sync-positions');
    
    // Invalidate sync status cache
    cacheService.invalidate("syncStatus");
    return response.data;
  } catch (error) {
    console.error("Error triggering position sync:", error);
    
    // Still return something to avoid breaking the UI
    return {
      status: "error",
      message: "Position sync failed, please try again later",
      timestamp: Date.now()
    };
  }
};

// Get all trades (with optional filtering)
export const fetchTrades = async (filters?: { status?: string }): Promise<Trade[]> => {
  try {
    const cacheKey = `trades_${filters?.status || 'all'}`;
    const cachedData = cacheService.get<Trade[]>(cacheKey);
    if (cachedData) return cachedData;

    try {
      // Try the API endpoint first
      try {
        const response = await api.get<Trade[]>(`/trades${filters?.status ? `?status=${filters.status}` : ''}`);
        
        if (response.data.length > 0) {
          // Ensure all trades have the required fields and consistent status
          const processedTrades = response.data.map(trade => ({
            ...trade,
            id: trade.id || `trade-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            status: (trade.status || 'unknown').toLowerCase(), // Always normalize status
            timestamp: trade.timestamp || Date.now(),
            symbol: trade.symbol || 'Unknown',
            side: trade.side || 'unknown',
            executedPrice: trade.entryPrice || trade.executedPrice || '0',
            executedSize: trade.executedSize || '0',
            leverage: trade.leverage || 1
          }));
          
          cacheService.set(cacheKey, processedTrades, 15000); // Cache for 15 seconds
          return processedTrades;
        }
        
        return response.data;
      } catch (apiError) {
        console.error("Error fetching trades from API, falling back to Firestore:", apiError);
      }
      
      // Fall back to Firestore 
      const tradesRef = collection(db, "trades");
      let tradesQuery = query(
        tradesRef,
        orderBy("timestamp", "desc")
      );
      
      const snapshot = await getDocs(tradesQuery);
      
      if (snapshot.empty) {
        return [];
      }
      
      let trades = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          timestamp: data.timestamp,
          symbol: data.symbol || "Unknown",
          side: data.side || "unknown",
          executedPrice: data.entryPrice || data.executedPrice || "0",
          executedSize: data.executedSize || "0",
          leverage: data.leverage || 1,
          orderId: data.orderId || "",
          status: (data.status || "unknown").toLowerCase(),
          type: data.type || "",
          walletAddress: data.walletAddress || "",
          createdAt: data.createdAt || new Date().toISOString(),
          finalPnl: data.pnl || data.finalPnl,
          entryPrice: data.entryPrice,
          exitPrice: data.exitPrice,
          exitTimestamp: data.exitTimestamp,
          closedAt: data.closedAt,
          pnl: data.pnl,
          correlatedPair: data.correlatedPair,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          closeOrderId: data.closeOrderId,
          closeReason: data.closeReason,
          pairTradeId: data.pairTradeId,
          updatedAt: data.updatedAt
        };
      });
      
      // Apply case-insensitive status filtering if needed
      if (filters?.status) {
        const statusLower = filters.status.toLowerCase();
        trades = trades.filter(trade => {
          const tradeStatus = (trade.status || '').toString().toLowerCase();
          return tradeStatus === statusLower ||
            // Also match Open/OPEN to 'open' status
            (statusLower === 'open' && 
             (tradeStatus === 'active' || tradeStatus === 'open'));
        });
      }
      
      cacheService.set(cacheKey, trades, 15000); // Cache for 15 seconds
      return trades;
    } catch (firestoreError) {
      console.error("Error fetching trades from Firestore:", firestoreError);
      
      // Fall back to API
      const response = await api.get<Trade[]>(`/trades${filters?.status ? `?status=${filters.status}` : ''}`);
      const trades = response.data;
      
      cacheService.set(cacheKey, trades, 15000);
      return trades;
    }
  } catch (error) {
    console.error("Error in fetchTrades:", error);
    throw error;
  }
};
