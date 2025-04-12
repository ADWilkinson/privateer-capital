import React, { useState, useMemo } from "react";
import {
  Box,
  Heading,
  Text,
  Card,
  CardHeader,
  CardBody,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Button,
  Icon,
  Flex,
  HStack,
  VStack,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Tooltip,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalCloseButton,
  ModalFooter,
  useDisclosure,
  SimpleGrid,
  Divider,
  Tag,
  TagLabel,
  Code,
} from "@chakra-ui/react";
import {
  RefreshCwIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  InfoIcon,
  DollarSignIcon,
  CalendarIcon,
  TimerIcon,
  LinkIcon,
  ArrowUpRightIcon,
  ArrowDownRightIcon,
  ActivityIcon,
  ScrollTextIcon,
  CoinsIcon,
  ShipIcon,
  AnchorIcon,
  SailboatIcon
} from "lucide-react";
import { useAllTrades, useActiveTrades, useClosedTrades } from "../hooks/useFirestoreData";
import { useDashboard } from "../context/DashboardContext";
import { TradeData } from "../hooks/useFirestoreData";
import { format } from "date-fns";
import { DashboardSkeleton } from "../components/LoadingState";
import { formatNumber, formatCurrency, formatDuration as formatDurationUtil } from "../utils/formatting";

// Calculate profit/loss percentage
const calculatePnlPercentage = (trade: TradeData): number | null => {
  if (!trade.entryPrice || (!trade.finalPnl && !trade.pnl)) return null;
  
  const entryPrice = typeof trade.entryPrice === 'string' ? parseFloat(trade.entryPrice as string) : (trade.entryPrice as number);
  const tradeSize = typeof trade.size === 'string' ? parseFloat(trade.size) : 
                    typeof trade.executedSize === 'string' ? parseFloat(trade.executedSize) : 0;
  const tradeValue = entryPrice * tradeSize;
  
  if (tradeValue === 0) return null;
  
  const finalPnl = trade.finalPnl !== undefined 
    ? (typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl as string) : (trade.finalPnl as number))
    : typeof trade.pnl === 'string' ? parseFloat(trade.pnl as string) : (trade.pnl as number) || 0;
    
  return (finalPnl / tradeValue) * 100;
};

// Format trade duration
const formatTradeDuration = (start: number, end?: number): string => {
  if (!start) return 'Unknown';
  if (!end) return 'Ongoing';
  return formatDurationUtil(end - start);
};

// Helper function to get correlatedPair object regardless of format
const getCorrelatedPair = (trade: TradeData) => {
  if (!trade.correlatedPair) return null;
  
  if (typeof trade.correlatedPair === 'string') {
    try {
      return JSON.parse(trade.correlatedPair as string);
    } catch (e) {
      console.error('Failed to parse correlatedPair string:', e);
      return null;
    }
  }
  
  return trade.correlatedPair;
};

// Trade details modal component
interface TradeDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  trade: TradeData | null;
}

