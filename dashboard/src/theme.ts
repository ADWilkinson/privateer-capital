import { extendTheme } from '@chakra-ui/react';

// Define the theme colors with a 17th century privateer-inspired palette
const colors = {
  brand: {
    navy: "#0C2340",       // Dark navy/midnight blue - deep sea at night
    gold: "#D4AF37",       // Gold doubloons
    parchment: "#F5F0E1",  // Aged parchment/map background
    mahogany: "#4E2728",   // Rich dark wood of ship interiors
    copper: "#B87333",     // Weathered metallic accents
    white: "#FFFFFF",      // White for text and highlights
    red: "#7D2027",        // Deep burgundy red accent
    green: "#006D5B",      // Colonial green for positive values
  },
};

// Define custom fonts - more period-appropriate
const fonts = {
  heading: "'EB Garamond', serif",
  body: "'Cormorant Garamond', serif",
  mono: "'Courier New', monospace",
};

// Define custom component styles
const components = {
  Button: {
    baseStyle: {
      fontWeight: 'bold',
      borderRadius: '2px', // Square buttons like old naval buttons
      _focus: {
        boxShadow: 'none',
      },
    },
    variants: {
      primary: {
        bg: 'brand.navy',
        color: 'brand.gold',
        _hover: {
          bg: 'brand.mahogany',
          transform: 'translateY(-2px)',
          transition: 'all 0.2s',
        },
      },
      secondary: {
        bg: 'transparent',
        color: 'brand.navy',
        border: '1px solid',
        borderColor: 'brand.navy',
        _hover: {
          bg: 'brand.parchment',
        },
      },
    },
  },
  Card: {
    baseStyle: {
      container: {
        borderRadius: '4px', // Slightly rounded corners like old parchment
        bg: 'brand.parchment',
        borderWidth: '1px',
        borderColor: 'brand.mahogany',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      },
      header: {
        borderBottomWidth: '1px',
        borderColor: 'brand.mahogany',
      },
    },
  },
  Heading: {
    baseStyle: {
      color: 'brand.navy',
      fontFamily: 'heading',
      letterSpacing: '0.5px',
    },
  },
  Table: {
    variants: {
      simple: {
        th: {
          borderBottom: '2px solid',
          borderColor: 'brand.copper',
          color: 'brand.navy',
          fontWeight: 'bold',
          fontFamily: 'heading',
        },
        td: {
          borderBottom: '1px solid',
          borderColor: 'brand.copper',
          color: 'brand.navy',
        },
      },
    },
  },
  Badge: {
    variants: {
      solid: {
        bg: 'brand.navy',
        color: 'brand.gold',
      },
      outline: {
        borderColor: 'brand.navy',
        color: 'brand.navy',
      },
      success: {
        bg: 'brand.green',
        color: 'white',
      },
      danger: {
        bg: 'brand.red',
        color: 'white',
      },
    },
  },
  Stat: {
    baseStyle: {
      container: {
        fontFamily: 'heading',
      },
      label: {
        fontWeight: 'medium',
        color: 'brand.navy',
      },
      number: {
        fontWeight: 'bold',
        color: 'brand.navy',
      },
      helpText: {
        color: 'brand.mahogany',
      },
    },
  },
  Tooltip: {
    baseStyle: {
      bg: 'brand.navy',
      color: 'brand.parchment',
      borderRadius: '2px',
    },
  },
};

// Extend the theme
const theme = extendTheme({
  colors,
  fonts,
  components,
  styles: {
    global: {
      body: {
        bg: 'brand.parchment',
        color: 'brand.navy',
      },
    },
  },
});

export { theme };
export default theme;