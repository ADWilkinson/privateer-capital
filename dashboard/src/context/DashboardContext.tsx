import React, { createContext, useContext, useState, ReactNode, useEffect, useReducer } from 'react';
import { cacheService } from '../utils/cache';
import { triggerSyncPositions } from '../services/api';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

// Enhanced Types
export interface SyncStatus {
  isInSync: boolean;
  lastSynced: number | null;
  syncActions: number;
  loading: boolean;
  error: Error | null;
}

export interface UserPreferences {
  sidebarCollapsed: boolean;
  refreshInterval: number;
  theme: 'light' | 'dark';
  defaultTimeframe: '1d' | '7d' | '30d' | 'all';
}

export interface DashboardContextType {
  // UI preferences
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  toggleSidebar: () => void;
  toggleTheme: () => void;
  
  // Sync status and actions
  syncStatus: SyncStatus;
  syncPositions: () => Promise<void>;
  
  // Data cache controls
  clearCache: () => void;
  isDataRefreshing: boolean;
  refreshData: () => void;
}

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  sidebarCollapsed: false,
  refreshInterval: 30000, // 30 seconds
  theme: 'light',
  defaultTimeframe: '7d'
};

// Initial sync status
const INITIAL_SYNC_STATUS: SyncStatus = {
  isInSync: true,
  lastSynced: null,
  syncActions: 0,
  loading: false,
  error: null
};

// Load preferences from localStorage
const loadPreferences = (): UserPreferences => {
  try {
    const savedPrefs = localStorage.getItem('dashboardPreferences');
    if (savedPrefs) {
      return { ...DEFAULT_PREFERENCES, ...JSON.parse(savedPrefs) };
    }
  } catch (e) {
    console.error('Error loading preferences:', e);
  }
  return DEFAULT_PREFERENCES;
};

// Actions
type SyncAction = 
  | { type: 'SYNC_START' }
  | { type: 'SYNC_SUCCESS', payload: { lastSynced: number, syncActions: number } }
  | { type: 'SYNC_FAILURE', payload: Error }
  | { type: 'UPDATE_SYNC_STATUS', payload: Partial<SyncStatus> };

// Reducer
function syncReducer(state: SyncStatus, action: SyncAction): SyncStatus {
  switch (action.type) {
    case 'SYNC_START':
      return { ...state, loading: true, error: null };
    case 'SYNC_SUCCESS':
      return { 
        ...state, 
        loading: false, 
        error: null, 
        isInSync: true,
        lastSynced: action.payload.lastSynced,
        syncActions: action.payload.syncActions
      };
    case 'SYNC_FAILURE':
      return { ...state, loading: false, error: action.payload };
    case 'UPDATE_SYNC_STATUS':
      return { ...state, ...action.payload };
    default:
      return state;
  }
}

// Context creation
const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export const DashboardProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // State management
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [syncState, syncDispatch] = useReducer(syncReducer, INITIAL_SYNC_STATUS);
  const [isDataRefreshing, setIsDataRefreshing] = useState(false);
  
  // Save preferences to localStorage when they change
  useEffect(() => {
    localStorage.setItem('dashboardPreferences', JSON.stringify(preferences));
    
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', preferences.theme);
  }, [preferences]);
  
  // Set up Firestore listener for sync status
  useEffect(() => {
    // Listen to the most recent bot event for sync status
    const q = collection(db, "botEvents");
    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Find the most recent sync event
      const syncEvents = snapshot.docs
        .map(doc => {
          const data = doc.data();
          return { 
            id: doc.id, 
            type: data.type || data.eventType,
            timestamp: data.timestamp,
            data: data.data
          };
        })
        .filter(event => event.type === 'position_sync_completed')
        .sort((a, b) => b.timestamp - a.timestamp);
      
      if (syncEvents.length > 0) {
        const mostRecentSync = syncEvents[0];
        syncDispatch({
          type: 'UPDATE_SYNC_STATUS',
          payload: {
            isInSync: true,
            lastSynced: mostRecentSync.timestamp,
            syncActions: mostRecentSync.data?.syncActions || 0
          }
        });
      }
    }, (error) => {
      console.error("Error in sync status listener:", error);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Clear cache when refreshInterval changes
  useEffect(() => {
    cacheService.clearAll();
  }, [preferences.refreshInterval]);
  
  // Preference updater
  const updatePreference = <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
  };
  
  // Sidebar toggle
  const toggleSidebar = () => {
    updatePreference('sidebarCollapsed', !preferences.sidebarCollapsed);
  };
  
  // Theme toggle
  const toggleTheme = () => {
    updatePreference('theme', preferences.theme === 'light' ? 'dark' : 'light');
  };
  
  // Sync positions
  const syncPositions = async () => {
    syncDispatch({ type: 'SYNC_START' });
    try {
      setIsDataRefreshing(true);
      const result = await triggerSyncPositions();
      syncDispatch({ 
        type: 'SYNC_SUCCESS', 
        payload: { 
          lastSynced: Date.now(), 
          syncActions: result?.syncActions || 0 
        } 
      });
      return result;
    } catch (error) {
      syncDispatch({ type: 'SYNC_FAILURE', payload: error as Error });
      throw error;
    } finally {
      setIsDataRefreshing(false);
    }
  };
  
  // Clear cache
  const clearCache = () => {
    cacheService.clearAll();
  };
  
  // Data refresh
  const refreshData = () => {
    setIsDataRefreshing(true);
    clearCache();
    // This will trigger all react-query hooks to refetch
    setTimeout(() => setIsDataRefreshing(false), 500);
  };
  
  return (
    <DashboardContext.Provider
      value={{
        // UI preferences
        preferences,
        updatePreference,
        toggleSidebar,
        toggleTheme,
        
        // Sync status and actions
        syncStatus: syncState,
        syncPositions,
        
        // Data cache controls
        clearCache,
        isDataRefreshing,
        refreshData,
      }}
    >
      {children}
    </DashboardContext.Provider>
  );
};

export const useDashboard = (): DashboardContextType => {
  const context = useContext(DashboardContext);
  if (context === undefined) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
};