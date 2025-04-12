import React, { useState, useMemo } from "react";
import { useCorrelationPairs } from "../hooks/useCorrelationPairs";
import {
  Box,
  Flex,
  Heading,
  Text,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Badge,
  Icon,
  Button,
  HStack,
  Card,
  CardBody,
  CardHeader,
  Input,
  InputGroup,
  InputLeftElement,
  Tabs,
  TabList,
  Tab,
  TabPanels,
  TabPanel,
  Tooltip,
  Tag,
  TagLabel,
  Select,
  SimpleGrid,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  Progress,
  Checkbox,
  Divider,
  Alert,
  AlertIcon,
  VStack,
} from "@chakra-ui/react";
import { 
  MapIcon, 
  RefreshCwIcon, 
  SearchIcon,
  AlertCircleIcon,
  FilterIcon,
  TrendingUpIcon,
  ZapIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  BarChartIcon,
  CompassIcon,
  AnchorIcon,
  ShipIcon,
  SailboatIcon,
  CoinsIcon
} from "lucide-react";
import { CorrelationPair } from "../services/api";
import LoadingState from "../components/LoadingState";

interface ExtendedCorrelationPair extends CorrelationPair {
  zScore?: number | null;
  tradeStatus?: 'opportunity' | 'monitoring' | 'unsuitable';
  regressionInfo?: string | null;
  lastUpdatedFormatted?: string;
}

