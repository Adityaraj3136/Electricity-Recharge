import { useState, useEffect, useCallback } from 'react';
import type { Consumer } from '../types';
import { storage } from '../storage';

export function useConsumers() {
  const [consumers, setConsumers] = useState<Consumer[]>([]);

  const loadConsumers = useCallback(() => {
    setConsumers(storage.getConsumers());
  }, []);

  useEffect(() => {
    loadConsumers();
    
    // Listen for cross-tab changes
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'sbpdcl_consumers') {
        loadConsumers();
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [loadConsumers]);

  const addConsumer = useCallback((consumer: Omit<Consumer, 'id'>) => {
    storage.addConsumer(consumer);
    loadConsumers();
  }, [loadConsumers]);

  const updateConsumer = useCallback((id: string, updates: Partial<Consumer>) => {
    storage.updateConsumer(id, updates);
    loadConsumers();
  }, [loadConsumers]);

  const deleteConsumer = useCallback((id: string) => {
    storage.deleteConsumer(id);
    loadConsumers();
  }, [loadConsumers]);

  return {
    consumers,
    addConsumer,
    updateConsumer,
    deleteConsumer,
    refresh: loadConsumers
  };
}
