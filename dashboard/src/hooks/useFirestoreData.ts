import { useState, useEffect } from 'react';
import { 
  collection, 
  doc, 
  query, 
  onSnapshot, 
  QueryConstraint, 
  DocumentData, 
  DocumentReference, 
  Query, 
  CollectionReference,
  Unsubscribe,
  getDoc,
  getDocs,
  orderBy,
  where,
  limit
} from 'firebase/firestore';
import { db } from '../firebase';
import { useDashboard } from '../context/DashboardContext';

// Options for the hook
interface UseFirestoreOptions {
  realtime?: boolean;
  refreshDeps?: any[];
}

// Hook for getting a collection of documents
export function useFirestoreCollection<T = DocumentData>(
  collectionName: string,
  queryConstraints: QueryConstraint[] = [],
  options: UseFirestoreOptions = { realtime: true, refreshDeps: [] }
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { isDataRefreshing } = useDashboard();
  
  useEffect(() => {
    setIsLoading(true);
    let unsubscribe: Unsubscribe | undefined;
    
    const fetchData = async () => {
      try {
        const collectionRef = collection(db, collectionName);
        const q = query(collectionRef, ...queryConstraints);
        
        if (options.realtime) {
          // Set up real-time subscription
          unsubscribe = onSnapshot(q, (snapshot) => {
            const documents = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            })) as T[];
            
            setData(documents);
            setIsLoading(false);
            setError(null);
          }, (err) => {
            console.error(`Error in Firestore collection ${collectionName}:`, err);
            setError(err as Error);
            setIsLoading(false);
          });
        } else {
          // One-time fetch
          const snapshot = await getDocs(q);
          const documents = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })) as T[];
          
          setData(documents);
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error(`Error fetching collection ${collectionName}:`, err);
        setError(err as Error);
        setIsLoading(false);
      }
    };
    
    fetchData();
    
    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [collectionName, JSON.stringify(queryConstraints), options.realtime, isDataRefreshing, ...(options.refreshDeps || [])]);
  
  return { data, isLoading, error };
}

// Hook for getting a single document
export function useFirestoreDocument<T = DocumentData>(
  collectionName: string,
  documentId: string,
  options: UseFirestoreOptions = { realtime: true, refreshDeps: [] }
) {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { isDataRefreshing } = useDashboard();
  
  useEffect(() => {
    setIsLoading(true);
    let unsubscribe: Unsubscribe | undefined;
    
    const fetchData = async () => {
      try {
        const docRef = doc(db, collectionName, documentId);
        
        if (options.realtime) {
          // Set up real-time subscription
          unsubscribe = onSnapshot(docRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
              setData({
                id: docSnapshot.id,
                ...docSnapshot.data()
              } as T);
            } else {
              setData(null);
            }
            setIsLoading(false);
            setError(null);
          }, (err) => {
            console.error(`Error in Firestore document ${collectionName}/${documentId}:`, err);
            setError(err as Error);
            setIsLoading(false);
          });
        } else {
          // One-time fetch
          const docSnapshot = await getDoc(docRef);
          
          if (docSnapshot.exists()) {
            setData({
              id: docSnapshot.id,
              ...docSnapshot.data()
            } as T);
          } else {
            setData(null);
          }
          setIsLoading(false);
          setError(null);
        }
      } catch (err) {
        console.error(`Error fetching document ${collectionName}/${documentId}:`, err);
        setError(err as Error);
        setIsLoading(false);
      }
    };
    
    fetchData();
    
    // Cleanup function
    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [collectionName, documentId, options.realtime, isDataRefreshing, ...(options.refreshDeps || [])]);
  
  return { data, isLoading, error };
}

// Helper types for the collections in our app
export interface AccountMetricsData {
  id: string;
  timestamp: number;
  totalBalance: number;
  availableMargin: number;
  dailyPnl: number;
  createdAt?: any;
  updatedAt?: any;
}

