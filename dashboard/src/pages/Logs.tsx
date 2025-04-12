import React, { useState } from 'react';
import {
  Box,
  Heading,
  Text,
  Flex,
  Badge,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Select,
  HStack,
  Button,
  Input,
  InputGroup,
  InputLeftElement,
  Icon,
  Card,
  CardHeader,
  CardBody,
  Skeleton,
  VStack,
} from '@chakra-ui/react';
import { 
  SearchIcon, 
  RefreshCwIcon, 
  ScrollTextIcon, 
  FileTextIcon,
  FilterIcon,
  ClipboardListIcon,
  AlertTriangleIcon,
  CheckIcon,
  AnchorIcon,
  AlertCircleIcon,
  CheckCircle,
  LineChart,
  CompassIcon,
  CoinsIcon,
  ShipIcon,
  SailboatIcon
} from 'lucide-react';
import { useQuery } from 'react-query';
import { fetchBotEvents } from '../services/api';
import { BotEvent } from '../services/api';
import LoadingState from '../components/LoadingState';
import { format } from 'date-fns';

const useBotEvents = (limit = 50) => {
  const { data, isLoading, error, refetch } = useQuery<BotEvent[]>(
    ['botEvents', limit],
    () => fetchBotEvents(limit),
    {
      refetchInterval: 15000,
      refetchOnWindowFocus: true,
    }
  );

  return { data, isLoading, error, refetch };
};

