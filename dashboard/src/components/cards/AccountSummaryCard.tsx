import React from 'react';
import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  HStack,
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
  Spinner,
} from '@chakra-ui/react';
import { InfoIcon, CoinsIcon, TrendingUpIcon, BriefcaseIcon } from 'lucide-react';
import { formatNumber, formatCurrency } from '../../utils/formatting';
import { AccountMetricsData } from '../../hooks/useFirestoreData';

interface AccountSummaryCardProps {
  accountMetrics: AccountMetricsData | null;
  isLoading?: boolean;
  error?: Error | null;
}

export const AccountSummaryCard: React.FC<AccountSummaryCardProps> = ({
  accountMetrics,
  isLoading = false,
  error = null,
}) => {
  // Format the data
  const totalBalance = formatCurrency(accountMetrics?.totalBalance);
  const availableMargin = formatCurrency(accountMetrics?.availableMargin);
  const dailyPnl = formatCurrency(accountMetrics?.dailyPnl);

  const lastUpdated = accountMetrics?.updatedAt
    ? new Date(accountMetrics.updatedAt.toDate 
        ? accountMetrics.updatedAt.toDate() 
        : accountMetrics.updatedAt).toLocaleString()
    : accountMetrics?.timestamp
    ? new Date(accountMetrics.timestamp).toLocaleString()
    : 'N/A';
  
  // Calculate percentage of margin used
  const marginUsed = accountMetrics?.totalBalance && accountMetrics?.availableMargin
    ? accountMetrics.totalBalance - accountMetrics.availableMargin
    : 0;
  
  const marginUsedPercent = accountMetrics?.totalBalance
    ? (marginUsed / accountMetrics.totalBalance) * 100
    : 0;
  
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
                Account Summary
              </Text>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody pt={4} display="flex" alignItems="center" justifyContent="center">
          <HStack>
            <Spinner color="brand.copper" size="sm" />
            <Text 
              color="brand.mahogany" 
              fontSize="sm"
              fontFamily="heading"
              fontStyle="italic"
              textAlign="center"
            >
              Loading account data...
            </Text>
          </HStack>
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
                Account Summary
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
            Error loading account data: {error.message}
          </Text>
        </CardBody>
      </Card>
    );
  }
  
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
              Account Summary
            </Text>
          </HStack>
          <Tooltip 
            label="Account's total balance and available margin for trading" 
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
        <VStack spacing={4} align="stretch">
          <StatGroup>
            <Stat>
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany" 
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Total Balance
              </StatLabel>
              <StatNumber 
                fontSize="2xl" 
                color="brand.navy"
                fontFamily="heading"
              >
                {totalBalance}
              </StatNumber>
              <StatHelpText 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="body"
                fontStyle="italic"
              >
                <Text 
                  fontSize="xs" 
                  mb={1} 
                  color="brand.mahogany"
                  fontFamily="heading"
                  fontStyle="italic"
                  textAlign="center"
                  fontWeight="bold"
                >
               
                </Text>
              </StatHelpText>
            </Stat>
            
            <Stat>
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
              >
                Available Funds
              </StatLabel>
              <StatNumber 
                fontSize="xl"
                color="brand.navy"
                fontFamily="heading"
              >
                {availableMargin}
              </StatNumber>
              <StatHelpText 
                fontSize="xs"
                color="brand.mahogany"
                fontFamily="body"
              >
                {marginUsedPercent > 0 && (
                  <Text>
                    {marginUsedPercent.toFixed(1)}% Allocated
                  </Text>
                )}
              </StatHelpText>
            </Stat>
            
            <Stat>
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
              >
                Daily P&L
              </StatLabel>
              <Flex align="center">
                <StatNumber 
                  color={accountMetrics?.dailyPnl && accountMetrics.dailyPnl > 0 ? 'brand.green' : 'brand.red'} 
                  fontSize="xl"
                  fontFamily="heading"
                >
                  {accountMetrics?.dailyPnl && accountMetrics.dailyPnl > 0 ? '+' : ''}{dailyPnl}
                </StatNumber>
              </Flex>
              <StatHelpText 
                fontSize="xs"
                fontFamily="body"
                color={accountMetrics?.dailyPnl && accountMetrics.dailyPnl >= 0 ? "brand.green" : "brand.red"}
              >
                <HStack spacing={1}>
                  <Icon 
                    as={accountMetrics?.dailyPnl && accountMetrics.dailyPnl >= 0 ? TrendingUpIcon : TrendingUpIcon} 
                    boxSize="12px" 
                    transform={accountMetrics?.dailyPnl && accountMetrics.dailyPnl < 0 ? "rotate(180deg)" : "none"} 
                  />
                  <Text>
                    {accountMetrics?.dailyPnl && accountMetrics.totalBalance ? 
                      `${Math.abs((accountMetrics.dailyPnl / accountMetrics.totalBalance) * 100).toFixed(2)}%` : ''}
                  </Text>
                </HStack>
              </StatHelpText>
            </Stat>
          </StatGroup>
          
          {/* Margin usage bar */}
          {accountMetrics?.totalBalance && accountMetrics?.availableMargin && (
            <Box mt={2}>
              <Text 
                fontSize="xs" 
                mb={1} 
                color="brand.mahogany"
                fontFamily="heading"
              >
                Margin Usage
              </Text>
              <Flex h="8px" bg="rgba(12, 35, 64, 0.05)" borderRadius="full" overflow="hidden" borderWidth="1px" borderColor="brand.copper">
                <Box 
                  bg={marginUsedPercent > 80 ? "brand.red" : marginUsedPercent > 50 ? "brand.copper" : "brand.green"} 
                  h="100%" 
                  w={`${marginUsedPercent}%`} 
                  borderRadius="full"
                />
              </Flex>
              <Flex justify="space-between" mt={1}>
                <Text 
                  fontSize="xs" 
                  color="brand.mahogany"
                  fontFamily="body"
                >
                  {formatCurrency(marginUsed)} Deployed
                </Text>
                <Text 
                  fontSize="xs" 
                  color="brand.mahogany"
                  fontWeight="bold"
                  fontFamily="heading"
                >
                  {marginUsedPercent.toFixed(1)}%
                </Text>
              </Flex>
            </Box>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
};

export default AccountSummaryCard;