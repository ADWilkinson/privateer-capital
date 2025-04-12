import React, { useMemo, useState } from "react";
import {
  Box,
  SimpleGrid,
  Heading,
  Text,
  Card,
  CardHeader,
  CardBody,
  HStack,
  Flex,
  Button,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Select,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Icon,
  Divider,
  Skeleton,
  SkeletonCircle,
  SkeletonText,
  VStack
} from "@chakra-ui/react";
import { 
  RefreshCwIcon, 
  AnchorIcon, 
  CompassIcon, 
  MapIcon, 
  CoinsIcon,
  LineChartIcon,
  TrendingUpIcon, 
  TrendingDownIcon,
  ShipIcon
} from "lucide-react";

// Hooks
import { useDashboard } from "../context/DashboardContext";
import { useAccountMetrics, useActiveTrades, useAccountMetricsHistory } from "../hooks/useFirestoreData";

// Components
import PnLChart from "../components/PnLChart";
import SyncStatusIndicator from "../components/SyncStatusIndicator";
import AccountSummaryCard from "../components/cards/AccountSummaryCard";
import PerformanceMetricsCard from "../components/cards/PerformanceMetricsCard";
import ActivePositionsCard from "../components/cards/ActivePositionsCard";

// Utils
import { formatTimestamp } from "../utils/formatting";