const Logs: React.FC = () => {
  const [limit, setLimit] = useState<number>(200);
  const [filter, setFilter] = useState<string>('');
  const { data, isLoading, error, refetch } = useBotEvents(limit);

  // Filter events based on search term
  const filteredEvents = React.useMemo(() => {
    if (!data) return [];
    
    if (!filter) return data;
    
    const searchTerm = filter.toLowerCase();
    return data.filter(event => {
      const eventType = event.type || event.eventType || '';
      return eventType.toLowerCase().includes(searchTerm) ||
        (event.data && JSON.stringify(event.data).toLowerCase().includes(searchTerm));
    });
  }, [data, filter]);

  const getLevelColor = (eventType: string): string => {
    if (!eventType) return 'brand.navy';
    if (eventType.includes('error')) return 'brand.red';
    if (eventType.includes('warn')) return 'brand.copper';
    if (eventType.includes('success') || eventType.includes('completed')) return 'brand.green';
    return 'brand.navy';
  };

  const getEventIcon = (eventType: string) => {
    if (!eventType) return ScrollTextIcon;
    if (eventType.includes('error')) return AlertTriangleIcon;
    if (eventType.includes('warn')) return AlertCircleIcon;
    if (eventType.includes('success')) return CheckIcon;
    if (eventType.includes('trade')) return CoinsIcon;
    if (eventType.includes('scan')) return CompassIcon;
    if (eventType.includes('position')) return ShipIcon;
    return ScrollTextIcon;
  };

  const handleRefresh = () => {
    refetch();
  };

  const handleLimitChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setLimit(Number(e.target.value));
  };

  if (isLoading) {
    return <LoadingState text="Unfurling the Captain's Log..." />;
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
            <Icon as={ScrollTextIcon} boxSize={7} color="brand.navy" />
            <Box>
              <Heading 
                size="lg" 
                color="brand.navy" 
                fontFamily="heading"
                letterSpacing="1px"
              >
                Activity Log
              </Heading>
              <Text 
                color="brand.mahogany" 
                fontSize="sm" 
                fontFamily="heading"
                fontStyle="italic"
              >
                System Events & Trade Records
              </Text>
            </Box>
          </HStack>
          <Button
            leftIcon={<RefreshCwIcon size={16} />}
            onClick={handleRefresh}
            bg="brand.navy"
            color="brand.gold"
            _hover={{ bg: "brand.mahogany" }}
            size="sm"
            borderRadius="md"
            fontFamily="heading"
            letterSpacing="0.5px"
          >
            Recover Log
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
            Captain's log appears to be water damaged. Unable to restore entries.
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
              Activity Log
            </Heading>
            <Text 
              color="brand.mahogany" 
              fontSize="sm" 
              fontFamily="heading"
              fontStyle="italic"
            >
              System Events & Trade Records
            </Text>
          </Box>
        </HStack>
        <Button
          leftIcon={<RefreshCwIcon size={16} />}
          onClick={handleRefresh}
          bg="brand.navy"
          color="brand.gold"
          _hover={{ bg: "brand.mahogany" }}
          size="sm"
          borderRadius="md"
          fontFamily="heading"
          letterSpacing="0.5px"
        >
          Refresh
        </Button>
      </Flex>

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
                Log Filters
              </Heading>
            </HStack>
          </Flex>
        </CardHeader>
        <CardBody>
          <HStack spacing={4}>
            <InputGroup>
              <InputLeftElement pointerEvents="none">
                <Icon as={SearchIcon} color="brand.copper" />
              </InputLeftElement>
              <Input
                type="text"
                placeholder="Search log entries..."
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                size="md"
                borderColor="brand.copper"
                bg="rgba(255,255,255,0.4)"
                _hover={{ borderColor: "brand.gold" }}
                color="brand.navy"
                fontFamily="body"
              />
            </InputGroup>
            <Select
              value={limit.toString()}
              onChange={handleLimitChange}
              size="md"
              borderColor="brand.copper"
              bg="rgba(255,255,255,0.4)"
              _hover={{ borderColor: "brand.gold" }}
              color="brand.navy"
              fontFamily="heading"
              icon={<Icon as={ScrollTextIcon} color="brand.copper" />}
              w="150px"
            >
              <option value="50">50 entries</option>
              <option value="100">100 entries</option>
              <option value="200">200 entries</option>
              <option value="500">500 entries</option>
            </Select>
          </HStack>
        </CardBody>
      </Card>

      {/* Log Table */}
      {filteredEvents.length > 0 ? (
        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody p={0}>
            <Box overflowX="auto">
              <Table size="sm" variant="simple">
                <Thead bg="rgba(184, 115, 51, 0.05)">
                  <Tr>
                    <Th 
                      borderColor="brand.copper" 
                      color="brand.navy"
                      fontFamily="heading"
                    >
                      Time Recorded
                    </Th>
                    <Th 
                      borderColor="brand.copper" 
                      color="brand.navy"
                      fontFamily="heading"
                    >
                      Log Type
                    </Th>
                    <Th 
                      borderColor="brand.copper" 
                      color="brand.navy"
                      fontFamily="heading"
                    >
                      Chronicled Events
                    </Th>
                  </Tr>
                </Thead>
                <Tbody>
                  {filteredEvents.map((event) => (
                    <Tr key={event.id} _hover={{ bg: "rgba(212, 175, 55, 0.05)" }}>
                      <Td 
                        borderColor="brand.copper"
                        fontFamily="body"
                        fontStyle="italic"
                        color="brand.mahogany"
                        fontSize="sm"
                        py={3}
                      >
                        {format(new Date(event.timestamp), 'MMM d, HH:mm:ss')}
                      </Td>
                      <Td borderColor="brand.copper">
                        <HStack spacing={2}>
                          <Icon
                            as={getEventIcon(event.type)}
                            color={getLevelColor(event.type)}
                            boxSize={4}
                          />
                          <Text 
                            color={getLevelColor(event.type)}
                            fontFamily="heading"
                            fontWeight="medium"
                          >
                            {event.type || event.eventType || 'unknown'}
                          </Text>
                        </HStack>
                      </Td>
                      <Td 
                        borderColor="brand.copper"
                        fontFamily="mono"
                        fontSize="xs"
                      >
                        <Text noOfLines={2} color="brand.navy">
                          {event.data ? JSON.stringify(event.data, null, 2) : 'No data recorded'}
                        </Text>
                      </Td>
                    </Tr>
                  ))}
                </Tbody>
              </Table>
            </Box>
          </CardBody>
        </Card>
      ) : (
        <Card 
          borderRadius="md" 
          boxShadow="md" 
          bg="brand.parchment"
          borderColor="brand.copper"
          borderWidth="1px"
        >
          <CardBody>
            <VStack spacing={3} py={6}>
              <Icon as={ScrollTextIcon} boxSize={12} color="brand.copper" opacity={0.6} />
              <Text 
                color="brand.mahogany" 
                fontFamily="heading"
                fontStyle="italic"
                textAlign="center"
              >
                No log entries match your search criteria
              </Text>
            </VStack>
          </CardBody>
        </Card>
      )}
      
      <Flex justify="center" mt={6} mb={4}>
        <Text 
          fontSize="xs" 
          color="brand.mahogany"
          fontFamily="heading"
          fontStyle="italic"
          textAlign="center"
        >
          "A wise captain keeps a meticulous log, for in its pages lies the wisdom of voyages past." — Privateer's Manual, 1641
        </Text>
      </Flex>
    </Box>
  );
};

export default Logs;