const Correlations: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showCointegratedOnly, setShowCointegratedOnly] = useState(true);
  const [sortField, setSortField] = useState<string>("correlation");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  const {
    data: correlationPairs,
    isLoading,
    error,
    refetch
  } = useCorrelationPairs();

  // Process pairs to add additional derived data
  const processedPairs = useMemo(() => {
    if (!correlationPairs) return [];
    
    return correlationPairs.map(pair => {
      // Calculate Z-Score if missing but we have mean and std
      const zScore = pair.spreadZScore !== null ? pair.spreadZScore : 
                    (pair.spreadMean && pair.spreadStd ? pair.spreadMean / pair.spreadStd : null);
      
      let tradeStatus: 'opportunity' | 'monitoring' | 'unsuitable' = 'unsuitable';
      
      // Trading status criteria - must meet ALL conditions:
      // 1. Cointegrated
      // 2. Correlation >= 0.95
      // 3. Z-Score > 2 or < -2 for trading opportunity
      if (pair.cointegrated && pair.correlation >= 0.95) {
        if (zScore && Math.abs(zScore) > 2) {
          tradeStatus = 'opportunity';
        } else {
          tradeStatus = 'monitoring';
        }
      }
      
      // Add regression info for displaying relationship
      const regressionInfo = pair.regressionCoefficient 
        ? `${pair.pairA} = ${pair.regressionCoefficient.toFixed(4)} × ${pair.pairB}`
        : null;
      
      // Format last updated timestamp
      const lastUpdatedFormatted = pair.updatedAt?.toDate ? 
        new Date(pair.updatedAt.toDate()).toLocaleString() : 
        pair.timestamp ? new Date(pair.timestamp).toLocaleString() : 'Unknown';
      
      return {
        ...pair,
        zScore,
        tradeStatus,
        regressionInfo,
        lastUpdatedFormatted
      };
    });
  }, [correlationPairs]);

  // Filter and sort pairs
  const filteredPairs = useMemo(() => {
    if (!processedPairs) return [];
    
    let result = [...processedPairs];
    
    // Apply cointegration filter
    if (showCointegratedOnly) {
      result = result.filter(pair => pair.cointegrated);
    }
    
    // Apply status filter
    if (statusFilter !== "all") {
      result = result.filter(pair => pair.tradeStatus === statusFilter);
    }
    
    // Apply search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        pair => 
          pair.pairA.toLowerCase().includes(term) || 
          pair.pairB.toLowerCase().includes(term)
      );
    }
    
    // Apply sorting
    result.sort((a, b) => {
      let aValue: any = a[sortField as keyof ExtendedCorrelationPair];
      let bValue: any = b[sortField as keyof ExtendedCorrelationPair];
      
      // Handle null values
      if (aValue === null) aValue = sortDirection === "asc" ? Infinity : -Infinity;
      if (bValue === null) bValue = sortDirection === "asc" ? Infinity : -Infinity;
      
      // For boolean values
      if (typeof aValue === "boolean") {
        aValue = aValue ? 1 : 0;
        bValue = bValue ? 1 : 0;
      }
      
      if (sortDirection === "asc") {
        return aValue - bValue;
      } else {
        return bValue - aValue;
      }
    });
    
    return result;
  }, [processedPairs, showCointegratedOnly, statusFilter, searchTerm, sortField, sortDirection]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!correlationPairs) return { total: 0, cointegrated: 0, opportunities: 0 };
    
    const cointegrated = correlationPairs.filter(pair => pair.cointegrated).length;
    const opportunities = processedPairs.filter(pair => pair.tradeStatus === 'opportunity').length;
    
    return {
      total: correlationPairs.length,
      cointegrated,
      opportunities,
      cointegratedPercent: correlationPairs.length > 0 
        ? (cointegrated / correlationPairs.length) * 100 
        : 0
    };
  }, [correlationPairs, processedPairs]);

  // Handle column header click for sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("desc");
    }
  };

  if (isLoading) {
    return <LoadingState text="Charting the trading routes..." />;
  }

  if (error) {
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
            <Icon as={CompassIcon} boxSize={7} color="brand.navy" />
            <Box>
              <Heading 
                size="lg" 
                color="brand.navy" 
                fontFamily="heading"
                letterSpacing="1px"
              >
                Navigator's Charts
              </Heading>
              <Text 
                color="brand.mahogany" 
                fontSize="sm" 
                fontFamily="heading"
                fontStyle="italic"
              >
                Vessel Pairing Routes
              </Text>
            </Box>
          </HStack>
          <Button
            leftIcon={<RefreshCwIcon size={16} />}
            onClick={() => refetch()}
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: "brand.mahogany" }}
            size="sm"
            borderRadius="md"
            fontFamily="heading"
          >
            Rechart Routes
          </Button>
        </Flex>
        <Alert 
          status="error" 
          borderRadius="md"
          bg="rgba(125, 32, 39, 0.1)" 
          color="brand.red"
          borderWidth="1px"
          borderColor="brand.red"
        >
          <AlertIcon color="brand.red" />
          <Text fontFamily="heading" fontStyle="italic">Error loading correlation data</Text>
        </Alert>
      </Box>
    );
  }

  if (!correlationPairs || correlationPairs.length === 0) {
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
            <Icon as={CompassIcon} boxSize={7} color="brand.navy" />
            <Box>
              <Heading 
                size="lg" 
                color="brand.navy" 
                fontFamily="heading"
                letterSpacing="1px"
              >
                Navigator's Charts
              </Heading>
              <Text 
                color="brand.mahogany" 
                fontSize="sm" 
                fontFamily="heading"
                fontStyle="italic"
              >
                Vessel Pairing Routes
              </Text>
            </Box>
          </HStack>
          <Button
            leftIcon={<RefreshCwIcon size={16} />}
            onClick={() => refetch()}
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: "brand.mahogany" }}
            size="sm"
            borderRadius="md"
            fontFamily="heading"
          >
            Rechart Routes
          </Button>
        </Flex>
        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <VStack spacing={3} py={6}>
              <Icon as={MapIcon} boxSize={12} color="brand.copper" opacity={0.6} />
              <Text 
                color="brand.mahogany" 
                fontFamily="heading"
                fontStyle="italic"
                textAlign="center"
              >
                No correlations have been calculated yet. Analysis may still be in progress.
              </Text>
            </VStack>
          </CardBody>
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
          <Icon as={CompassIcon} boxSize={7} color="brand.navy" />
          <Box>
            <Heading 
              size="lg" 
              color="brand.navy" 
              fontFamily="heading"
              letterSpacing="1px"
            >
              Correlation Analysis
            </Heading>
            <Text 
              color="brand.mahogany" 
              fontSize="sm" 
              fontFamily="heading"
              fontStyle="italic"
            >
              Correlation Mapping & Trading Opportunities
            </Text>
          </Box>
        </HStack>
        <Button
          leftIcon={<RefreshCwIcon size={16} />}
          onClick={() => refetch()}
          bg="brand.navy"
          color="brand.gold"
          _hover={{ bg: "brand.mahogany" }}
          size="sm"
          borderRadius="md"
          fontFamily="heading"
          letterSpacing="0.5px"
        >
          Redraw Charts
        </Button>
      </Flex>

      {/* Stats Overview */}
      <SimpleGrid columns={{ base: 1, md: 4 }} spacing={5} mb={6}>
        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <Stat>
              <StatLabel 
                color="brand.mahogany" 
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Total Analyzed Pairs
              </StatLabel>
              <StatNumber 
                fontSize="2xl" 
                fontFamily="heading"
                color="brand.navy"
              >
                {stats.total}
              </StatNumber>
              <StatHelpText
                color="brand.mahogany"
                fontFamily="body"
                fontStyle="italic"
                fontSize="xs"
              >
                All analyzed asset pairs
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <Stat>
              <StatLabel 
                color="brand.mahogany" 
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Cointegrated Pairs
              </StatLabel>
              <StatNumber 
                fontSize="2xl" 
                fontFamily="heading"
                color="brand.navy"
              >
                {stats.cointegrated}
              </StatNumber>
              <HStack mt={1} align="center">
                <Progress 
                  value={stats.cointegratedPercent} 
                  size="xs" 
                  width="80px" 
                  bg="rgba(12, 35, 64, 0.1)"
                  colorScheme="green" 
                />
                <Text 
                  fontSize="xs" 
                  color="brand.mahogany"
                  fontFamily="body"
                >
                  {stats.cointegratedPercent?.toFixed(1) || '0.0'}%
                </Text>
              </HStack>
            </Stat>
          </CardBody>
        </Card>

        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <Stat>
              <StatLabel 
                color="brand.mahogany" 
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Trading Opportunities
              </StatLabel>
              <StatNumber 
                fontSize="2xl" 
                fontFamily="heading"
                color="brand.navy"
              >
                {stats.opportunities}
              </StatNumber>
              <StatHelpText>
                <HStack>
                  <Icon as={SailboatIcon} color="brand.green" boxSize={3} />
                  <Text 
                    fontSize="xs" 
                    color="brand.mahogany"
                    fontFamily="body"
                    fontStyle="italic"
                  >
                    Ready to trade
                  </Text>
                </HStack>
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>

        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <Stat>
              <StatLabel 
                color="brand.mahogany" 
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Correlation Strength
              </StatLabel>
              <StatNumber 
                fontSize="2xl" 
                fontFamily="heading"
                color="brand.navy"
              >
                {correlationPairs.length > 0 
                  ? (correlationPairs.reduce((sum, pair) => sum + pair.correlation, 0) / correlationPairs.length).toFixed(2)
                  : 'N/A'
                }
              </StatNumber>
              <StatHelpText
                color="brand.mahogany"
                fontFamily="body"
                fontStyle="italic"
                fontSize="xs"
              >
                Mean correlation values
              </StatHelpText>
            </Stat>
          </CardBody>
        </Card>
      </SimpleGrid>

      {/* Filters */}
      <Card 
        borderRadius="md" 
        boxShadow="md" 
        bg="brand.parchment"
        borderColor="brand.copper"
        borderWidth="1px"
        mb={6}
      >
        <CardHeader 
          bg="rgba(212, 175, 55, 0.1)" 
          py={3}
          borderBottom="1px solid"
          borderColor="brand.copper"
        >
          <Flex justify="space-between" align="center">
            <HStack>
              <Icon as={FilterIcon} color="brand.navy" />
              <Heading 
                size="sm"
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Correlation Filters
              </Heading>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody>
          <SimpleGrid columns={{ base: 1, md: 3 }} spacing={4}>
            <InputGroup size="md">
              <InputLeftElement pointerEvents="none">
                <Icon as={SearchIcon} color="brand.copper" />
              </InputLeftElement>
              <Input
                placeholder="Search asset pairs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                borderColor="brand.copper"
                bg="rgba(255,255,255,0.4)"
                _hover={{ borderColor: "brand.gold" }}
                color="brand.navy"
                fontFamily="body"
              />
            </InputGroup>

            <Select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              size="md"
              borderColor="brand.copper"
              bg="rgba(255,255,255,0.4)"
              _hover={{ borderColor: "brand.gold" }}
              color="brand.navy"
              fontFamily="heading"
              icon={<Icon as={CompassIcon} color="brand.copper" />}
            >
              <option value="all">All Pairs</option>
              <option value="opportunity">Trading Opportunities</option>
              <option value="monitoring">Monitoring</option>
              <option value="unsuitable">Unsuitable</option>
            </Select>

            <Checkbox 
              isChecked={showCointegratedOnly} 
              onChange={(e) => setShowCointegratedOnly(e.target.checked)}
              colorScheme="green"
              borderColor="brand.copper"
              color="brand.navy"
              fontFamily="heading"
            >
              Show Cointegrated Pairs Only
            </Checkbox>
          </SimpleGrid>
        </CardBody>
      </Card>

      {/* Pairs Table */}
      <Card 
        borderRadius="md" 
        boxShadow="md" 
        bg="brand.parchment"
        borderColor="brand.copper"
        borderWidth="1px"
      >
        <CardBody p={0}>
          <Table variant="simple">
            <Thead bg="rgba(184, 115, 51, 0.05)">
              <Tr>
                <Th 
                  onClick={() => handleSort("pairA")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Asset A</Text>
                    {sortField === "pairA" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("pairB")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Asset B</Text>
                    {sortField === "pairB" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("correlation")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Correlation</Text>
                    {sortField === "correlation" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("cointegrated")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Cointegrated</Text>
                    {sortField === "cointegrated" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("zScore")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Z-Score</Text>
                    {sortField === "zScore" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("halfLife")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Half-Life</Text>
                    {sortField === "halfLife" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
                <Th 
                  onClick={() => handleSort("tradeStatus")}
                  cursor="pointer"
                  borderColor="brand.copper"
                  color="brand.navy"
                  fontFamily="heading"
                >
                  <HStack>
                    <Text>Status</Text>
                    {sortField === "tradeStatus" && (
                      <Icon as={sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon} boxSize={3} />
                    )}
                  </HStack>
                </Th>
              </Tr>
            </Thead>
            <Tbody>
              {filteredPairs.map((pair) => (
                <Tr key={pair.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                  <Td 
                    fontWeight="medium"
                    borderColor="brand.copper"
                    fontFamily="body"
                  >
                    {pair.pairA}
                  </Td>
                  <Td 
                    fontWeight="medium"
                    borderColor="brand.copper"
                    fontFamily="body"
                  >
                    {pair.pairB}
                  </Td>
                  <Td borderColor="brand.copper">
                    <Tooltip 
                      label={`Chart accuracy: ${pair.correlation.toFixed(4)}`}
                      bg="brand.navy"
                      color="brand.gold"
                    >
                      <Badge 
                        bg={pair.correlation > 0.8 ? "brand.green" : pair.correlation > 0.6 ? "brand.copper" : "brand.red"}
                        color="white"
                        fontFamily="heading"
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                      >
                        {pair.correlation.toFixed(2)}
                      </Badge>
                    </Tooltip>
                    {pair.regressionInfo && (
                      <Tooltip 
                        label="Course bearing calculations"
                        bg="brand.navy"
                        color="brand.gold"
                      >
                        <Text 
                          fontSize="xs" 
                          color="brand.mahogany" 
                          mt={1}
                          fontFamily="mono"
                        >
                          {pair.regressionInfo}
                        </Text>
                      </Tooltip>
                    )}
                  </Td>
                  <Td borderColor="brand.copper">
                    <Badge 
                      bg={pair.cointegrated ? "brand.green" : "brand.red"}
                      color="white"
                      fontFamily="heading"
                      px={2}
                      py={0.5}
                      borderRadius="sm"
                    >
                      {pair.cointegrated ? "Confirmed" : "Rejected"}
                    </Badge>
                    {pair.pValue !== null && pair.pValue !== undefined && (
                      <Tooltip 
                        label={`Statistical significance: ${pair.pValue.toFixed(4)}`}
                        bg="brand.navy"
                        color="brand.gold"
                      >
                        <Text 
                          fontSize="xs" 
                          color="brand.mahogany" 
                          mt={1}
                          fontFamily="mono"
                        >
                          p-value: {pair.pValue !== undefined && pair.pValue < 0.001 ? "<0.001" : pair.pValue?.toFixed(3)}
                        </Text>
                      </Tooltip>
                    )}
                  </Td>
                  <Td borderColor="brand.copper">
                    {pair.zScore !== null ? (
                      <HStack>
                        <Badge
                          bg={
                            Math.abs(pair.zScore) > 2 ? "brand.red" : 
                            Math.abs(pair.zScore) > 1 ? "brand.copper" : "brand.green"
                          }
                          color="white"
                          fontFamily="heading"
                          px={2}
                          py={0.5}
                          borderRadius="sm"
                        >
                          {pair.zScore.toFixed(2)}
                        </Badge>
                        {Math.abs(pair.zScore) > 2 && (
                          <Tooltip 
                            label="Good trading opportunity"
                            bg="brand.navy"
                            color="brand.gold"
                          >
                            <Icon as={SailboatIcon} color="brand.green" boxSize={4} />
                          </Tooltip>
                        )}
                      </HStack>
                    ) : (
                      <Text 
                        color="brand.mahogany" 
                        fontStyle="italic"
                        fontFamily="heading"
                        fontSize="sm"
                      >
                        Not calculated
                      </Text>
                    )}
                    <HStack mt={1} spacing={1}>
                      <Text fontSize="xs" color="brand.mahogany" fontFamily="body">Mean:</Text>
                      <Text fontSize="xs" color="brand.navy" fontFamily="mono" fontWeight="medium">{pair.spreadMean?.toFixed(2) || "—"}</Text>
                      <Text fontSize="xs" color="brand.copper">|</Text>
                      <Text fontSize="xs" color="brand.mahogany" fontFamily="body">Var:</Text>
                      <Text fontSize="xs" color="brand.navy" fontFamily="mono" fontWeight="medium">{pair.spreadStd?.toFixed(2) || "—"}</Text>
                    </HStack>
                    <Text 
                      fontSize="xs" 
                      color="brand.mahogany" 
                      mt={1}
                      fontFamily="body"
                      fontStyle="italic"
                    >
                      Last updated: {pair.lastUpdatedFormatted}
                    </Text>
                  </Td>
                  <Td borderColor="brand.copper">
                    {pair.halfLife !== null ? (
                      <Tooltip 
                        label={`Mean reversion estimated in ${Math.round(pair.halfLife)} periods`}
                        bg="brand.navy"
                        color="brand.gold"
                      >
                        <Tag 
                          size="md" 
                          bg={pair.halfLife < 30 ? "brand.green" : pair.halfLife < 70 ? "brand.copper" : "brand.red"}
                          color="white"
                          fontFamily="heading"
                        >
                          <TagLabel>{Math.round(pair.halfLife)} periods</TagLabel>
                        </Tag>
                      </Tooltip>
                    ) : (
                      <Text 
                        color="brand.mahogany" 
                        fontStyle="italic"
                        fontFamily="heading"
                        fontSize="sm"
                      >
                        Unknown
                      </Text>
                    )}
                  </Td>
                  <Td borderColor="brand.copper">
                    <Badge
                      fontFamily="heading"
                      px={2}
                      py={0.5}
                      borderRadius="sm"
                      bg={
                        pair.tradeStatus === "opportunity" ? "brand.green" :
                        pair.tradeStatus === "monitoring" ? "brand.navy" : "gray.500"
                      }
                      color={
                        pair.tradeStatus === "opportunity" ? "white" :
                        pair.tradeStatus === "monitoring" ? "brand.gold" : "white"
                      }
                    >
                      {pair.tradeStatus === "opportunity" ? "Trade Ready" :
                       pair.tradeStatus === "monitoring" ? "Monitoring" : "Unsuitable"}
                    </Badge>
                    {pair.tradeStatus === "opportunity" && (
                      <HStack mt={1}>
                        <Icon as={CoinsIcon} color="brand.gold" boxSize={3} />
                        <Text 
                          fontSize="xs" 
                          color="brand.green"
                          fontFamily="heading"
                          fontStyle="italic"
                        >
                          Trading opportunity
                        </Text>
                      </HStack>
                    )}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>
      
      <Flex justify="center" mb={4} mt={6}>
        <Text 
          fontSize="xs" 
          color="brand.mahogany"
          fontFamily="heading"
          fontStyle="italic"
          textAlign="center"
        >
Markets yield their opportunities to those who can read their patterns.
        </Text>
      </Flex>
    </Box>
  );
};

export default Correlations;