// Fixed order of hooks Dashboard function component
const Dashboard: React.FC = () => {
  // -------------------- HOOKS START --------------------
  // 1. Context hooks first
  const dashboardContext = useDashboard();
  const { preferences, refreshData, isDataRefreshing } = dashboardContext;
  
  // 2. useState hooks - keep all together in the same order
  const [timeFrame, setTimeFrame] = useState("7d");
  const [lastRefreshTime, setLastRefreshTime] = useState(new Date());
  
  // 3. Custom hooks - keep in same order
  const accountMetricsResult = useAccountMetrics();
  const activeTradesResult = useActiveTrades();
  const metricsHistoryResult = useAccountMetricsHistory(30);
  
  // Extract values from hook results
  const { data: accountMetrics, isLoading: isAccountLoading, error: accountError } = accountMetricsResult;
  const { data: activeTrades, isLoading: isTradesLoading, error: tradesError } = activeTradesResult;
  const { data: metricsHistory, isLoading: isHistoryLoading } = metricsHistoryResult;
  
  // Process metrics history for PnL chart - IMPORTANT: Keep this hook before any early returns
  const pnlHistory = useMemo(() => {
    if (!metricsHistory || metricsHistory.length === 0) return [];
    
    // Sort by timestamp to ensure chronological order
    const sortedHistory = [...metricsHistory].sort((a, b) => a.timestamp - b.timestamp);
    
    // Get initial balance to use as the baseline
    const initialBalance = sortedHistory[0].totalBalance;
    
    // Map to PnL data points relative to the starting balance
    return sortedHistory.map(metric => ({
      date: formatTimestamp(metric.timestamp, { dateOnly: true }),
      value: metric.totalBalance - initialBalance, // PnL relative to starting balance
      actualValue: metric.totalBalance // Keep the actual balance for tooltips
    }));
  }, [metricsHistory]) || [];
  // -------------------- HOOKS END --------------------
  
  // Loading state - All hooks must be called before this early return
  if (isAccountLoading || isTradesLoading || isHistoryLoading || isDataRefreshing) {
    return (
      <Box p={{ base: 3, md: 6 }}>
        <Flex 
          justify="space-between" 
          align="center" 
          mb={6}
          borderBottom="1px solid" 
          borderColor="brand.copper" 
          pb={4}
        >
          <HStack spacing={3}>
            <Icon as={AnchorIcon} boxSize={7} color="brand.navy" opacity={0.7} />
            <Skeleton 
              height="28px" 
              width="160px"
              startColor="rgba(184, 115, 51, 0.2)"
              endColor="rgba(12, 35, 64, 0.1)"
            />
          </HStack>
          <Skeleton 
            height="32px" 
            width="120px" 
            borderRadius="md"
            startColor="rgba(184, 115, 51, 0.2)"
            endColor="rgba(12, 35, 64, 0.1)"
          />
        </Flex>
        
        <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5} mb={6}>
          {[1, 2, 3].map(i => (
            <Card 
              key={i} 
              borderRadius="md" 
              boxShadow="md" 
              height="100%" 
              bg="brand.parchment" 
              borderColor="brand.copper" 
              borderWidth="1px"
            >
              <CardHeader 
                py={3}
                borderBottom="1px solid"
                borderColor="brand.copper"
                bg="rgba(212, 175, 55, 0.1)"
              >
                <HStack>
                  <SkeletonCircle 
                    size="8"
                    startColor="rgba(184, 115, 51, 0.2)"
                    endColor="rgba(12, 35, 64, 0.1)"
                  />
                  <Skeleton 
                    height="16px" 
                    width="100px"
                    startColor="rgba(184, 115, 51, 0.2)"
                    endColor="rgba(12, 35, 64, 0.1)"
                  />
                </HStack>
              </CardHeader>
              <CardBody pt={4}>
                <VStack spacing={4} align="stretch">
                  <Skeleton 
                    height="36px"
                    startColor="rgba(184, 115, 51, 0.2)"
                    endColor="rgba(12, 35, 64, 0.1)"
                  />
                  <SkeletonText 
                    mt="2" 
                    noOfLines={3} 
                    spacing="3"
                    startColor="rgba(184, 115, 51, 0.2)"
                    endColor="rgba(12, 35, 64, 0.1)"
                  />
                </VStack>
              </CardBody>
            </Card>
          ))}
        </SimpleGrid>
        
        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment" 
          borderColor="brand.copper" 
          borderWidth="1px" 
          mb={4}
        >
          <CardHeader 
            py={3}
            borderBottom="1px solid"
            borderColor="brand.copper"
            bg="rgba(212, 175, 55, 0.1)"
          >
            <Skeleton 
              height="20px" 
              width="150px"
              startColor="rgba(184, 115, 51, 0.2)"
              endColor="rgba(12, 35, 64, 0.1)"
            />
          </CardHeader>
          <CardBody p={4}>
            <Skeleton 
              height="200px"
              startColor="rgba(184, 115, 51, 0.2)"
              endColor="rgba(12, 35, 64, 0.1)"
            />
          </CardBody>
        </Card>
        
        <Flex justify="center">
          <Text 
            fontSize="xs" 
            color="brand.mahogany"
            fontFamily="heading"
            fontStyle="italic"
            textAlign="center"
          >
            Loading data...
          </Text>
        </Flex>
      </Box>
    );
  }

  // Error state - just show what data we do have and error notes where we don't
  const hasErrors = accountError || tradesError;
  
  // Calculate performance metrics
  const performance = {
    // Calculate total PnL over the available metrics history
    totalPnl: metricsHistory?.length > 1 
      ? (accountMetrics?.totalBalance || 0) - (metricsHistory[metricsHistory.length - 1]?.totalBalance || 0)
      : undefined,
    dailyPnl: accountMetrics?.dailyPnl
  };
  
  const handleRefresh = () => {
    refreshData();
    setLastRefreshTime(new Date());
  };

  return (
    <Box p={{ base: 3, md: 6 }}>
      {/* Main Header */}
      <Box mb={6} borderBottom="1px solid" borderColor="brand.copper" pb={4}>
        <Flex justify="space-between" align="center" wrap={{ base: "wrap", md: "nowrap" }} gap={3}>
          <HStack spacing={3}>
            <Icon as={ShipIcon} boxSize={7} color="brand.navy" />
            <Box>
              <Heading size="lg" color="brand.navy" fontFamily="heading" letterSpacing="1px">
                Voyage Dashboard
              </Heading>
              <Text color="brand.mahogany" fontSize="sm" fontFamily="heading" fontStyle="italic">
                Asset Trading & Performance Charts
              </Text>
            </Box>
          </HStack>

          <HStack spacing={3}>
            <SyncStatusIndicator variant="button" size="sm" />
            <Box
              p={1.5}
              borderRadius="md"
              bg="brand.parchment"
              border="1px solid"
              borderColor="brand.copper"
              boxShadow="0 1px 3px rgba(0,0,0,0.1)"
            >
              <Select
                size="sm"
                width="110px"
                value={timeFrame}
                onChange={(e) => setTimeFrame(e.target.value)}
                bg="brand.parchment"
                borderColor="brand.copper"
                color="brand.navy"
                fontSize="sm"
                fontFamily="heading"
                _hover={{ borderColor: "brand.gold" }}
                icon={<Icon as={CompassIcon} color="brand.copper" />}
              >
                <option value="1d">1 Day</option>
                <option value="7d">7 Days</option>
                <option value="30d">30 Days</option>
                <option value="all">All Time</option>
              </Select>
            </Box>
            <Button
              leftIcon={<RefreshCwIcon size={16} />}
              onClick={handleRefresh}
              bg="brand.navy"
              color="brand.gold"
              _hover={{ bg: "brand.mahogany" }}
              size="sm"
              borderRadius="md"
              isLoading={isDataRefreshing}
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Update Charts
            </Button>
          </HStack>
        </Flex>
      </Box>

      {/* Performance Metrics */}
      <SimpleGrid columns={{ base: 1, md: 3 }} spacing={5} mb={8}>
        <AccountSummaryCard accountMetrics={accountMetrics} isLoading={isAccountLoading} error={accountError} />

        <PerformanceMetricsCard performance={performance} isLoading={isHistoryLoading} error={accountError} />

        <ActivePositionsCard activeTrades={activeTrades || []} isLoading={isTradesLoading} error={tradesError} />
      </SimpleGrid>

      <Tabs variant="enclosed" mb={6} borderColor="brand.copper" colorScheme="blue">
        <TabList>
          <Tab
            fontFamily="heading"
            color="brand.navy"
            _selected={{
              color: "brand.navy",
              bg: "rgba(212, 175, 55, 0.15)",
              borderColor: "brand.copper",
              borderBottom: "none",
              fontWeight: "bold",
            }}
          >
            <Icon as={LineChartIcon} mr={2} />
            Trading Performance
          </Tab>
          <Tab
            fontFamily="heading"
            color="brand.navy"
            _selected={{
              color: "brand.navy",
              bg: "rgba(212, 175, 55, 0.15)",
              borderColor: "brand.copper",
              borderBottom: "none",
              fontWeight: "bold",
            }}
          >
            <Icon as={ShipIcon} mr={2} />
            Activity Log
          </Tab>
        </TabList>

        <TabPanels>
          {/* Performance Panel */}
          <TabPanel p={0} pt={4}>
            <Card
              borderRadius="md"
              boxShadow="md"
              overflow="hidden"
              mb={4}
              bg="brand.parchment"
              borderColor="brand.copper"
              borderWidth="1px"
            >
              <CardHeader bg="rgba(212, 175, 55, 0.1)" py={4} borderBottom="1px solid" borderColor="brand.copper">
                <Flex justify="space-between" align="center">
                  <HStack spacing={2}>
                    <Icon as={TrendingUpIcon} color="brand.navy" />
                    <Heading size="sm" color="brand.navy" fontFamily="heading" letterSpacing="0.5px">
                      Profit & Loss Chart
                    </Heading>
                  </HStack>
                  <Text fontSize="xs" color="brand.mahogany" fontFamily="heading" fontStyle="italic">
                    Last updated: {lastRefreshTime.toLocaleString()}
                  </Text>
                </Flex>
              </CardHeader>
              <CardBody p={4}>
                <PnLChart data={pnlHistory} />
              </CardBody>
            </Card>
          </TabPanel>

          {/* Recent Activity Panel */}
          <TabPanel p={0} pt={4}>
            <Card
              borderRadius="md"
              boxShadow="md"
              overflow="hidden"
              bg="brand.parchment"
              borderColor="brand.copper"
              borderWidth="1px"
            >
              <CardHeader bg="rgba(212, 175, 55, 0.1)" py={4} borderBottom="1px solid" borderColor="brand.copper">
                <Flex justify="space-between" align="center">
                  <HStack spacing={2}>
                    <Icon as={CoinsIcon} color="brand.navy" />
                    <Heading size="sm" color="brand.navy" fontFamily="heading" letterSpacing="0.5px">
                      Recent Trading Activity
                    </Heading>
                  </HStack>
                  <Text fontSize="xs" color="brand.mahogany" fontFamily="heading" fontStyle="italic">
                    Last 24 hours
                  </Text>
                </Flex>
              </CardHeader>
              <CardBody p={0}>
                {activeTrades && activeTrades.length > 0 ? (
                  <Table variant="simple" size="sm">
                    <Thead bg="rgba(184, 115, 51, 0.05)">
                      <Tr>
                        <Th borderColor="brand.copper" color="brand.navy" fontFamily="heading">
                          Timestamp
                        </Th>
                        <Th borderColor="brand.copper" color="brand.navy" fontFamily="heading">
                          Type
                        </Th>
                        <Th borderColor="brand.copper" color="brand.navy" fontFamily="heading">
                          Asset
                        </Th>
                        <Th isNumeric borderColor="brand.copper" color="brand.navy" fontFamily="heading">
                          Size
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {activeTrades.slice(0, 5).map((trade) => (
                        <Tr key={trade.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                          <Td borderColor="brand.copper" fontFamily="body">
                            {formatTimestamp(trade.updatedAt?.toDate())}
                          </Td>
                          <Td borderColor="brand.copper">
                            <HStack>
                              <Icon
                                as={trade.side.toLowerCase().includes("long") ? TrendingUpIcon : TrendingDownIcon}
                                color={trade.side.toLowerCase().includes("long") ? "brand.green" : "brand.red"}
                                boxSize="14px"
                              />
                              <Text
                                fontWeight="medium"
                                color={trade.side.toLowerCase().includes("long") ? "brand.green" : "brand.red"}
                                fontFamily="heading"
                              >
                                {trade.side.toLowerCase().includes("long") ? "Long" : "Short"}
                              </Text>
                            </HStack>
                          </Td>
                          <Td borderColor="brand.copper" fontFamily="body" fontWeight="medium">
                            {trade.symbol}
                          </Td>
                          <Td isNumeric borderColor="brand.copper" fontFamily="mono">
                            {trade.size || trade.executedSize}
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                ) : (
                  <Box p={6} textAlign="center">
                    <Text fontSize="xs" color="brand.mahogany" fontFamily="heading" fontStyle="italic">
                      No trading activity recorded in this period
                    </Text>
                  </Box>
                )}
              </CardBody>
            </Card>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <Divider borderColor="brand.copper" opacity={0.3} mb={4} />
      <Flex justify="center" mb={4}>
        <Text 
          fontSize="xs" 
          color="brand.mahogany"
          fontFamily="heading"
          fontStyle="italic"
          textAlign="center"
        >
          Last Updated: {lastRefreshTime.toLocaleString().split(',')[0]}
        </Text>
      </Flex>
  
    </Box>
  );
};

export default Dashboard;