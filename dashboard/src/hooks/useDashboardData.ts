import { useQueryWithRefresh } from './useQueryWithRefresh';
import { fetchDashboardData, DashboardData } from '../services/api';
import { useDashboard } from '../context/DashboardContext';
import { UseQueryResult } from 'react-query';

export function useDashboardData(): UseQueryResult<DashboardData, Error> & { refresh: () => void } {
  const { preferences } = useDashboard();
  const { refreshInterval } = preferences;
  
  return useQueryWithRefresh<DashboardData, Error>('dashboardData', fetchDashboardData, {
    refetchInterval: refreshInterval,
    onError: (error) => {
      console.error('Error fetching dashboard data:', error);
    }
  });
}