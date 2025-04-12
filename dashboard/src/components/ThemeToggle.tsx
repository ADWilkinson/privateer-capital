import React from 'react';
import { IconButton, useColorMode, Tooltip } from '@chakra-ui/react';
import { SunIcon, MoonIcon, SunMoonIcon } from 'lucide-react';
import { useDashboard } from '../context/DashboardContext';

const ThemeToggle: React.FC = () => {
  const { preferences, toggleTheme } = useDashboard();
  const { setColorMode } = useColorMode();
  
  // Keep Chakra's color mode in sync with our theme
  React.useEffect(() => {
    setColorMode(preferences.theme);
  }, [preferences.theme, setColorMode]);

  return (
    <Tooltip 
      label={preferences.theme === 'light' ? 'Night Navigation' : 'Day Navigation'} 
      bg="brand.navy"
      color="brand.gold"
    >
      <IconButton
        aria-label="Toggle navigation mode"
        icon={preferences.theme === 'light' ? <MoonIcon size={18} /> : <SunIcon size={18} />}
        onClick={toggleTheme}
        variant="ghost"
        borderRadius="full"
        color="brand.gold"
        bg="rgba(12, 35, 64, 0.1)"
        _hover={{
          bg: "rgba(12, 35, 64, 0.2)",
        }}
      />
    </Tooltip>
  );
};

export default ThemeToggle;