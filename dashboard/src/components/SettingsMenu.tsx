import React from 'react';
import {
  Box,
  Button,
  IconButton,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverCloseButton,
  PopoverContent,
  PopoverHeader,
  PopoverTrigger,
  Radio,
  RadioGroup,
  Stack,
  Text,
  VStack,
  Divider
} from '@chakra-ui/react';
import { Settings, SunIcon, MoonIcon } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';

const SettingsMenu: React.FC = () => {
  const { preferences, updatePreference, toggleTheme } = useDashboard();
  const { refreshInterval, theme } = preferences;

  return (
    <Popover placement="bottom-end">
      <PopoverTrigger>
        <IconButton
          aria-label="Dashboard settings"
          icon={<Settings size={20} />}
          variant="ghost"
          borderRadius="full"
        />
      </PopoverTrigger>
      <PopoverContent width="300px">
        <PopoverArrow />
        <PopoverCloseButton />
        <PopoverHeader fontWeight="medium">Dashboard Settings</PopoverHeader>
        <PopoverBody>
          <VStack spacing={4} align="stretch">
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Data Refresh Interval
              </Text>
              <RadioGroup
                value={refreshInterval.toString()}
                onChange={(value) => updatePreference('refreshInterval', parseInt(value))}
              >
                <Stack spacing={2}>
                  <Radio value="15000">15 seconds</Radio>
                  <Radio value="30000">30 seconds</Radio>
                  <Radio value="60000">1 minute</Radio>
                  <Radio value="300000">5 minutes</Radio>
                </Stack>
              </RadioGroup>
            </Box>
            
            <Divider />
            
            <Box>
              <Text fontSize="sm" fontWeight="medium" mb={2}>
                Theme
              </Text>
              <Button 
                size="sm" 
                width="100%" 
                onClick={toggleTheme}
                leftIcon={theme === 'light' ? <MoonIcon size={16} /> : <SunIcon size={16} />}
              >
                Switch to {theme === 'light' ? 'Dark' : 'Light'} Mode
              </Button>
            </Box>
            
            <Divider />
            
            <Button 
              size="sm" 
              colorScheme="red" 
              variant="outline"
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
            >
              Reset All Settings
            </Button>
          </VStack>
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
};

export default SettingsMenu;