const TradeDetailsModal: React.FC<TradeDetailsModalProps> = ({ isOpen, onClose, trade }) => {
  if (!trade) return null;
  
  const pnlPercentage = calculatePnlPercentage(trade);
  const duration = formatTradeDuration(
    trade.openedAt || trade.timestamp || (trade.createdAt?.toDate ? trade.createdAt.toDate().getTime() : (trade.createdAt ? new Date(trade.createdAt).getTime() : 0)), 
    trade.closedAt || trade.exitTimestamp
  );
  
  // Handle various P&L fields - first try finalPnl then pnl
  const finalPnl = trade.finalPnl !== undefined 
    ? (typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl as string) : trade.finalPnl as number) 
    : trade.pnl !== undefined
      ? (typeof trade.pnl === 'string' ? parseFloat(trade.pnl as string) : trade.pnl as number)
      : 0;
      
  const isProfitable = finalPnl > 0;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <ModalOverlay bg="rgba(12, 35, 64, 0.6)" backdropFilter="blur(4px)" />
      <ModalContent bg="brand.parchment" borderWidth="1px" borderColor="brand.copper">
        <ModalHeader bg="rgba(212, 175, 55, 0.1)" borderBottom="1px solid" borderColor="brand.copper">
          <HStack spacing={3}>
            <Icon as={CoinsIcon} boxSize={5} color="brand.navy" />
            <Text 
              fontWeight="medium" 
              fontSize="sm" 
              color="brand.navy"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Trade Details
            </Text>
          </HStack>
        </ModalHeader>
        <ModalCloseButton color="brand.navy" />
        <ModalBody>
          <SimpleGrid columns={2} spacing={4} mb={4}>
            <Stat>
              <StatLabel fontSize="sm" color="brand.mahogany" fontFamily="heading">Position Type</StatLabel>
              <HStack spacing={1}>
                <StatNumber fontFamily="heading" color="brand.navy">
                  {trade.side ? (trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'LONG' : 'SHORT') : 'UNKNOWN'}
                </StatNumber>
                {trade.side && (
                  <Icon 
                    as={(trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy')) ? ArrowUpRightIcon : ArrowDownRightIcon} 
                    color={(trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy')) ? 'brand.green' : 'brand.red'} 
                    boxSize={4}
                  />
                )}
              </HStack>
              <Text fontSize="sm" color="brand.mahogany" mt={1} fontFamily="body" fontStyle="italic">
                Leverage: {trade.leverage || 1}x
              </Text>
            </Stat>
            
            <Stat>
              <StatLabel fontSize="sm" color="brand.mahogany" fontFamily="heading">Position Size</StatLabel>
              <StatNumber fontFamily="heading" color="brand.navy">
                {formatNumber(typeof trade.size === 'string' ? parseFloat(trade.size) : 
                  typeof trade.executedSize === 'string' ? parseFloat(trade.executedSize) : 0)}
              </StatNumber>
              <Text fontSize="sm" color="brand.mahogany" mt={1} fontFamily="mono">
                @ {formatCurrency(typeof trade.entryPrice === 'number' 
                  ? trade.entryPrice 
                  : typeof trade.entryPrice === 'string' 
                    ? parseFloat(trade.entryPrice) 
                    : typeof trade.executedPrice === 'number'
                      ? trade.executedPrice
                      : typeof trade.executedPrice === 'string'
                        ? parseFloat(trade.executedPrice)
                        : 0)}
              </Text>
            </Stat>
          </SimpleGrid>
          
          <Divider my={4} borderColor="brand.copper" opacity={0.3} />
          
          <SimpleGrid columns={2} spacing={4} mb={4}>
            <Stat>
              <StatLabel fontSize="sm" color="brand.mahogany" fontFamily="heading">Entry Price</StatLabel>
              <StatNumber fontFamily="heading" color="brand.navy">
                {formatCurrency(typeof trade.entryPrice === 'number' 
                  ? trade.entryPrice 
                  : typeof trade.entryPrice === 'string' 
                    ? parseFloat(trade.entryPrice) 
                    : typeof trade.executedPrice === 'number'
                      ? trade.executedPrice
                      : typeof trade.executedPrice === 'string'
                        ? parseFloat(trade.executedPrice)
                        : 0)}
              </StatNumber>
              <Text fontSize="sm" color="brand.mahogany" mt={1} fontFamily="body" fontStyle="italic">
                Open Date: {trade.openedAt ? format(new Date(trade.openedAt), 'MMM d, HH:mm:ss') : 
                  trade.timestamp ? format(new Date(trade.timestamp), 'MMM d, HH:mm:ss') : 
                  trade.createdAt ? format(new Date(trade.createdAt.toDate ? trade.createdAt.toDate() : trade.createdAt), 'MMM d, HH:mm:ss') : 
                  'N/A'}
              </Text>
            </Stat>
            
            <Stat>
              <StatLabel fontSize="sm" color="brand.mahogany" fontFamily="heading">Exit Price</StatLabel>
              <StatNumber fontFamily="heading" color="brand.navy">
                {formatCurrency(typeof trade.exitPrice === 'number' 
                  ? trade.exitPrice 
                  : typeof trade.exitPrice === 'string' 
                    ? parseFloat(trade.exitPrice) 
                    : undefined)}
              </StatNumber>
              <Text fontSize="sm" color="brand.mahogany" mt={1} fontFamily="body" fontStyle="italic">
                Close Date: {trade.exitTimestamp ? format(new Date(trade.exitTimestamp), 'MMM d, HH:mm:ss') : 
                  trade.closedAt ? format(new Date(trade.closedAt), 'MMM d, HH:mm:ss') : 
                  'Still Active'}
              </Text>
            </Stat>
          </SimpleGrid>
          
          <Card 
            mb={4} 
            bg="rgba(212, 175, 55, 0.05)" 
            borderRadius="md" 
            borderWidth="1px" 
            borderColor="brand.copper"
          >
            <CardBody>
              <HStack justify="space-between" align="center">
                <VStack align="start" spacing={1}>
                  <Text fontWeight="medium" color="brand.navy" fontFamily="heading">Trade Profit/Loss</Text>
                  <HStack>
                    <Text 
                      fontSize="2xl" 
                      fontWeight="bold" 
                      color={isProfitable ? 'brand.green' : finalPnl !== 0 ? 'brand.red' : 'brand.mahogany'}
                      fontFamily="heading"
                    >
                      {finalPnl !== 0 || trade.finalPnl !== undefined ? formatCurrency(finalPnl) : 'Still Active'}
                    </Text>
                    {pnlPercentage !== null && (
                      <Badge 
                        bg={isProfitable ? 'brand.green' : 'brand.red'} 
                        color="white"
                        fontSize="sm"
                        fontFamily="heading"
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                      >
                        {isProfitable ? '+' : ''}{pnlPercentage.toFixed(2)}%
                      </Badge>
                    )}
                  </HStack>
                </VStack>
                
                <VStack align="end" spacing={1}>
                  <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Trade Duration</Text>
                  <HStack>
                    <Icon as={TimerIcon} color="brand.copper" size={16} />
                    <Text fontFamily="mono" color="brand.navy">{duration}</Text>
                  </HStack>
                </VStack>
              </HStack>
            </CardBody>
          </Card>
          
          {(() => {
            const correlatedPair = getCorrelatedPair(trade);
            return correlatedPair && (
              <Card 
                borderRadius="md" 
                borderWidth="1px" 
                borderColor="brand.copper"
              >
                <CardHeader py={2} bg="rgba(212, 175, 55, 0.1)" borderBottom="1px solid" borderColor="brand.copper">
                  <Heading size="sm" fontFamily="heading" color="brand.navy">Correlated Pair Information</Heading>
                </CardHeader>
                <CardBody>
                  <SimpleGrid columns={2} spacing={4}>
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Correlated Asset</Text>
                      <Text fontFamily="body">{correlatedPair.symbol}</Text>
                    </Box>
                    
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Correlation Coefficient</Text>
                      <Badge 
                        bg="brand.navy" 
                        color="brand.gold"
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                        fontFamily="heading"
                      >
                        {(correlatedPair.correlation || 0).toFixed(4)}
                      </Badge>
                    </Box>
                    
                    {correlatedPair.side && trade.side && (
                      <Box>
                        <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Pair Position</Text>
                        <Text fontFamily="body">
                          {trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'LONG' : 'SHORT'} {trade.symbol || ''} / {correlatedPair.side.toLowerCase().includes('long') || correlatedPair.side.toLowerCase().includes('buy') ? 'LONG' : 'SHORT'} {correlatedPair.symbol || ''}
                        </Text>
                      </Box>
                    )}
                    
                    {trade.pairTradeId && (
                      <Box>
                        <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Pair Trade ID</Text>
                        <Text fontSize="sm" color="brand.mahogany" fontFamily="mono">{trade.pairTradeId}</Text>
                      </Box>
                    )}
                  
                  {trade.stopLoss && (
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Stop Loss</Text>
                      <Text color="brand.red" fontFamily="mono">${typeof trade.stopLoss === 'string' ? parseFloat(trade.stopLoss).toFixed(2) : trade.stopLoss.toFixed(2)}</Text>
                    </Box>
                  )}
                  
                  {trade.takeProfit && (
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Take Profit</Text>
                      <Text color="brand.green" fontFamily="mono">${typeof trade.takeProfit === 'string' ? parseFloat(trade.takeProfit).toFixed(2) : trade.takeProfit.toFixed(2)}</Text>
                    </Box>
                  )}
                  
                  {trade.closeReason && (
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Close Reason</Text>
                      <Badge 
                        bg={
                          trade.closeReason.includes('profit') ? 'brand.green' : 
                          trade.closeReason.includes('stop') ? 'brand.red' : 
                          'brand.copper'
                        }
                        color="white"
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                        fontFamily="heading"
                      >
                        {trade.closeReason}
                      </Badge>
                    </Box>
                  )}
                  
                  {trade.updatedAt && (
                    <Box>
                      <Text fontWeight="medium" fontFamily="heading" color="brand.navy">Last Updated</Text>
                      <Text fontSize="sm" color="brand.mahogany" fontFamily="body" fontStyle="italic">
                        {typeof trade.updatedAt === 'object' && trade.updatedAt.toDate 
                          ? new Date(trade.updatedAt.toDate()).toLocaleString()
                          : typeof trade.updatedAt === 'number'
                            ? new Date(trade.updatedAt).toLocaleString()
                            : typeof trade.updatedAt === 'string'
                              ? new Date(trade.updatedAt).toLocaleString()
                              : 'Unknown'
                        }
                      </Text>
                    </Box>
                  )}
                </SimpleGrid>
              </CardBody>
            </Card>
          );
          })()}
        </ModalBody>
        <ModalFooter>
          <Button 
            onClick={onClose}
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: "brand.mahogany" }}
            fontFamily="heading"
          >
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const Trades: React.FC = () => {
  // -------------------- HOOKS START --------------------
  // 1. Context hooks first
  const dashboardContext = useDashboard();
  const { refreshData, isDataRefreshing } = dashboardContext;
  
  // 2. useState hooks
  const [selectedTrade, setSelectedTrade] = useState<TradeData | null>(null);
  
  // 3. useDisclosure (which uses hooks internally)
  const disclosureResult = useDisclosure();
  const { isOpen, onOpen, onClose } = disclosureResult;
  
  // 4. Custom hooks - keep in same order
  const allTradesResult = useAllTrades();
  const activeTradesResult = useActiveTrades();
  const closedTradesResult = useClosedTrades();
  
  // Extract values from hook results
  const { data: allTrades, isLoading: allTradesLoading, error: allTradesError } = allTradesResult;
  const { data: activeTrades, isLoading: activeTradesLoading, error: activeTradesError } = activeTradesResult;
  const { data: closedTrades, isLoading: closedTradesLoading, error: closedTradesError } = closedTradesResult;
  // -------------------- HOOKS END --------------------
  
  const handleViewTradeDetails = (trade: TradeData) => {
    setSelectedTrade(trade);
    onOpen();
  };
  
  // Compute trade statistics
  const stats = useMemo(() => {
    // Create a safe default object for stats
    const defaultStats = { 
      totalTrades: 0, 
      winRate: 0, 
      averagePnl: 0, 
      totalPnl: 0,
      pairTrades: 0,
      longTrades: 0,
      shortTrades: 0,
      averageDuration: 0 
    };
    
    // If we have no data, return defaults
    if (!allTrades?.length) {
      return defaultStats;
    }
    
    // Count long/short positions
    let longTradesCount = 0;
    let shortTradesCount = 0;
    
    allTrades.forEach(trade => {
      if (!trade) return;
      
      const sideLower = String(trade.side || '').toLowerCase();
      if (sideLower.includes('long') || sideLower.includes('buy')) {
        longTradesCount++;
      } else if (sideLower.includes('short') || sideLower.includes('sell')) {
        shortTradesCount++;
      }
    });
    
    // Count pair trades
    const pairIds = new Set();
    allTrades.forEach(trade => {
      if (trade.pairTradeId) {
        pairIds.add(trade.pairTradeId);
      }
    });
    
    const pairTradesCount = pairIds.size || Math.ceil(longTradesCount < shortTradesCount ? longTradesCount : shortTradesCount);
    
    // Calculate PnL stats if closed trades exist
    let winRate = 0;
    let totalPnl = 0;
    let averagePnl = 0;
    let averageDuration = 0;
    
    if (closedTrades?.length) {
      // Count winning trades
      const winningTrades = closedTrades.filter(trade => {
        const pnlValue = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : 
                       typeof trade.pnl === 'number' ? trade.pnl : 
                       typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl) : 
                       typeof trade.finalPnl === 'number' ? trade.finalPnl : 0;
        return pnlValue > 0;
      }).length;
      
      winRate = (winningTrades / closedTrades.length) * 100;
      
      // Calculate total PnL
      totalPnl = closedTrades.reduce((sum, trade) => {
        const pnlValue = typeof trade.pnl === 'string' ? parseFloat(trade.pnl) : 
                       typeof trade.pnl === 'number' ? trade.pnl : 
                       typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl) : 
                       typeof trade.finalPnl === 'number' ? trade.finalPnl : 0;
        return sum + pnlValue;
      }, 0);
      
      averagePnl = totalPnl / closedTrades.length;
      
      // Calculate average duration
      const totalDuration = closedTrades.reduce((sum, trade) => {
        const startTime = trade.openedAt || trade.timestamp || 
                          (trade.createdAt?.toDate ? trade.createdAt.toDate().getTime() : 
                          (trade.createdAt ? new Date(trade.createdAt).getTime() : 0));
        const endTime = trade.closedAt || trade.exitTimestamp;
        if (!startTime || !endTime) return sum;
        return sum + (endTime - startTime);
      }, 0);
      
      averageDuration = totalDuration / closedTrades.length / (1000 * 60 * 60); // in hours
    }
    
    return { 
      totalTrades: closedTrades?.length || 0, 
      winRate, 
      averagePnl, 
      totalPnl,
      pairTrades: pairTradesCount,
      longTrades: longTradesCount,
      shortTrades: shortTradesCount,
      averageDuration 
    };
  }, [allTrades, closedTrades, activeTrades]);
  
  if (allTradesLoading || isDataRefreshing) {
    return <DashboardSkeleton />;
  }
  
  // Show error state if any of the data fetching failed
  if ((allTradesError || activeTradesError || closedTradesError) && !allTrades) {
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
            <Icon as={ScrollTextIcon} boxSize={7} color="brand.navy" />
            <Box>
              <Heading 
                size="lg" 
                color="brand.navy" 
                fontFamily="heading"
                letterSpacing="1px"
              >
                Trade Record
              </Heading>
              <Text 
                color="brand.mahogany" 
                fontSize="sm" 
                fontFamily="heading"
                fontStyle="italic"
              >
                Trade History & Position Records
              </Text>
            </Box>
          </HStack>
          <Button
            leftIcon={<RefreshCwIcon size={16} />}
            onClick={refreshData}
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: "brand.mahogany" }}
            size="sm"
            borderRadius="md"
            fontFamily="heading"
            letterSpacing="0.5px"
          >
            Reacquire Data
          </Button>
        </Flex>
        <Card 
          p={4} 
          bg="brand.parchment" 
          borderRadius="md" 
          boxShadow="md"
          borderWidth="1px"
          borderColor="brand.red"
        >
          <Text 
            color="brand.red" 
            fontFamily="heading"
            fontStyle="italic"
          >
            Error loading trade data: {allTradesError?.message || activeTradesError?.message || closedTradesError?.message}
          </Text>
        </Card>
      </Box>
    );
  }
  
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
          <Icon as={ScrollTextIcon} boxSize={7} color="brand.navy" />
          <Box>
            <Heading 
              size="lg" 
              color="brand.navy" 
              fontFamily="heading"
              letterSpacing="1px"
            >
              Trade Record
            </Heading>
            <Text 
              color="brand.mahogany" 
              fontSize="sm"
              fontFamily="heading"
              fontStyle="italic"
            >
              Trade History & Position Records
            </Text>
          </Box>
        </HStack>
        <Button
          leftIcon={<RefreshCwIcon size={16} />}
          onClick={refreshData}
          bg="brand.navy"
          color="brand.gold"
          _hover={{ bg: "brand.mahogany" }}
          size="sm"
          borderRadius="md"
          fontFamily="heading"
          letterSpacing="0.5px"
        >
          Update Data
        </Button>
      </Flex>
    
      
      {/* Trade Tables */}
      <Card 
        borderRadius="md" 
        boxShadow="md" 
        overflow="hidden" 
        bg="brand.parchment" 
        borderWidth="1px" 
        borderColor="brand.copper"
        mb={4}
      >
        <Tabs>
          <TabList px={4} pt={2}>
            <Tab 
              color="brand.navy" 
              fontFamily="heading"
              _selected={{ 
                color: "brand.navy", 
                bg: "rgba(212, 175, 55, 0.15)",
                borderColor: "brand.copper", 
                borderBottom: "none",
                fontWeight: "bold"
              }}
            >
              <Icon as={SailboatIcon} mr={2} />
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Active Trades
              </Text>
            </Tab>
            <Tab 
              color="brand.navy" 
              fontFamily="heading"
              _selected={{ 
                color: "brand.navy", 
                bg: "rgba(212, 175, 55, 0.15)",
                borderColor: "brand.copper", 
                borderBottom: "none",
                fontWeight: "bold"
              }}
            >
              <Icon as={AnchorIcon} mr={2} />
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Completed Trades
              </Text>
            </Tab>
            <Tab 
              color="brand.navy" 
              fontFamily="heading"
              _selected={{ 
                color: "brand.navy", 
                bg: "rgba(212, 175, 55, 0.15)",
                borderColor: "brand.copper", 
                borderBottom: "none",
                fontWeight: "bold"
              }}
            >
              <Icon as={ScrollTextIcon} mr={2} />
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                All Trades
              </Text>
            </Tab>
          </TabList>
          
          <TabPanels>
            {/* Active Trades Tab */}
            <TabPanel p={0}>
              {activeTradesLoading ? (
                <Box p={6} textAlign="center">
                  <Text 
                    color="brand.mahogany" 
                    fontSize="sm"
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    Loading trade data...
                  </Text>
                </Box>
              ) : activeTrades && activeTrades.length > 0 ? (
                <Box overflowX="auto">
                  <Table variant="simple">
                    <Thead bg="rgba(184, 115, 51, 0.05)">
                      <Tr>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Asset
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Position
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Size
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Entry Price
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Open Date
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Correlated Asset
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Action
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {activeTrades.map((trade) => (
                        <Tr key={trade.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                          <Td 
                            fontWeight="medium" 
                            color="brand.navy"
                            fontFamily="body"
                            borderColor="brand.copper"
                          >
                            {trade.symbol || 'Unknown'}
                          </Td>
                          <Td borderColor="brand.copper">
                            <Badge 
                              bg={
                                !trade.side ? 'gray.500' :
                                trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'brand.green' : 'brand.red'
                              }
                              color="white"
                              px={2}
                              py={0.5}
                              borderRadius="sm"
                              fontFamily="heading"
                            >
                              {trade.side ? (trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'LONG' : 'SHORT') : 'UNKNOWN'}
                            </Badge>
                          </Td>
                          <Td 
                            fontFamily="mono"
                            borderColor="brand.copper"
                          >
                            {formatNumber(typeof trade.size === 'string' ? parseFloat(trade.size) : 
                              typeof trade.executedSize === 'string' ? parseFloat(trade.executedSize) : 0)}
                          </Td>
                          <Td 
                            fontFamily="mono"
                            borderColor="brand.copper"
                          >
                            {formatCurrency(typeof trade.entryPrice === 'string' ? parseFloat(trade.entryPrice as string) : 
                              typeof trade.executedPrice === 'string' ? parseFloat(trade.executedPrice as string) : 
                              (trade.entryPrice as number) || (trade.executedPrice as number) || 0)}
                          </Td>
                          <Td 
                            fontFamily="body"
                            borderColor="brand.copper"
                            fontStyle="italic"
                            color="brand.mahogany"
                            fontSize="sm"
                          >
                            {trade.openedAt ? format(new Date(trade.openedAt), 'MMM d, HH:mm') : 
                              trade.timestamp ? format(new Date(trade.timestamp), 'MMM d, HH:mm') : 
                              trade.createdAt ? format(new Date(trade.createdAt.toDate ? trade.createdAt.toDate() : trade.createdAt), 'MMM d, HH:mm') : 
                              'Unknown'}
                          </Td>
                          <Td borderColor="brand.copper">
                            {(() => {
                              const correlatedPair = getCorrelatedPair(trade);
                              return correlatedPair?.symbol ? (
                                <VStack align="start" spacing={1}>
                                  <HStack>
                                    <Text 
                                      fontWeight="medium" 
                                      color="brand.navy"
                                      fontFamily="body"
                                    >
                                      {correlatedPair.symbol}
                                    </Text>
                                    {trade.pairTradeId && (
                                      <Tooltip 
                                        label="Active paired trade"
                                        bg="brand.navy"
                                        color="brand.gold"
                                      >
                                        <Icon as={ActivityIcon} boxSize={3} color="brand.green" />
                                      </Tooltip>
                                    )}
                                  </HStack>
                                  <Tooltip 
                                    label={`Correlation coefficient: ${(correlatedPair.correlation || 0).toFixed(4)}`}
                                    bg="brand.navy"
                                    color="brand.gold"
                                  >
                                    <Tag 
                                      size="sm" 
                                      bg="rgba(12, 35, 64, 0.1)"
                                      color="brand.navy"
                                    >
                                      <Text 
                                        fontSize="xs"
                                        fontFamily="mono"
                                      >
                                        Correlation: {(correlatedPair.correlation || 0).toFixed(2)}
                                      </Text>
                                    </Tag>
                                  </Tooltip>
                                </VStack>
                              ) : (
                                <Text 
                                  color="brand.mahogany"
                                  fontStyle="italic"
                                  fontFamily="heading"
                                  fontSize="sm"
                                >
                                  Solo Trade
                                </Text>
                              );
                            })()}
                          </Td>
                          <Td borderColor="brand.copper">
                            <Button 
                              size="sm" 
                              variant="outline"
                              leftIcon={<InfoIcon size={16} />}
                              onClick={() => handleViewTradeDetails(trade)}
                              borderColor="brand.copper"
                              color="brand.navy"
                              _hover={{
                                bg: "rgba(212, 175, 55, 0.1)"
                              }}
                              fontFamily="heading"
                            >
                              View Details
                            </Button>
                          </Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </Box>
              ) : (
                <Box p={6} textAlign="center">
                  <Icon as={AnchorIcon} boxSize={8} color="brand.copper" opacity={0.5} mb={2} />
                  <Text 
                    color="brand.mahogany" 
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    No active trades
                  </Text>
                </Box>
              )}
            </TabPanel>
            
            {/* Closed Trades Tab */}
            <TabPanel p={0}>
              {closedTradesLoading ? (
                <Box p={6} textAlign="center">
                  <Text 
                    color="brand.mahogany" 
                    fontSize="sm"
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    Retrieving completed trade records...
                  </Text>
                </Box>
              ) : closedTrades && closedTrades.length > 0 ? (
                <Box overflowX="auto">
                  <Table variant="simple">
                    <Thead bg="rgba(184, 115, 51, 0.05)">
                      <Tr>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Asset
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Position
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Entry Price
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Exit Price
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Profit/Loss
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Trade Duration
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Action
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {closedTrades.map((trade) => {
                        const finalPnl = typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl) : (trade.finalPnl || 0);
                        const isProfitable = finalPnl > 0;
                        return (
                          <Tr key={trade.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                            <Td 
                              fontWeight="medium"
                              fontFamily="body"
                              borderColor="brand.copper"
                            >
                              {trade.symbol}
                            </Td>
                            <Td borderColor="brand.copper">
                              <Badge 
                                bg={
                                  !trade.side ? 'gray.500' :
                                  trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'brand.green' : 'brand.red'
                                }
                                color="white"
                                px={2}
                                py={0.5}
                                borderRadius="sm"
                                fontFamily="heading"
                              >
                                {trade.side ? (trade.side.toLowerCase().includes('long') || trade.side.toLowerCase().includes('buy') ? 'LONG' : 'SHORT') : 'UNKNOWN'}
                              </Badge>
                            </Td>
                            <Td 
                              fontFamily="mono"
                              borderColor="brand.copper"
                            >
                              {formatCurrency(
                                typeof trade.entryPrice === 'string' ? parseFloat(trade.entryPrice) : 
                                typeof trade.entryPrice === 'number' ? trade.entryPrice : 
                                typeof trade.executedPrice === 'string' ? parseFloat(trade.executedPrice) : 
                                typeof trade.executedPrice === 'number' ? trade.executedPrice : 0
                              )}
                            </Td>
                            <Td 
                              fontFamily="mono"
                              borderColor="brand.copper"
                            >
                              {formatCurrency(
                                typeof trade.exitPrice === 'string' ? parseFloat(trade.exitPrice) : 
                                typeof trade.exitPrice === 'number' ? trade.exitPrice : null
                              )}
                            </Td>
                            <Td borderColor="brand.copper">
                              <Text 
                                fontWeight="medium" 
                                color={isProfitable ? 'brand.green' : 'brand.red'}
                                fontFamily="heading"
                              >
                                {trade.finalPnl !== undefined ? `${isProfitable ? '+' : ''}${formatCurrency(finalPnl)}` : 'Unknown'}
                                {isProfitable && (
                                  <Icon as={TrendingUpIcon} boxSize={3} ml={1} color="brand.green" />
                                )}
                                {!isProfitable && finalPnl !== 0 && (
                                  <Icon as={TrendingDownIcon} boxSize={3} ml={1} color="brand.red" />
                                )}
                              </Text>
                            </Td>
                            <Td 
                              fontFamily="body"
                              borderColor="brand.copper"
                              fontStyle="italic"
                              color="brand.mahogany"
                              fontSize="sm"
                            >
                              {formatTradeDuration(
                                trade.timestamp || (trade.createdAt?.toDate ? trade.createdAt.toDate().getTime() : (trade.createdAt ? new Date(trade.createdAt).getTime() : 0)), 
                                trade.closedAt || trade.exitTimestamp
                              )}
                            </Td>
                            <Td borderColor="brand.copper">
                              <Button 
                                size="sm" 
                                variant="outline"
                                leftIcon={<InfoIcon size={16} />}
                                onClick={() => handleViewTradeDetails(trade)}
                                borderColor="brand.copper"
                                color="brand.navy"
                                _hover={{
                                  bg: "rgba(212, 175, 55, 0.1)"
                                }}
                                fontFamily="heading"
                              >
                                View Details
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
              ) : (
                <Box p={6} textAlign="center">
                  <Icon as={ScrollTextIcon} boxSize={8} color="brand.copper" opacity={0.5} mb={2} />
                  <Text 
                    color="brand.mahogany" 
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    No completed trades
                  </Text>
                </Box>
              )}
            </TabPanel>
            
            {/* All Trades Tab */}
            <TabPanel p={0}>
              {allTradesLoading ? (
                <Box p={6} textAlign="center">
                  <Text 
                    color="brand.mahogany" 
                    fontSize="sm"
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    Retrieving all trade records...
                  </Text>
                </Box>
              ) : allTrades && allTrades.length > 0 ? (
                <Box overflowX="auto">
                  <Table variant="simple">
                    <Thead bg="rgba(184, 115, 51, 0.05)">
                      <Tr>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Asset
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Position
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Status
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Entry Price
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Open Date
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Profit/Loss
                        </Th>
                        <Th 
                          borderColor="brand.copper" 
                          color="brand.navy"
                          fontFamily="heading"
                        >
                          Action
                        </Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {allTrades.map((trade) => {
                        const finalPnl = typeof trade.finalPnl === 'string' ? parseFloat(trade.finalPnl) : (trade.finalPnl || 0);
                        const isProfitable = finalPnl > 0;
                        return (
                          <Tr key={trade.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                            <Td 
                              fontWeight="medium"
                              fontFamily="body"
                              borderColor="brand.copper"
                            >
                              {trade.symbol || 'Unknown'}
                            </Td>
                            <Td borderColor="brand.copper">
                              <Badge 
                                bg={
                                  !trade.side ? 'gray.500' :
                                  trade.side.toLowerCase() === 'long' || trade.side.toLowerCase() === 'buy' ? 'brand.green' : 'brand.red'
                                }
                                color="white"
                                px={2}
                                py={0.5}
                                borderRadius="sm"
                                fontFamily="heading"
                              >
                                {trade.side ? (trade.side.toLowerCase() === 'long' || trade.side.toLowerCase() === 'buy' ? 'LONG' : 'SHORT') : 'UNKNOWN'}
                              </Badge>
                            </Td>
                            <Td borderColor="brand.copper">
                              <Badge 
                                bg={
                                  !trade.status ? 'gray.500' :
                                  trade.status.toLowerCase() === 'open' ? 'brand.navy' : 'brand.copper'
                                }
                                color={trade.status?.toLowerCase() === 'open' ? 'brand.gold' : 'white'}
                                px={2}
                                py={0.5}
                                borderRadius="sm"
                                fontFamily="heading"
                              >
                                {trade.status ? (trade.status.toLowerCase() === 'open' ? 'ACTIVE' : 'CLOSED') : 'UNKNOWN'}
                              </Badge>
                            </Td>
                            <Td 
                              fontFamily="mono"
                              borderColor="brand.copper"
                            >
                              {formatCurrency(
                                typeof trade.entryPrice === 'string' ? parseFloat(trade.entryPrice) : 
                                typeof trade.entryPrice === 'number' ? trade.entryPrice : 
                                typeof trade.executedPrice === 'string' ? parseFloat(trade.executedPrice) : 
                                typeof trade.executedPrice === 'number' ? trade.executedPrice : 0
                              )}
                            </Td>
                            <Td 
                              fontFamily="body"
                              borderColor="brand.copper"
                              fontStyle="italic"
                              color="brand.mahogany"
                              fontSize="sm"
                            >
                              {trade.openedAt ? format(new Date(trade.openedAt), 'MMM d, HH:mm') : 
                                trade.timestamp ? format(new Date(trade.timestamp), 'MMM d, HH:mm') : 
                                trade.createdAt ? format(new Date(trade.createdAt.toDate ? trade.createdAt.toDate() : trade.createdAt), 'MMM d, HH:mm') : 
                                'Unknown'}
                            </Td>
                            <Td borderColor="brand.copper">
                              {(trade.finalPnl !== undefined || trade.pnl !== undefined) ? (
                                <Text 
                                  fontWeight="medium" 
                                  color={isProfitable ? 'brand.green' : finalPnl !== 0 ? 'brand.red' : 'brand.mahogany'}
                                  fontFamily="heading"
                                >
                                  {`${isProfitable ? '+' : ''}${formatCurrency(finalPnl)}`}
                                  {isProfitable && (
                                    <Icon as={TrendingUpIcon} boxSize={3} ml={1} color="brand.green" />
                                  )}
                                  {!isProfitable && finalPnl !== 0 && (
                                    <Icon as={TrendingDownIcon} boxSize={3} ml={1} color="brand.red" />
                                  )}
                                </Text>
                              ) : (
                                <Text 
                                  color="brand.mahogany"
                                  fontStyle="italic"
                                  fontFamily="heading"
                                  fontSize="sm"
                                >
                                  Still Active
                                </Text>
                              )}
                            </Td>
                            <Td borderColor="brand.copper">
                              <Button 
                                size="sm" 
                                variant="outline"
                                leftIcon={<InfoIcon size={16} />}
                                onClick={() => handleViewTradeDetails(trade)}
                                borderColor="brand.copper"
                                color="brand.navy"
                                _hover={{
                                  bg: "rgba(212, 175, 55, 0.1)"
                                }}
                                fontFamily="heading"
                              >
                                View Details
                              </Button>
                            </Td>
                          </Tr>
                        );
                      })}
                    </Tbody>
                  </Table>
                </Box>
              ) : (
                <Box p={6} textAlign="center">
                  <Icon as={ScrollTextIcon} boxSize={8} color="brand.copper" opacity={0.5} mb={2} />
                  <Text 
                    color="brand.mahogany" 
                    fontFamily="heading"
                    fontStyle="italic"
                  >
                    No trades recorded
                  </Text>
                </Box>
              )}
            </TabPanel>
          </TabPanels>
        </Tabs>
      </Card>
      
      <Flex justify="center" mb={4}>
        <Text 
          fontSize="xs" 
          color="brand.mahogany"
          fontFamily="heading"
          fontStyle="italic"
          textAlign="center"
        >
          "In trading, timing is everything."
        </Text>
      </Flex>
      
      {/* Trade Details Modal */}
      <TradeDetailsModal isOpen={isOpen} onClose={onClose} trade={selectedTrade} />
    </Box>
  );
};

export default Trades;