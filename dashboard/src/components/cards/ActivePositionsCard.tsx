import React from 'react';
import {
  Box,
  Card,
  CardBody,
  CardHeader,
  Flex,
  HStack,
  Badge,
  Stat,
  StatGroup,
  StatLabel,
  StatNumber,
  Table,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tooltip,
  Tr,
  VStack,
  Icon,
  Spinner,
} from '@chakra-ui/react';
import { InfoIcon, TrendingUpIcon, ActivityIcon, CompassIcon, AnchorIcon, ShipIcon } from 'lucide-react';
import { formatCurrency, formatNumber } from '../../utils/formatting';
import { TradeData } from '../../hooks/useFirestoreData';

interface ActivePositionsCardProps {
  activeTrades: TradeData[];
  isLoading?: boolean;
  error?: Error | null;
}

export const ActivePositionsCard: React.FC<ActivePositionsCardProps> = ({
  activeTrades,
  isLoading = false,
  error = null,
}) => {
  // Calculate the number of long and short positions
  const longPositions = activeTrades.filter(trade => 
    trade.side?.toLowerCase() === 'long' || trade.side?.toLowerCase() === 'buy'
  ).length;
  
  const shortPositions = activeTrades.filter(trade => 
    trade.side?.toLowerCase() === 'short' || trade.side?.toLowerCase() === 'sell'
  ).length;
  
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
                <Icon as={ShipIcon} boxSize={5} color="brand.navy" />
              </Box>
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Active Positions
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
            >
              Loading active positions...
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
                <Icon as={ShipIcon} boxSize={5} color="brand.red" />
              </Box>
              <Text 
                fontWeight="medium" 
                fontSize="sm" 
                color="brand.navy"
                fontFamily="heading"
              >
                Active Positions
              </Text>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody pt={4}>
          <Text 
            color="brand.red" 
            fontFamily="heading"
            fontStyle="italic"
          >
            Error loading position data: {error.message}
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
              <Icon as={ShipIcon} boxSize={5} color="brand.navy" />
            </Box>
            <Text 
              fontWeight="medium" 
              fontSize="sm" 
              color="brand.navy"
              fontFamily="heading"
              letterSpacing="0.5px"
            >
              Active Positions
            </Text>
          </HStack>
          <Tooltip 
            label="Currently open trading positions" 
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
                Open Positions
              </StatLabel>
              <StatNumber 
                fontSize="2xl"
                color="brand.navy"
                fontFamily="heading"
              >
                {activeTrades.length}
              </StatNumber>
              <Text 
                fontSize="xs" 
                color="brand.mahogany" 
                mt={1}
                fontFamily="body"
                fontStyle="italic"
              >
                {longPositions > 0 && shortPositions > 0 ? 
                  `${Math.min(longPositions, shortPositions)} paired trades` : 
                  'No paired positions'}
              </Text>
            </Stat>
            
            <Stat>
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Long Positions
              </StatLabel>
              <StatNumber 
                fontSize="xl" 
                color="brand.green"
                fontFamily="heading"
              >
                {longPositions}
              </StatNumber>
              <Text 
                fontSize="xs" 
                color="brand.mahogany" 
                mt={1}
                fontFamily="body"
              >
                LONG
              </Text>
            </Stat>
            
            <Stat>
              <StatLabel 
                fontSize="xs" 
                color="brand.mahogany"
                fontFamily="heading"
                letterSpacing="0.5px"
              >
                Short Positions
              </StatLabel>
              <StatNumber 
                fontSize="xl" 
                color="brand.red"
                fontFamily="heading"
              >
                {shortPositions}
              </StatNumber>
              <Text 
                fontSize="xs" 
                color="brand.mahogany" 
                mt={1}
                fontFamily="body"
              >
                SHORT
              </Text>
            </Stat>
          </StatGroup>
          
          {/* Position balance indicator */}
          {activeTrades.length > 0 && (
            <Box>
              <Flex justify="space-between" mb={1}>
                <Text 
                  fontSize="xs" 
                  color="brand.mahogany"
                  fontFamily="heading"
                >
                  Position Balance
                </Text>
                <Text 
                  fontSize="xs" 
                  fontWeight="medium"
                  fontFamily="heading"
                  color={longPositions === shortPositions ? "brand.green" : "brand.copper"}
                >
                  {longPositions === shortPositions ? 'Balanced' : 'Imbalanced'}
                </Text>
              </Flex>
              <Flex 
                h="24px" 
                bg="rgba(12, 35, 64, 0.05)" 
                borderRadius="md" 
                overflow="hidden"
                border="1px solid"
                borderColor="brand.copper"
              >
                <Box 
                  bg="brand.green"
                  h="100%" 
                  w={`${(longPositions / Math.max(activeTrades.length, 1)) * 100}%`}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {longPositions > 0 && (
                    <Text 
                      fontSize="xs" 
                      fontWeight="bold" 
                      color="white"
                      fontFamily="heading"
                    >
                      {longPositions}
                    </Text>
                  )}
                </Box>
                <Box 
                  bg="brand.red"
                  h="100%" 
                  w={`${(shortPositions / Math.max(activeTrades.length, 1)) * 100}%`}
                  display="flex"
                  alignItems="center"
                  justifyContent="center"
                >
                  {shortPositions > 0 && (
                    <Text 
                      fontSize="xs" 
                      fontWeight="bold" 
                      color="white"
                      fontFamily="heading"
                    >
                      {shortPositions}
                    </Text>
                  )}
                </Box>
              </Flex>
            </Box>
          )}
          
          {/* Active positions table */}
          {activeTrades.length > 0 ? (
            <Table 
              size="sm" 
              variant="simple" 
              mt={2} 
              fontSize="xs"
            >
              <Thead bg="rgba(184, 115, 51, 0.05)">
                <Tr>
                  <Th 
                    fontSize="xs" 
                    px={2}
                    borderColor="brand.copper"
                    color="brand.navy"
                    fontFamily="heading"
                  >
                    Symbol
                  </Th>
                  <Th 
                    fontSize="xs" 
                    px={2}
                    borderColor="brand.copper"
                    color="brand.navy"
                    fontFamily="heading"
                  >
                    Type
                  </Th>
                  <Th 
                    fontSize="xs" 
                    px={2} 
                    isNumeric
                    borderColor="brand.copper"
                    color="brand.navy"
                    fontFamily="heading"
                  >
                    Entry 
                  </Th>
                  <Th 
                    fontSize="xs" 
                    px={2} 
                    isNumeric
                    borderColor="brand.copper"
                    color="brand.navy"
                    fontFamily="heading"
                  >
                    Size
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {activeTrades.slice(0, 5).map((trade) => (
                  <Tr key={trade.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                    <Td 
                      fontWeight="medium" 
                      px={2}
                      borderColor="brand.copper"
                      fontFamily="body"
                    >
                      {trade.symbol}
                    </Td>
                    <Td 
                      px={2}
                      borderColor="brand.copper"
                    >
                      <Badge 
                        bg={trade.side?.toLowerCase().includes('long') || 
                              trade.side?.toLowerCase().includes('buy') 
                              ? 'brand.green' : 'brand.red'}
                        color="white"
                        fontSize="xs"
                        fontFamily="heading"
                        px={2}
                        py={0.5}
                        borderRadius="sm"
                      >
                        {trade.side?.toLowerCase().includes('long') || trade.side?.toLowerCase().includes('buy')
                          ? 'Long'
                          : 'Short'
                        }
                      </Badge>
                    </Td>
                    <Td 
                      isNumeric 
                      px={2}
                      borderColor="brand.copper"
                      fontFamily="mono"
                    >
                      {typeof trade.entryPrice === 'number' || typeof trade.executedPrice === 'number' 
                        ? formatNumber(trade.entryPrice as number || trade.executedPrice as number) 
                        : trade.entryPrice || trade.executedPrice}
                    </Td>
                    <Td 
                      isNumeric 
                      px={2}
                      borderColor="brand.copper"
                      fontFamily="mono"
                    >
                      {trade.size || trade.executedSize}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <Box 
              pt={4} 
              pb={2}
              display="flex"
              justifyContent="center"
              alignItems="center"
              flexDirection="column"
            >
              <Icon 
                as={AnchorIcon} 
                boxSize={8} 
                color="brand.copper" 
                opacity={0.5} 
                mb={2}
              />
              <Text 
                fontSize="sm" 
                color="brand.mahogany" 
                fontStyle="italic" 
                textAlign="center"
                fontFamily="heading"
              >
                No vessels currently at sea
              </Text>
              <Text 
                fontSize="xs" 
                color="brand.mahogany" 
                fontStyle="italic" 
                textAlign="center"
                mt={1}
              >
                All ships safely in harbor
              </Text>
            </Box>
          )}
          
          {activeTrades.length > 5 && (
            <Text 
              fontSize="xs" 
              color="brand.mahogany" 
              textAlign="right"
              fontFamily="body"
              fontStyle="italic"
            >
              + {activeTrades.length - 5} more vessels sailing distant waters
            </Text>
          )}
        </VStack>
      </CardBody>
    </Card>
  );
};

export default ActivePositionsCard;