export interface BotEventData {
  id: string;
  type: string;
  eventType?: string;
  timestamp: number;
  data?: any;
  createdAt?: any;
}

export interface TradeData {
  id: string;
  timestamp: number; // Document ID
  symbol: string;
  side: 'long' | 'short' | string;
  size: string;  // Stored as string representation of Decimal
  executedPrice?: string | number;
  executedSize?: string;
  leverage: number;
  orderId?: string;
  status: 'open' | 'closed' | string;
  type?: string;
  walletAddress?: string;
  createdAt?: any;
  finalPnl?: number | string;
  entryPrice: string | number;
  exitPrice?: string | number;
  exitTimestamp?: number;
  closedAt?: number;
  openedAt?: number; // When the trade was opened
  pnl: string | number;
  correlatedPair?: {
    symbol: string;
    correlation: number;
    side?: string;
    id?: string;
  } | string;
  // Additional fields
  pairTradeId?: string;
  stopLoss?: number | string;
  takeProfit?: number | string;
  closeReason?: string;
  closeOrderId?: string;
  updatedAt?: any;
}

export interface CorrelationPairData {
  id: string;
  pairA: string;
  pairB: string;
  correlation: number;
  spreadStd: number;
  spreadMean: number;
  halfLife: number;
  cointegrated: boolean;
  regressionCoefficient: number;
  timestamp: number;
}

export interface PriceSnapshotData {
  id: string;
  timestamp: number;
  prices: Record<string, number>;
  source: string;
}

// Specialized hooks for each collection type
export function useAccountMetrics() {
  return useFirestoreDocument<AccountMetricsData>('accountMetrics', 'latest', { realtime: true });
}

export function useAccountMetricsHistory(limitValue: number = 30) {
  const { data, isLoading, error } = useFirestoreCollection<AccountMetricsData>(
    'accountMetrics',
    [
      orderBy('timestamp', 'desc'),
      limit(limitValue)
    ],
    { realtime: true }
  );
  
  return { data, isLoading, error };
}

export function useBotEvents(limitCount: number = 20) {
  return useFirestoreCollection<BotEventData>(
    'botEvents',
    [
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    ],
    { realtime: true }
  );
}

export function useActiveTrades() {
  const { data, isLoading, error } = useFirestoreCollection<TradeData>(
    'trades',
    [orderBy('lastUpdated', 'desc')],
    { realtime: true }
  );
  
  // Filter client-side for active trades
  const activeTrades = data?.filter(trade => {
    const status = trade.status?.toString().toLowerCase() || '';
    return status === 'open' || status === 'active';
  });
  
  return { data: activeTrades, isLoading, error };
}

export function useAllTrades() {
  return useFirestoreCollection<TradeData>(
    'trades',
    [orderBy('lastUpdated', 'desc')],
    { realtime: true }
  );
}

export function useClosedTrades() {
  const { data, isLoading, error } = useFirestoreCollection<TradeData>(
    'trades',
    [orderBy('lastUpdated', 'desc')],
    { realtime: true }
  );
  
  // Filter client-side for closed trades
  const closedTrades = data?.filter(trade => {
    const status = trade.status?.toString().toLowerCase() || '';
    return status === 'closed';
  });
  
  return { data: closedTrades, isLoading, error };
}

export function useCorrelatedPairs(cointegratedOnly: boolean = false) {
  const constraints = cointegratedOnly 
    ? [
        where('cointegrated', '==', true),
        orderBy('correlation', 'desc')
      ]
    : [
        orderBy('correlation', 'desc')
      ];
  
  return useFirestoreCollection<CorrelationPairData>(
    'correlatedPairs',
    constraints,
    { realtime: true }
  );
}

export function usePriceSnapshots(limitValue: number = 5) {
  return useFirestoreCollection<PriceSnapshotData>(
    'priceSnapshots',
    [
      orderBy('timestamp', 'desc'),
      limit(limitValue)
    ],
    { realtime: true }
  );
}