import React, { useState } from 'react';
import {
  Box,
  Heading,
  Card,
  CardHeader,
  CardBody,
  Text,
  Button,
  VStack,
  HStack,
  useToast,
  Divider,
  Badge,
  Spinner,
  Alert,
  AlertIcon,
  Icon,
  Flex,
  Skeleton,
  SimpleGrid
} from '@chakra-ui/react';
import { 
  PlayIcon, 
  AlertTriangleIcon, 
  AnchorIcon, 
  SettingsIcon, 
  ShieldIcon, 
  InfoIcon, 
  RefreshCwIcon,
  CompassIcon,
  LifeBuoyIcon,
  DatabaseIcon,
  CogIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AnchorIcon as AnchorIconSolid,
  Ship as ShipIcon,
  Wind as WindIcon
} from 'lucide-react';
import { useQuery, useMutation } from 'react-query';
import { fetchDashboardData, checkBotHealth, triggerSyncPositions } from '../services/api';
import { useSyncStatus } from '../hooks/useSyncStatus';

interface DashboardData {
  performance?: {
    totalPnl?: number;
    winRate?: number;
    profitableTrades?: number;
    totalTrades?: number;
    pnlHistory?: Array<{date: string, value: number}>;
  };
  botEvents?: any[];
  riskMetrics?: {
    totalBalance?: number;
    availableMargin?: number;
    maxOpenPositions?: 4; 
    currentRiskPercent?: number;
    maxRiskPercent?: 0.2; 
    positionSizePercent?: 0.2; 
  };
  positionSizePercent?: number;
  walletAddress?: string;
  timestamp?: number;
}

interface HealthData {
  status?: string;
  timestamp?: number;
  assetCount?: number;
  balance?: number;
  environment?: string;
  walletAddress?: string;
}

interface HealthStatus {
  status: string;
  timestamp: number;
  assetCount: number;
  balance: number;
  environment: string;
  walletAddress: string;
}

