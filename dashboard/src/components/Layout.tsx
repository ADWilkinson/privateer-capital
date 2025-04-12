import React, { useState } from 'react';
import { 
  Box, 
  Flex, 
  Text, 
  IconButton, 
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  useDisclosure,
  VStack,
  HStack,
  Heading,
  Icon,
  Divider,
  Spacer,
  Image,
} from '@chakra-ui/react';
import { Link, useLocation } from 'react-router-dom';
import { 
  MenuIcon, 
  HomeIcon, 
  TrendingUpIcon, 
  SettingsIcon, 
  ScrollTextIcon,
  CompassIcon,
  AnchorIcon,
  ShipIcon,
} from 'lucide-react';
import SyncStatusIndicator from './SyncStatusIndicator';

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  to: string;
  isActive: boolean;
  onClick?: () => void;
}

const NavItem: React.FC<NavItemProps> = ({ icon, label, to, isActive, onClick }) => {
  return (
    <Link to={to} style={{ width: '100%' }} onClick={onClick}>
      <Flex
        align="center"
        p={2}
        mx={1}
        borderRadius="2px"
        role="group"
        cursor="pointer"
        bg={isActive ? 'brand.navy' : 'transparent'}
        color={isActive ? 'brand.gold' : 'brand.parchment'}
        _hover={{
          bg: isActive ? 'brand.navy' : 'rgba(212, 175, 55, 0.1)',
          color: isActive ? 'brand.gold' : 'brand.gold',
        }}
        transition="all 0.2s"
        borderLeft={isActive ? '3px solid' : '3px solid transparent'}
        borderColor={isActive ? 'brand.gold' : 'transparent'}
      >
        <Icon as={icon} fontSize="16px" mr={3} />
        <Text 
          fontWeight={isActive ? 'bold' : 'medium'} 
          fontSize="sm"
          fontFamily="heading"
          letterSpacing="0.5px"
        >
          {label}
        </Text>
      </Flex>
    </Link>
  );
};

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const location = useLocation();
  const [isMobileView, setIsMobileView] = useState(window.innerWidth < 768);

  React.useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth < 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const navItems = [
    { icon: HomeIcon, label: 'Dashboard', to: '/' },
    { icon: CompassIcon, label: 'Correlations', to: '/correlations' },
    { icon: TrendingUpIcon, label: 'Trades', to: '/trades' },
    { icon: ScrollTextIcon, label: 'Logs', to: '/logs' },
    { icon: SettingsIcon, label: 'Settings', to: '/settings' },
  ];

  const SidebarContent = () => (
    <Box
      bg="brand.navy"
      w={{ base: "full", md: 60 }}
      h="full"
      py={2}
      color="brand.parchment"
      backgroundImage="linear-gradient(to bottom, rgba(12, 35, 64, 0.95), rgba(12, 35, 64, 0.98)), url('data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 18c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm48 25c3.866 0 7-3.134 7-7s-3.134-7-7-7-7 3.134-7 7 3.134 7 7 7zm-43-7c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm63 31c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM34 90c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zm56-76c1.657 0 3-1.343 3-3s-1.343-3-3-3-3 1.343-3 3 1.343 3 3 3zM12 86c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm28-65c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm23-11c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-6 60c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm29 22c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zM32 63c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm57-13c2.76 0 5-2.24 5-5s-2.24-5-5-5-5 2.24-5 5 2.24 5 5 5zm-9-21c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM60 91c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM35 41c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2zM12 60c1.105 0 2-.895 2-2s-.895-2-2-2-2 .895-2 2 .895 2 2 2z' fill='%23d4af37' fill-opacity='0.1' fill-rule='evenodd'/%3E%3C/svg%3E')"
    >
      <Flex
        h="20"
        alignItems="center"
        mx="4"
        justifyContent="space-between"
        borderBottom="1px solid"
        borderColor="brand.gold"
        pb={2}
      >
        <HStack spacing={3}>
          <Icon as={AnchorIcon} boxSize={7} color="brand.gold" />
          <Box>
            <Heading size="md" fontFamily="heading" color="brand.gold" letterSpacing="1px" fontWeight="600">
              PRIVATEER
            </Heading>
            <Text fontSize="xs" color="brand.mahogany" fontFamily="heading" letterSpacing="0.5px">
           
            </Text>
          </Box>
        </HStack>
      </Flex>
      <Box display={{ base: "none", md: "block" }} mt={2}>
        <SyncStatusIndicator />
      </Box>
      <Box mt={8} mx={2}>
        <VStack spacing={2} align="stretch">
          {navItems.map((item) => (
            <NavItem
              key={item.to}
              icon={item.icon}
              label={item.label}
              to={item.to}
              isActive={location.pathname === item.to}
              onClick={isMobileView ? onClose : undefined}
            />
          ))}
        </VStack>
      </Box>

      <Box position="absolute" bottom="0" w="full" p={4}>
        <Divider borderColor="brand.gold" mb={3} opacity={0.3} />
        <Flex justify="center" align="center" direction="column">
          <Icon as={ShipIcon} boxSize={5} color="brand.gold" mb={1} />
          <Text fontSize="xs" color="brand.gold" fontFamily="heading" letterSpacing="0.5px">
            Privateer
          </Text>
          <Text fontSize="xs" color="brand.mahogany" textAlign="center" opacity={0.7} mt={1}>
     
          </Text>
        </Flex>
      </Box>
    </Box>
  );

  return (
    <Box minH="100vh" bg="brand.parchment">
      {/* Mobile nav */}
      <Box 
        display={{ base: 'flex', md: 'none' }} 
        bg="brand.navy" 
        px={3} 
        py={2} 
        alignItems="center"
        justifyContent="space-between"
        color="brand.parchment"
        borderBottom="1px solid"
        borderColor="brand.gold"
      >
        <HStack spacing={2}>
          <Icon as={AnchorIcon} boxSize={5} color="brand.gold" />
          <Heading 
            size="sm" 
            color="brand.gold"
            letterSpacing="1px"
          >
            PRIVATEER
          </Heading>
        </HStack>
        
        <SyncStatusIndicator />
        
        <IconButton
          aria-label="Open menu"
          icon={<MenuIcon />}
          variant="outline"
          onClick={onOpen}
          color="brand.gold"
          borderColor="brand.gold"
          size="sm"
          _hover={{
            bg: "rgba(212, 175, 55, 0.2)"
          }}
        />
        <Drawer isOpen={isOpen} placement="left" onClose={onClose}>
          <DrawerOverlay />
          <DrawerContent bg="brand.navy">
            <DrawerCloseButton color="brand.gold" />
            <DrawerHeader borderBottomWidth="1px" borderColor="brand.gold">
              <HStack spacing={2}>
                <Icon as={AnchorIcon} boxSize={5} color="brand.gold" />
                <Heading 
                  size="sm" 
                  color="brand.gold"
                  letterSpacing="1px"
                >
                  PRIVATEER CAPITAL
                </Heading>
              </HStack>
            </DrawerHeader>
            <DrawerBody p={0}>
              <SidebarContent />
            </DrawerBody>
          </DrawerContent>
        </Drawer>
      </Box>

      {/* Desktop sidebar */}
      <Box display={{ base: 'none', md: 'block' }} w={60} position="fixed" h="full">
        <SidebarContent />
      </Box>

      {/* Main content */}
      <Box ml={{ base: 0, md: 60 }} bg="brand.parchment">
        <Box 
          as="main" 
          minH="calc(100vh - 60px)"
          p={5}
          position="relative"
        >
          <Box position="relative" zIndex={1}>
            {children}
          </Box>
        </Box>
      </Box>
    </Box>
  );
};

export default Layout;