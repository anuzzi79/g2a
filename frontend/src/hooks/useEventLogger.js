import { useState, useCallback, useRef, useEffect } from 'react';

const MAX_EVENTS = 20;
const STORAGE_KEY = 'g2a_event_log';

/**
 * Hook per logging eventi dell'applicazione
 * Mantiene gli ultimi 20 eventi e li salva in localStorage
 */
export function useEventLogger() {
  const [events, setEvents] = useState(() => {
    // Carica eventi salvati da localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Salva eventi in localStorage quando cambiano
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(events));
    } catch (error) {
      console.error('Errore salvataggio eventi:', error);
    }
  }, [events]);

  const logEvent = useCallback((type, message, data = null) => {
    const event = {
      id: Date.now() + Math.random(),
      timestamp: new Date().toISOString(),
      type, // 'info', 'success', 'error', 'warning'
      message,
      data
    };

    setEvents(prev => {
      const newEvents = [event, ...prev].slice(0, MAX_EVENTS);
      return newEvents;
    });
  }, []);

  const clearEvents = useCallback(() => {
    setEvents([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const getLastEvents = useCallback((count = MAX_EVENTS) => {
    return events.slice(0, count);
  }, [events]);

  return {
    events,
    logEvent,
    clearEvents,
    getLastEvents
  };
}





