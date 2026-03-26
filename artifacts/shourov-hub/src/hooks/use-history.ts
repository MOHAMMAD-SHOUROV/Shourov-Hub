import { useState, useEffect } from 'react';

export interface DownloadHistoryItem {
  id: string;
  title: string;
  platform: string;
  thumbnail?: string;
  format: string;
  timestamp: number;
  url: string;
}

const HISTORY_KEY = 'shourov-hub-history';

export function useDownloadHistory() {
  const [history, setHistory] = useState<DownloadHistoryItem[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(HISTORY_KEY);
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error('Failed to load history', e);
    }
  }, []);

  const addHistoryItem = (item: Omit<DownloadHistoryItem, 'id' | 'timestamp'>) => {
    const newItem: DownloadHistoryItem = {
      ...item,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    };
    
    setHistory(prev => {
      const newHistory = [newItem, ...prev].slice(0, 20); // Keep last 20
      localStorage.setItem(HISTORY_KEY, JSON.stringify(newHistory));
      return newHistory;
    });
  };

  const clearHistory = () => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  };

  return { history, addHistoryItem, clearHistory };
}
