import React from 'react';
import {
  Badge,
  Button,
  Flex,
  HStack,
  Icon,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Spinner,
  Text,
  Tooltip,
  Box,
  useColorModeValue,
} from '@chakra-ui/react';
import { CogIcon, RefreshCwIcon, CompassIcon, AnchorIcon, MapIcon, CheckCircle } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';
import { formatTimestamp } from '../utils/formatting';

interface SyncStatusIndicatorProps {
  variant?: 'badge' | 'button';
  size?: 'sm' | 'md';
}

const SyncStatusIndicator: React.FC<SyncStatusIndicatorProps> = ({
  variant = 'badge',
  size = 'sm',
}) => {
  const { syncStatus, syncPositions } = useDashboard();
  const { isInSync, lastSynced, syncActions, loading, error } = syncStatus;
  
  const handleSync = () => {
    syncPositions().catch(err => {
      console.error('Error syncing positions:', err);
    });
  };
  
  // Format data
  const lastSyncedFormatted = lastSynced 
    ? formatTimestamp(lastSynced)
    : 'Never synchronized';
  
  // Loading state
  if (loading) {
    return (
      <HStack spacing={1} opacity={0.8}>
        <Spinner size="xs" color="brand.gold" />
        <Text 
          fontSize="xs" 
          color="brand.gold" 
          fontFamily="heading"
        >
          Synchronizing...
        </Text>
      </HStack>
    );
  }
  
  if (variant === 'button') {
    return (
      <Popover placement="bottom-end">
        <PopoverTrigger>
          <Button
            size={size}
            leftIcon={<CompassIcon size={16} />}
            colorScheme={isInSync ? 'brand.green' : error ? 'brand.red' : 'brand.gold'}
            variant="outline"
            color={isInSync ? 'brand.green' : error ? 'brand.red' : 'brand.gold'}
            borderColor={isInSync ? 'brand.green' : error ? 'brand.red' : 'brand.gold'}
            fontFamily="heading"
          >
            {isInSync ? 'Synchronized' : 'Out of Sync'}
          </Button>
        </PopoverTrigger>
        <PopoverContent 
          width="300px" 
          bg="brand.parchment" 
          borderColor="brand.copper"
          boxShadow="0 4px 8px rgba(0,0,0,0.2)"
        >
          <PopoverArrow bg="brand.parchment" />
          <PopoverCloseButton color="brand.mahogany" />
          <PopoverHeader 
            fontWeight="medium" 
            borderBottomColor="brand.copper"
            color="brand.navy"
            fontFamily="heading"
          >
            Position Synchronization Status
          </PopoverHeader>
          <PopoverBody>
            <Flex direction="column" gap={2}>
              <Text fontSize="sm" fontFamily="heading" color="brand.navy">
                Sync Status: 
                <Badge 
                  colorScheme={isInSync ? 'brand.green' : 'brand.red'} 
                  ml={2}
                  bg={isInSync ? 'brand.green' : 'brand.red'}
                  color="white"
                >
                  {isInSync ? 'Synchronized' : 'Out of Sync'}
                </Badge>
              </Text>
              <Text fontSize="sm" fontFamily="heading" color="brand.navy">
                Last Synchronized: {lastSyncedFormatted}
              </Text>
              {syncActions > 0 && (
                <Text fontSize="sm" fontFamily="heading" color="brand.navy">
                  Corrections: {syncActions} position{syncActions !== 1 ? 's' : ''} synchronized
                </Text>
              )}
              {error && (
                <Text fontSize="sm" color="brand.red" fontFamily="heading">
                  Synchronization Error: {error.message}
                </Text>
              )}
              <Button 
                size="sm" 
                leftIcon={<MapIcon size={14} />} 
                bg="brand.navy"
                color="brand.gold"
                _hover={{
                  bg: "brand.mahogany"
                }}
                onClick={handleSync}
                isLoading={loading}
                mt={2}
                fontFamily="heading"
              >
                Synchronize Positions
              </Button>
            </Flex>
          </PopoverBody>
        </PopoverContent>
      </Popover>
    );
  }
  
  // Default badge variant
  const tooltipLabel = `${isInSync ? 'Database and exchange positions are synchronized' : 'Synchronization needed'}
Last synchronized: ${lastSyncedFormatted}${syncActions > 0 ? `\n${syncActions} position${syncActions !== 1 ? 's' : ''} reconciled` : ''}`;

  return (
    <Tooltip 
      label={tooltipLabel} 
      hasArrow 
      bg="brand.navy" 
      color="brand.parchment"
    >
      <Badge
        display="flex"
        alignItems="center"
        bg={isInSync ? "brand.navy" : "brand.red"}
        color="white"
        px={2}
        py={1}
        borderRadius="full"
        cursor="pointer"
        textAlign="center"
        justifyContent="center"
        onClick={handleSync}
        _hover={{ opacity: 0.8 }}
        boxShadow="0 1px 2px rgba(0,0,0,0.2)"
      >
        <Icon 
          as={isInSync ? CheckCircle : CompassIcon} 
          boxSize="12px" 
          mr={2} 
        />
        <HStack spacing={1}>
          <Text 
            fontSize="xs"
            fontFamily="heading"
            letterSpacing="0.3px"
          >
            {isInSync ? "Synced" : "Unsynced"}
          </Text>
          {syncActions > 0 && (
            <Box
              bg={isInSync ? "rgba(255,255,255,0.3)" : "rgba(255,255,255,0.3)"}
              color="white"
              px={1}
              borderRadius="full"
              fontSize="10px"
              fontWeight="bold"
            >
              {syncActions}
            </Box>
          )}
        </HStack>
      </Badge>
    </Tooltip>
  );
};

export default SyncStatusIndicator;