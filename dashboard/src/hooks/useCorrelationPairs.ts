import { useQueryWithRefresh } from './useQueryWithRefresh';
import { fetchCorrelationPairs } from '../services/api';
import { useDashboard } from '../context/DashboardContext';

export function useCorrelationPairs() {
  const { preferences } = useDashboard();
  const { refreshInterval } = preferences;
  
  return useQueryWithRefresh('correlationPairs', fetchCorrelationPairs, {
    refetchInterval: refreshInterval,
    onError: (error) => {
      console.error('Error fetching correlation pairs:', error);
    }
  });
}