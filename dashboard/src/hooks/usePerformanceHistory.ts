import { useQueryWithRefresh } from './useQueryWithRefresh';
import { fetchPerformanceHistory } from '../services/api';
import { useDashboard } from '../context/DashboardContext';

export function usePerformanceHistory(days = 30) {
  const { preferences } = useDashboard();
  const { refreshInterval } = preferences;
  
  return useQueryWithRefresh(['performanceHistory', days], () => fetchPerformanceHistory(days), {
    refetchInterval: refreshInterval,
    onError: (error) => {
      console.error('Error fetching performance history:', error);
    }
  });
}