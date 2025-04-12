import React from "react";
import { Table, Thead, Tbody, Tr, Th, Td, Badge, Text, Flex, Icon, Box, HStack } from "@chakra-ui/react";
import { CompassIcon, CheckCircleIcon, XCircleIcon } from "lucide-react";
import { CorrelationPair as ApiCorrelationPair } from "../services/api";

// Extend the API CorrelationPair type to include the score property needed by the component
interface EnhancedCorrelationPair {
  id: string;
  pairA: string;
  pairB: string;
  correlation: number;
  correlationCoefficient: number;
  dataPoints: number;
  lookbackPeriod: string;
  spreadMean: number | null;
  spreadStd: number | null;
  pValue: number | null;
  halfLife: number | null;
  cointegrated: boolean;
  regressionCoefficient: number | null;
  timestamp: number;
  score?: number;
}

interface CorrelationTableProps {
  pairs: EnhancedCorrelationPair[];
}

const CorrelationTable: React.FC<CorrelationTableProps> = ({ pairs }) => {
  if (!pairs || pairs.length === 0) {
    return (
      <Flex direction="column" align="center" justify="center" py={6}>
        <Icon as={CompassIcon} boxSize={6} color="gray.400" mb={2} />
        <Text color="gray.500" fontSize="sm">No correlation pairs available</Text>
      </Flex>
    );
  }

  return (
    <Box overflowX="auto">
      <Table size="sm" variant="simple">
        <Thead>
          <Tr>
            <Th borderColor="gray.300" color="gray.600">
              Asset Pair
            </Th>
            <Th borderColor="gray.300" color="gray.600" isNumeric>
              Correlation Coefficient
            </Th>
            <Th borderColor="gray.300" color="gray.600" isNumeric>
              ADF Statistic
            </Th>
            <Th borderColor="gray.300" color="gray.600">
              Status
            </Th>
          </Tr>
        </Thead>
        <Tbody>
          {pairs
            .filter((pair) => pair.pValue !== null)
            .map((pair) => (
              <Tr key={pair.id} _hover={{ bg: "gray.50" }}>
                <Td borderColor="gray.300" py={2} fontWeight="medium">
                  {pair.pairA.replace(/-PERP$/, "")}/{pair.pairB.replace(/-PERP$/, "")}
                </Td>
                <Td borderColor="gray.300" isNumeric>
                  {pair.correlationCoefficient !== null ? pair.correlationCoefficient.toFixed(4) : "-"}
                </Td>
                <Td borderColor="gray.300" isNumeric>
                  {pair.pValue !== null ? pair.pValue.toFixed(4) : "-"}
                </Td>
                <Td borderColor="gray.300">
                  {pair.cointegrated ? (
                    <Badge colorScheme="green" variant="subtle" px={2} py={1} borderRadius="2px">
                      <HStack spacing={1}>
                        <Icon as={CheckCircleIcon} boxSize={3} />
                        <Text fontSize="xs">Cointegrated</Text>
                      </HStack>
                    </Badge>
                  ) : (
                    <Badge colorScheme="red" variant="subtle" px={2} py={1} borderRadius="2px">
                      <HStack spacing={1}>
                        <Icon as={XCircleIcon} boxSize={3} />
                        <Text fontSize="xs">Not Cointegrated</Text>
                      </HStack>
                    </Badge>
                  )}
                </Td>
              </Tr>
            ))}
        </Tbody>
      </Table>
    </Box>
  );
};

export default CorrelationTable;
