import { useState, useEffect, useCallback } from 'react';
import { useAuth } from './useAuth';

interface SearchHistoryItem {
  id: string;
  query: string;
  filters?: Record<string, any>;
  timestamp: string;
}

const MAX_HISTORY_ITEMS = 20;

interface UseSearchHistoryReturn {
  history: SearchHistoryItem[];
  addSearch: (query: string, filters?: Record<string, any>) => void;
  removeSearch: (id: string) => void;
  clearHistory: () => void;
  getRecentSearches: (limit?: number) => SearchHistoryItem[];
}

export function useSearchHistory(): UseSearchHistoryReturn {
  const { user } = useAuth();
  const [history, setHistory] = useState<SearchHistoryItem[]>([]);

  const storageKey = user ? `searchHistory_${user.id}` : 'searchHistory_guest';

  // Load history from localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Error loading search history:', e);
    }
  }, [storageKey]);

  // Save history to localStorage whenever it changes
  const saveHistory = useCallback((items: SearchHistoryItem[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch (e) {
      console.error('Error saving search history:', e);
    }
  }, [storageKey]);

  const addSearch = useCallback((query: string, filters?: Record<string, any>) => {
    if (!query.trim()) return;

    const normalizedQuery = query.trim().toLowerCase();

    setHistory((prev) => {
      // Remove duplicates
      const filtered = prev.filter((item) =>
        item.query.toLowerCase() !== normalizedQuery
      );

      const newItem: SearchHistoryItem = {
        id: Date.now().toString(),
        query: query.trim(),
        filters,
        timestamp: new Date().toISOString(),
      };

      // Add to beginning and limit to MAX_HISTORY_ITEMS
      const updated = [newItem, ...filtered].slice(0, MAX_HISTORY_ITEMS);
      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  const removeSearch = useCallback((id: string) => {
    setHistory((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      saveHistory(updated);
      return updated;
    });
  }, [saveHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    localStorage.removeItem(storageKey);
  }, [storageKey]);

  const getRecentSearches = useCallback((limit: number = 5): SearchHistoryItem[] => {
    return history.slice(0, limit);
  }, [history]);

  return {
    history,
    addSearch,
    removeSearch,
    clearHistory,
    getRecentSearches,
  };
}

export default useSearchHistory;
