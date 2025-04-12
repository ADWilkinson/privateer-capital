import React, { ReactNode } from 'react';
import { 
  Box, 
  Stat, 
  StatLabel, 
  StatNumber, 
  StatHelpText, 
  StatArrow, 
  Flex,
  Tooltip,
  Icon
} from '@chakra-ui/react';
import { InfoIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string | ReactNode;
  footer?: string | ReactNode;
  change?: number;
  tooltip?: string;
  isLoading?: boolean;
  icon?: ReactNode;
  colorScheme?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ 
  title, 
  value,
  subtitle,
  footer,
  change,
  tooltip,
  isLoading = false,
  icon,
  colorScheme = 'brand.navy'
}) => {
  // Function to determine color based on change value
  const getChangeColor = (changeValue: number) => {
    return changeValue >= 0 ? 'brand.green' : 'brand.red';
  };

  return (
    <Box 
      p={6} 
      bg="brand.parchment" 
      borderRadius="4px" 
      boxShadow="0 2px 6px rgba(0,0,0,0.15)" 
      position="relative" 
      borderLeft={`4px solid`} 
      borderLeftColor={colorScheme}
      borderTop="1px solid"
      borderTopColor="brand.copper"
      borderRight="1px solid"
      borderRightColor="brand.copper"
      borderBottom="1px solid"
      borderBottomColor="brand.copper"
      transition="all 0.2s"
      _hover={{ 
        boxShadow: '0 4px 8px rgba(0,0,0,0.2)', 
        transform: 'translateY(-2px)'
      }}
    >
      <Flex justify="space-between" align="flex-start">
        <Stat>
          <Flex align="center">
            <StatLabel 
              fontSize="md" 
              color="brand.mahogany" 
              mr={2}
              fontFamily="heading"
              fontWeight="500"
              letterSpacing="0.5px"
            >
              {title}
            </StatLabel>
            {tooltip && (
              <Tooltip label={tooltip} placement="top" hasArrow>
                <span>
                  <Icon as={InfoIcon} boxSize={4} color="brand.copper" />
                </span>
              </Tooltip>
            )}
          </Flex>
          <StatNumber 
            fontSize="2xl" 
            fontWeight="bold" 
            letterSpacing="tight"
            mt={1}
            color="brand.navy"
            fontFamily="heading"
          >
            {isLoading ? '—' : value}
          </StatNumber>
          
          {subtitle && (
            <StatHelpText mb={0} mt={1} color="brand.mahogany" fontSize="sm">
              {subtitle}
            </StatHelpText>
          )}
          
          {change !== undefined && (
            <StatHelpText mb={0} mt={1} color={getChangeColor(change)}>
              <StatArrow type={change >= 0 ? 'increase' : 'decrease'} />
              {Math.abs(change).toFixed(2)}%
            </StatHelpText>
          )}
          
          {footer && (
            <Box fontSize="xs" color="brand.mahogany" mt={2} fontStyle="italic">
              {footer}
            </Box>
          )}
        </Stat>
        
        {icon && (
          <Box 
            p={2} 
            borderRadius="full" 
            bg="rgba(212, 175, 55, 0.15)"  // Gold with transparency
            color="brand.copper"
          >
            {icon}
          </Box>
        )}
      </Flex>
    </Box>
  );
};

export default MetricCard;