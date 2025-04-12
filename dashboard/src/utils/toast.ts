import { useToast, UseToastOptions } from '@chakra-ui/react';
import { useCallback } from 'react';

interface ToastOptions extends Omit<UseToastOptions, 'status'> {
  title?: string;
  description?: string;
}

export function useNotifications() {
  const toast = useToast();

  const success = useCallback((options: ToastOptions) => {
    toast({
      status: 'success',
      isClosable: true,
      position: 'top-right',
      duration: 5000,
      ...options,
    });
  }, [toast]);

  const error = useCallback((options: ToastOptions) => {
    toast({
      status: 'error',
      isClosable: true,
      position: 'top-right',
      duration: 8000,
      ...options,
    });
  }, [toast]);

  const warning = useCallback((options: ToastOptions) => {
    toast({
      status: 'warning',
      isClosable: true,
      position: 'top-right',
      duration: 6000,
      ...options,
    });
  }, [toast]);

  const info = useCallback((options: ToastOptions) => {
    toast({
      status: 'info',
      isClosable: true,
      position: 'top-right',
      duration: 5000,
      ...options,
    });
  }, [toast]);

  return { success, error, warning, info };
}