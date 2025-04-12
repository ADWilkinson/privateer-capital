import React from "react";
import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  HStack,
  Progress,
  Stat,
  StatArrow,
  StatGroup,
  StatHelpText,
  StatLabel,
  StatNumber,
  Text,
  Tooltip,
  VStack,
  Icon,
  Divider,
} from "@chakra-ui/react";
import { 
  InfoIcon, 
  TrendingUpIcon, 
  TrendingDownIcon, 
  CoinsIcon, 
  Coins 
} from "lucide-react";
import { formatCurrency, formatPercent } from "../../utils/formatting";

interface PerformanceData {
  totalPnl?: number;
  dailyPnl?: number;
  lastUpdated?: string;
}

interface PerformanceMetricsCardProps {
  performance: PerformanceData;
  isLoading?: boolean;
  error?: Error | null;
}

export const PerformanceMetricsCard: React.FC<PerformanceMetricsCardProps> = ({
  performance,
  isLoading = false,
  error = null,
}) => {
  // Format the data
  const totalPnl = formatCurrency(performance?.totalPnl);
  const dailyPnl = formatCurrency(performance?.dailyPnl);

  // Loading state
  if (isLoading) {
    return (
      <Card 
        borderRadius="md" 
        boxShadow="md" 
        height="100%"
        bg="brand.parchment"
        borderWidth="1px"
        borderColor="brand.copper"
      >
        <CardHeader 
          bg="rgba(212, 175, 55, 0.1)" 
          py={3}
          borderBottom="1px solid"
          borderColor="brand.copper"
        >
          <Flex justify="space-between" align="center">
            <HStack spacing={2}>
              <Box 
                p={2} 
                borderRadius="md" 
                bg="rgba(12, 35, 64, 0.1)"
              >
                <Icon as={CoinsIcon} boxSize={5} color="brand.navy" />
              </Box>
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Performance Metrics
              </Text>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody pt={4} display="flex" alignItems="center" justifyContent="center">
          <Text 
            color="brand.mahogany" 
            fontSize="sm"
            fontFamily="heading"
            fontStyle="italic"
            textAlign="center"
          >
            Loading performance data...
          </Text>
        </CardBody>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card 
        borderRadius="md" 
        boxShadow="md" 
        height="100%"
        bg="brand.parchment"
        borderWidth="1px"
        borderColor="brand.red"
      >
        <CardHeader 
          bg="rgba(125, 32, 39, 0.1)" 
          py={3}
          borderBottom="1px solid"
          borderColor="brand.red"
        >
          <Flex justify="space-between" align="center">
            <HStack spacing={2}>
              <Box p={2} borderRadius="md" bg="rgba(125, 32, 39, 0.1)">
                <Icon as={CoinsIcon} boxSize={5} color="brand.red" />
              </Box>
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
              >
                Performance Metrics
              </Text>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody pt={4}>
          <Text 
            color="brand.red" 
            fontFamily="heading"
            fontStyle="italic"
            textAlign="center"
          >
            Error loading performance data: {error.message}
          </Text>
        </CardBody>
      </Card>
    );
  }

  // Determine color based on performance
  const pnlColor = performance?.totalPnl && performance.totalPnl > 0 
    ? "brand.green" : "brand.red";
  
  const pnlIcon = performance?.totalPnl && performance.totalPnl > 0 
    ? TrendingUpIcon : TrendingDownIcon;

  return (
    <Card 
      borderRadius="md" 
      boxShadow="md" 
      height="100%" 
      bg="brand.parchment" 
      borderColor="brand.copper" 
      borderWidth="1px"
    >
      <CardHeader 
        bg="rgba(212, 175, 55, 0.1)" 
        py={3}
        borderBottom="1px solid"
        borderColor="brand.copper"
      >
        <Flex justify="space-between" align="center">
          <HStack spacing={2}>
            <Box 
              p={2} 
              borderRadius="md" 
              bg="rgba(12, 35, 64, 0.1)"
            >
              <Icon as={CoinsIcon} boxSize={5} color="brand.navy" />
            </Box>
            <Text 
              fontWeight="medium" 
              fontSize="sm" 
              color="brand.navy"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Performance Metrics
            </Text>
          </HStack>
          <Tooltip 
            label="Your accumulated profit/loss from all trades" 
            bg="brand.navy" 
            color="brand.gold"
          >
            <Box>
              <InfoIcon color="brand.copper" size={16} />
            </Box>
          </Tooltip>
        </Flex>
      </CardHeader>
      <CardBody pt={4}>
        <VStack spacing={4} align="center">
          <Flex
            direction="column"
            align="center"
            justify="center"
            p={4}
            rounded="md"
            bg="rgba(212, 175, 55, 0.05)"
            width="full"
            border="1px dashed"
            borderColor="brand.copper"
          >
            <Icon 
              as={pnlIcon} 
              color={pnlColor} 
              boxSize={10} 
              mb={2}
            />
            <Stat textAlign="center">
              <StatLabel 
                fontSize="sm" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Total P&L
              </StatLabel>
              <StatNumber 
                fontSize="3xl" 
                color={pnlColor}
                fontFamily="heading"
                letterSpacing="1px"
              >
                {performance?.totalPnl && performance.totalPnl > 0 ? "+" : ""}
                {totalPnl}
              </StatNumber>
              <StatHelpText 
                fontSize="sm"
                fontFamily="body"
                fontStyle="italic"
                color="brand.mahogany"
              >
                <HStack spacing={1} justify="center">
                  <Icon 
                    as={performance?.totalPnl && performance.totalPnl >= 0 ? TrendingUpIcon : TrendingDownIcon} 
                    boxSize="12px" 
                  />
                  <Text>
                    All-time performance
                  </Text>
                </HStack>
              </StatHelpText>
            </Stat>
          </Flex>
          
          <Divider borderColor="brand.copper" opacity={0.3} />
          
          <Flex 
            justify="center" 
            align="center" 
            direction="column"
            width="full"
          >
            <Text 
              fontSize="xs" 
              color="brand.mahogany"
              fontFamily="heading"
              fontStyle="italic"
              textAlign="center"
            >
              Last Updated: {performance.lastUpdated?.split(',')[0]}
            </Text>
            <Text 
              fontSize="xs" 
              color="brand.mahogany" 
              fontFamily="heading"
              fontWeight="bold"
              textAlign="center"
            >
    
            </Text>
          </Flex>
        </VStack>
      </CardBody>
    </Card>
  );
};

export default PerformanceMetricsCard;