const Settings: React.FC = () => {
  const toast = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Fetch dashboard data
  const { 
    data: dashboardData, 
    isLoading: isDataLoading, 
    error: dataError, 
    refetch: refetchData 
  } = useQuery<DashboardData>(
    'dashboardData',
    fetchDashboardData,
    { 
      refetchInterval: 60000,
      retry: 2,
      onError: (err) => {
        toast({
          title: 'Error loading data',
          description: 'Could not load dashboard data. Please try again later.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    }
  );

  // Fetch bot health status
  const {
    data: healthData,
    isLoading: isHealthLoading,
    error: healthError,
    refetch: refetchHealth
  } = useQuery<HealthData>(
    'botHealth',
    checkBotHealth,
    { 
      refetchInterval: 60000,
      retry: 2,
      onError: (err) => {
        toast({
          title: 'Error checking bot health',
          description: 'Could not check bot health status. Please try again later.',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      }
    }
  );
  
  // Fetch sync status
  const { 
    data: syncStatus, 
    isLoading: isSyncStatusLoading, 
    refetch: refetchSyncStatus 
  } = useSyncStatus();
  
  // Define mutation for syncing positions
  const syncMutation = useMutation(triggerSyncPositions, {
    onMutate: () => {
      setIsSyncing(true);
    },
    onSuccess: (data) => {
      setIsSyncing(false);
      toast({
        title: 'Positions synchronized',
        description: `Successfully synchronized positions. ${data.syncActions || 0} updates made.`,
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
      // Refetch sync status
      refetchSyncStatus();
    },
    onError: (error) => {
      setIsSyncing(false);
      toast({
        title: 'Sync failed',
        description: 'Failed to synchronize positions. Please try again.',
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  });

  const getHealthStatus = (): HealthStatus => {
    if (!healthData && !dashboardData) return {
      status: 'unknown',
      timestamp: Date.now(),
      assetCount: 0,
      balance: 0,
      environment: 'unknown',
      walletAddress: ''
    };
    
    const riskMetrics = dashboardData?.riskMetrics || {};
    
    return {
      status: healthData?.status || 'healthy',
      timestamp: healthData?.timestamp || Date.now(),
      assetCount: healthData?.assetCount || 0,
      balance: healthData?.balance || (riskMetrics.totalBalance ?? 0),
      environment: healthData?.environment || 'production',
      walletAddress: healthData?.walletAddress || (dashboardData?.walletAddress ?? '')
    };
  };

  const handleRefresh = () => {
    refetchData();
    refetchHealth();
    refetchSyncStatus();
  };
  
  const handleSyncPositions = () => {
    syncMutation.mutate();
  };

  if (isDataLoading || isHealthLoading) {
    return (
      <Box p={8}>
        <Flex justify="space-between" align="center" mb={6}>
          <HStack spacing={3}>
            <Icon as={AnchorIcon} boxSize={6} color="brand.gold" />
            <Heading size="lg">Ship's Ledger</Heading>
          </HStack>
          <Button
            leftIcon={<WindIcon size={16} />}
            onClick={handleRefresh}
            variant="primary"
            size="sm"
            borderRadius="2px"
          >
            Refresh Charts
          </Button>
        </Flex>
        <Skeleton height="40px" mb={4} startColor="brand.parchment" endColor="brand.copper" opacity={0.3} />
        <Skeleton height="40px" mb={4} startColor="brand.parchment" endColor="brand.copper" opacity={0.3} />
        <Skeleton height="40px" mb={4} startColor="brand.parchment" endColor="brand.copper" opacity={0.3} />
        <Text fontFamily="heading" fontStyle="italic" textAlign="center" color="brand.copper" mt={8}>
        
        </Text>
      </Box>
    );
  }

  if (dataError || healthError) {
    return (
      <Box p={8}>
        <Flex justify="space-between" align="center" mb={6}>
          <HStack spacing={3}>
            <Icon as={AnchorIcon} boxSize={6} color="brand.gold" />
            <Heading size="lg">Ship's Ledger</Heading>
          </HStack>
          <Button
            leftIcon={<WindIcon size={16} />}
            onClick={handleRefresh}
            variant="primary"
            size="sm"
            borderRadius="2px"
          >
            Retry
          </Button>
        </Flex>
        <Card borderWidth="1px" borderColor="brand.red" bg="brand.parchment" boxShadow="0 2px 4px rgba(0,0,0,0.15)">
          <CardBody>
            <Flex align="center">
              <Icon as={AlertTriangleIcon} color="brand.red" mr={3} />
              <Text color="brand.red" fontFamily="heading">The ship's logs are currently unreadable. The ink may have been damaged by seawater.</Text>
            </Flex>
          </CardBody>
        </Card>
      </Box>
    );
  }

  const health = getHealthStatus();

  if (!health) {
    return (
      <Box p={8}>
        <Flex justify="space-between" align="center" mb={6}>
          <HStack spacing={3}>
            <Icon as={AnchorIcon} boxSize={6} color="brand.gold" />
            <Heading size="lg">Ship's Ledger</Heading>
          </HStack>
          <Button
            leftIcon={<WindIcon size={16} />}
            onClick={handleRefresh}
            variant="primary"
            size="sm"
            borderRadius="2px"
          >
            Retry
          </Button>
        </Flex>
        <Card borderWidth="1px" borderColor="brand.red" bg="brand.parchment" boxShadow="0 2px 4px rgba(0,0,0,0.15)">
          <CardBody>
            <Flex align="center">
              <Icon as={AlertTriangleIcon} color="brand.red" mr={3} />
              <Text color="brand.red" fontFamily="heading">The Captain's logbook is missing. The ship's boy was last seen with it.</Text>
            </Flex>
          </CardBody>
        </Card>
      </Box>
    );
  }

  return (
    <Box p={8}>
      <Flex justify="space-between" align="center" mb={6}>
        <HStack spacing={3}>
          <Icon as={AnchorIcon} boxSize={6} color="brand.gold" />
          <Heading size="lg">Ship's Ledger</Heading>
        </HStack>
        <Button
          leftIcon={<WindIcon size={16} />}
          onClick={handleRefresh}
          variant="primary"
          size="sm"
          borderRadius="2px"
          _hover={{ bg: 'brand.mahogany' }}
        >
          Refresh Charts
        </Button>
      </Flex>

      {/* Fleet Status (formerly Bot Status) */}
      <Card mb={6} bg="brand.parchment" borderWidth="1px" borderColor="brand.copper" boxShadow="0 2px 4px rgba(0,0,0,0.15)">
        <CardBody>
          <Flex justify="space-between" align="center" mb={4}>
            <HStack spacing={2}>
              <Icon as={ShipIcon} boxSize={5} color="brand.navy" />
              <Heading size="md" fontFamily="heading">Fleet Status</Heading>
            </HStack>
            <Badge 
              bg={health.status === 'healthy' ? 'brand.green' : 'brand.red'} 
              color="white"
              px={2}
              py={1}
              borderRadius="2px"
              fontSize="xs"
              fontFamily="heading"
            >
              {health.status === 'healthy' ? 'Seaworthy' : 'In Distress'}
            </Badge>
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4}>
            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Environment</Text>
              <Text fontSize="lg" fontWeight="medium" color="brand.navy">{health.environment === 'production' ? 'Production' : 'Development'}</Text>
            </Card>

            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Last Updated</Text>
              <Text fontSize="lg" fontWeight="medium" color="brand.navy">
                {new Date(health.timestamp).toLocaleString()}
              </Text>
            </Card>

            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Monitored Assets</Text>
              <Text fontSize="lg" fontWeight="medium" color="brand.navy">{health.assetCount}</Text>
            </Card>

            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Account Balance</Text>
              <Text fontSize="lg" fontWeight="medium" color="brand.navy">${health.balance.toFixed(2)}</Text>
            </Card>
          </SimpleGrid>
        </CardBody>
      </Card>

      {/* Chart Alignment (formerly Sync Status) */}
      <Card mb={6} bg="brand.parchment" borderWidth="1px" borderColor="brand.copper" boxShadow="0 2px 4px rgba(0,0,0,0.15)">
        <CardBody>
          <Flex justify="space-between" align="center" mb={4}>
            <HStack spacing={2}>
              <Icon as={CompassIcon} boxSize={5} color="brand.navy" />
              <Heading size="md" fontFamily="heading">Chart Alignment</Heading>
            </HStack>
            {syncStatus && !isSyncStatusLoading && (
              <Badge 
                bg={syncStatus.isInSync ? 'brand.green' : 'brand.red'} 
                color="white"
                px={2}
                py={1}
                borderRadius="2px"
                fontSize="xs"
                fontFamily="heading"
              >
                {syncStatus.isInSync ? 'In Sync' : 'Out of Sync'}
              </Badge>
            )}
          </Flex>

          <SimpleGrid columns={{ base: 1, md: 2 }} spacing={4} mb={4}>
            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Sync Status</Text>
              {isSyncStatusLoading ? (
                <Spinner size="sm" color="brand.navy" />
              ) : syncStatus ? (
                <Flex align="center">
                  <Icon 
                    as={syncStatus.isInSync ? CompassIcon : AlertCircleIcon} 
                    color={syncStatus.isInSync ? 'brand.green' : 'brand.red'} 
                    mr={2}
                  />
                  <Text fontSize="md" fontWeight="medium" color="brand.navy">
                    {syncStatus.isInSync 
                      ? 'Database and exchange positions are synchronized' 
                      : 'Synchronization issues detected'}
                  </Text>
                </Flex>
              ) : (
                <Text fontSize="md" color="brand.mahogany">Unable to fetch sync status</Text>
              )}
            </Card>

            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Last Synchronized</Text>
              {isSyncStatusLoading ? (
                <Spinner size="sm" color="brand.navy" />
              ) : syncStatus && syncStatus.lastSynced ? (
                <Text fontSize="md" fontWeight="medium" color="brand.navy">
                  {new Date(syncStatus.lastSynced).toLocaleString()}
                </Text>
              ) : (
                <Text fontSize="md" color="brand.mahogany">Never</Text>
              )}
            </Card>
          </SimpleGrid>

          <Button
            leftIcon={<AnchorIconSolid size={16} />}
            variant="primary"
            size="md"
            onClick={handleSyncPositions}
            isLoading={isSyncing}
            loadingText="Synchronizing..."
            width="100%"
            borderRadius="2px"
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: 'brand.mahogany' }}
          >
            Manually Synchronize Positions
          </Button>
          
          {syncStatus && syncStatus.syncActions > 0 && (
            <Alert status="info" mt={4} borderRadius="2px" bg="rgba(212, 175, 55, 0.1)" borderWidth="1px" borderColor="brand.copper">
              <AlertIcon color="brand.navy" />
              <Text fontSize="sm" fontFamily="body" color="brand.navy">
                Last sync made {syncStatus.syncActions} position updates
              </Text>
            </Alert>
          )}
        </CardBody>
      </Card>

      {/* Wallet Information */}
      {/* {health.walletAddress && (
        <Card bg="brand.parchment" borderWidth="1px" borderColor="brand.copper" boxShadow="0 2px 4px rgba(0,0,0,0.15)">
          <CardBody>
            <Flex justify="space-between" align="center" mb={4}>
              <HStack spacing={2}>
                <Icon as={LifeBuoyIcon} boxSize={5} color="brand.navy" />
                <Heading size="md" fontFamily="heading">Wallet Information</Heading>
              </HStack>
            </Flex>

            <Card borderRadius="2px" bg="rgba(245, 240, 225, 0.7)" p={4} borderWidth="1px" borderColor="brand.copper">
              <Text fontSize="sm" color="brand.mahogany" mb={1} fontFamily="heading">Wallet Address</Text>
              <Text fontSize="sm" fontWeight="medium" color="brand.navy" fontFamily="mono" noOfLines={2} p={2} bg="rgba(13, 35, 64, 0.05)" borderRadius="2px">
                {health.walletAddress}
              </Text>
            </Card>
            
            <Text 
              fontSize="xs" 
              color="brand.mahogany" 
              mt={4} 
              fontStyle="italic" 
              textAlign="center"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Secure Access
            </Text>
          </CardBody>
        </Card>
      )} */}
    </Box>
  );
};

export default Settings;