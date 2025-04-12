import { useQueryWithRefresh } from './useQueryWithRefresh';
import { fetchBotEvents } from '../services/api';
import { useDashboard } from '../context/DashboardContext';

export function useBotEvents(limit = 200) {
  const { preferences } = useDashboard();
  const { refreshInterval } = preferences;
  
  return useQueryWithRefresh(['botEvents', limit], () => fetchBotEvents(limit), {
    refetchInterval: refreshInterval,
    onError: (error) => {
      console.error('Error fetching bot events:', error);
    }
  });
}