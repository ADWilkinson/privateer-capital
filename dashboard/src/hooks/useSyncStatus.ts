import { useQuery } from 'react-query';
import axios from 'axios';

// Get the base URL without the /api suffix
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8080";

// Get the sync status between exchange positions and database records
export function useSyncStatus() {
  return useQuery(
    'syncStatus',
    async () => {
      try {
        // Use the API router endpoint only
        const apiUrl = `${BASE_URL}/api/sync-status`;
        console.log('Checking sync status:', apiUrl);
        
        const response = await axios.get(apiUrl);
        console.log('Sync status response:', response.data);
        return response.data;
      } catch (error) {
        console.error('Error fetching sync status:', error);
        return {
          status: 'error',
          message: 'Could not fetch sync status',
          timestamp: Date.now(),
          lastSynced: null,
          isInSync: false,
          syncActions: 0
        };
      }
    },
    {
      refetchInterval: 30000, // Refresh every 30 seconds for more responsive updates
      retry: 3,
      staleTime: 15000,
      onError: (error) => console.error('Sync status query error:', error)
    }
  );
}