import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ChakraProvider, ColorModeScript } from '@chakra-ui/react';
import { QueryClient, QueryClientProvider } from 'react-query';

import { theme } from './theme';
import { DashboardProvider } from './context/DashboardContext';
import ErrorBoundary from './components/ErrorBoundary';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Correlations from './pages/Correlations';
import Settings from './pages/Settings';
import Logs from './pages/Logs';
import Trades from './pages/Trades';

// Configure React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10000, // Consider data stale after 10 seconds
      cacheTime: 60000, // Keep unused data in cache for 1 minute
      refetchOnWindowFocus: true,
      refetchOnMount: true,
      refetchOnReconnect: true,
      retry: 3,
      retryDelay: attempt => Math.min(attempt > 1 ? 2 ** attempt * 1000 : 1000, 30 * 1000),
    },
  },
});

function App() {
  return (
    <>
      <ColorModeScript initialColorMode={theme.config.initialColorMode} />
      <ChakraProvider theme={theme}>
        <QueryClientProvider client={queryClient}>
          <DashboardProvider>
            <ErrorBoundary>
              <Router>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/correlations" element={<Correlations />} />
                    <Route path="/trades" element={<Trades />} />
                    <Route path="/logs" element={<Logs />} />
                    <Route path="/settings" element={<Settings />} />
                  </Routes>
                </Layout>
              </Router>
            </ErrorBoundary>
          </DashboardProvider>
        </QueryClientProvider>
      </ChakraProvider>
    </>
  );
}

export default App;