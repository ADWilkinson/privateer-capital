import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  Box, 
  Heading, 
  Text, 
  Button, 
  Flex, 
  Code, 
  Alert, 
  AlertIcon, 
  AlertTitle, 
  AlertDescription 
} from '@chakra-ui/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <Box p={6} borderRadius="md" bg="white" boxShadow="md">
          <Alert 
            status="error" 
            variant="subtle"
            flexDirection="column"
            alignItems="center"
            justifyContent="center"
            textAlign="center"
            borderRadius="md"
            mb={6}
            p={6}
          >
            <AlertIcon boxSize="40px" mr={0} mb={4} />
            <AlertTitle mt={4} mb={3} fontSize="xl">
              Something went wrong
            </AlertTitle>
            <AlertDescription maxWidth="md">
              The dashboard encountered an error. You can try to reset the component or reload the page.
            </AlertDescription>
          </Alert>

          {this.state.error && (
            <Box mt={4} p={4} bg="gray.50" borderRadius="md">
              <Heading size="sm" mb={2}>Error details:</Heading>
              <Code p={3} w="100%" display="block" whiteSpace="pre-wrap" bg="gray.100">
                {this.state.error.toString()}
              </Code>
            </Box>
          )}

          <Flex mt={6} justifyContent="center" gap={4}>
            <Button colorScheme="blue" onClick={this.handleReset}>
              Reset Component
            </Button>
            <Button onClick={this.handleReload}>
              Reload Page
            </Button>
          </Flex>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;