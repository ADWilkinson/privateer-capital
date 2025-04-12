import { useQueryWithRefresh } from './useQueryWithRefresh';
import { fetchTrades, Trade } from '../services/api';
import { useDashboard } from '../context/DashboardContext';
import { useCallback } from 'react';

interface TradeFilters {
  status?: string;
}

export function useTrades(filters?: TradeFilters) {
  const { preferences } = useDashboard();
  const { refreshInterval } = preferences;
  
  const fetchTradesWithFilters = useCallback(() => {
    // Use the proper api service instead of direct fetch
    return fetchTrades(filters).then(data => {
      // Normalize statuses to ensure consistent display
      return data.map(trade => ({
        ...trade,
        status: (trade.status || 'unknown').toLowerCase()
      }));
    });
  }, [filters]);
  
  return useQueryWithRefresh(
    ['trades', filters?.status || 'all'], 
    fetchTradesWithFilters, 
    {
      refetchInterval: refreshInterval,
      onError: (error) => {
        console.error('Error fetching trades:', error);
      },
      staleTime: 15000, // Consider data stale after 15 seconds (reduced for testing)
      retry: 5, // Increased retries for testing
      refetchOnWindowFocus: true,
      refetchOnMount: true
    }
  );
}

export function useTradesByStatus(status: string) {
  return useTrades({ status });
}

export function useAllTrades() {
  return useTrades();
}

export function useActiveTrades() {
  return useTradesByStatus('open');
}

export function useClosedTrades() {
  return useTradesByStatus('closed');
}