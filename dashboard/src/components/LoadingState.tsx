import React from 'react';
import { 
  Box, 
  Flex, 
  Spinner, 
  Text, 
  SkeletonText, 
  useColorModeValue,
  Skeleton,
  SimpleGrid,
  Card,
  CardBody,
  CardHeader,
  SkeletonCircle,
  VStack,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { LoaderIcon, AnchorIcon, CompassIcon, MapIcon, ShipIcon } from 'lucide-react';
import { keyframes } from '@emotion/react';

interface LoadingStateProps {
  text?: string;
  fullPage?: boolean;
  withText?: boolean;
  size?: string;
  height?: string;
  variant?: 'spinner' | 'dots' | 'ship';
}

// Define a keyframes for ship rocking animation
const rockingShip = keyframes`
  0% { transform: rotate(-5deg); }
  50% { transform: rotate(5deg); }
  100% { transform: rotate(-5deg); }
`;

const LoadingState: React.FC<LoadingStateProps> = ({
  text = 'Loading...',
  fullPage = false,
  withText = true,
  size = 'xl',
  height = '200px',
  variant = 'spinner'
}) => {
  const renderLoadingIndicator = () => {
    switch (variant) {
      case 'dots':
        return (
          <HStack spacing={2}>
            <Box 
              as="span" 
              animation="bounce 1.4s infinite .2s" 
              bg="brand.gold" 
              borderRadius="full" 
              h="10px" 
              w="10px"
            />
            <Box 
              as="span" 
              animation="bounce 1.4s infinite .4s" 
              bg="brand.gold" 
              borderRadius="full" 
              h="10px" 
              w="10px"
            />
            <Box 
              as="span" 
              animation="bounce 1.4s infinite .6s" 
              bg="brand.gold" 
              borderRadius="full" 
              h="10px" 
              w="10px"
            />
          </HStack>
        );
      case 'ship':
        return (
          <Box
            position="relative"
            height="60px"
            width="60px"
            animation={`${rockingShip} 3s ease-in-out infinite`}
            transformOrigin="center"
          >
            <Icon 
              as={ShipIcon} 
              boxSize="60px" 
              color="brand.gold"
            />
          </Box>
        );
      case 'spinner':
      default:
        return (
          <Spinner 
            thickness="4px"
            speed="0.65s"
            emptyColor="rgba(12, 35, 64, 0.1)"
            color="brand.gold"
            size={size}
          />
        );
    }
  };
  
  if (fullPage) {
    return (
      <Flex
        height="100vh"
        width="100%"
        alignItems="center"
        justifyContent="center"
        flexDirection="column"
        bg="brand.parchment"
        backgroundImage="url('data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23d4af37' fill-opacity='0.05' fill-rule='evenodd'/%3E%3C/svg%3E')"
      >
        <VStack spacing={6}>
          <Box position="relative">
            {renderLoadingIndicator()}
          </Box>
          {withText && (
            <Text 
              mt={4} 
              color="brand.mahogany" 
              fontWeight="medium"
              fontFamily="heading"
              fontStyle="italic"
              fontSize="lg"
            >
              {text}
            </Text>
          )}
        </VStack>
      </Flex>
    );
  }

  return (
    <Flex
      height={height}
      width="100%"
      alignItems="center"
      justifyContent="center"
      flexDirection="column"
      bg="brand.parchment"
    >
      <VStack spacing={6}>
        <Box position="relative">
          {renderLoadingIndicator()}
        </Box>
        {withText && (
          <Text 
            mt={2} 
            color="brand.mahogany" 
            fontWeight="medium"
            fontFamily="heading"
            fontStyle="italic"
          >
            {text}
          </Text>
        )}
      </VStack>
    </Flex>
  );
};

export const CardSkeleton: React.FC<{ lines?: number }> = ({ lines = 3 }) => {
  return (
    <Card 
      padding="6" 
      boxShadow="sm" 
      bg="brand.parchment" 
      borderRadius="md" 
      borderColor="brand.copper" 
      borderWidth="1px"
    >
      <CardHeader pb={0}>
        <Skeleton 
          height="24px" 
          width="120px" 
          startColor="rgba(184, 115, 51, 0.2)"
          endColor="rgba(12, 35, 64, 0.1)"
        />
      </CardHeader>
      <CardBody>
        <SkeletonText 
          mt="4" 
          noOfLines={lines} 
          spacing="4" 
          skeletonHeight="2"
          startColor="rgba(184, 115, 51, 0.2)"
          endColor="rgba(12, 35, 64, 0.1)"
        />
      </CardBody>
    </Card>
  );
};

export const DashboardSkeleton: React.FC = () => {
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
          Preparing your navigational charts...
        </Text>
      </Flex>
    </Box>
  );
};

export default LoadingState;