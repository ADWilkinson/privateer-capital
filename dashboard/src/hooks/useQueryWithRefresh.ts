import { useQuery, UseQueryOptions, UseQueryResult } from 'react-query';

/**
 * Enhanced useQuery hook that supports manual refreshing without losing cached data
 * Gracefully handles errors and loading states
 */
export function useQueryWithRefresh<TData, TError = unknown>(
  queryKey: string | readonly unknown[],
  queryFn: () => Promise<TData>,
  options?: Omit<UseQueryOptions<TData, TError>, 'queryKey' | 'queryFn'>
): UseQueryResult<TData, TError> & { refresh: () => void } {
  const queryResult = useQuery<TData, TError>(queryKey, queryFn, {
    staleTime: 60000, // 1 minute
    refetchOnWindowFocus: false,
    ...options,
  });

  const refresh = () => {
    queryResult.refetch();
  };

  return { ...queryResult, refresh };
}