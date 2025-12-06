import { useEffect, useRef } from 'react';

const MAX_CONSOLE_LOGS = 50; // Mantieni più log di console rispetto agli eventi
const STORAGE_KEY = 'g2a_console_logs';

/**
 * Hook per intercettare e salvare i log di console
 */
export function useConsoleLogger() {
  const logsRef = useRef(() => {
    // Carica log salvati da localStorage
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    // Salva i log originali
    const originalLog = console.log.bind(console);
    const originalError = console.error.bind(console);
    const originalWarn = console.warn.bind(console);
    const originalInfo = console.info.bind(console);
    const originalDebug = console.debug.bind(console);

    // Funzione per salvare un log
    const saveLog = (level, args) => {
      try {
        const timestamp = new Date().toISOString();
        const message = args
          .map(arg => {
            if (typeof arg === 'object') {
              try {
                return JSON.stringify(arg, null, 2);
              } catch {
                return String(arg);
              }
            }
            return String(arg);
          })
          .join(' ');

        const logEntry = {
          id: Date.now() + Math.random(),
          timestamp,
          level, // 'log', 'error', 'warn', 'info', 'debug'
          message,
          raw: args.map(arg => {
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
        };

        const currentLogs = logsRef.current();
        const newLogs = [logEntry, ...currentLogs].slice(0, MAX_CONSOLE_LOGS);
        logsRef.current = () => newLogs;

        // Salva in localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(newLogs));
        } catch (e) {
          // Ignora errori di localStorage (potrebbe essere pieno)
        }
      } catch (error) {
        // Non loggare errori del logger stesso per evitare loop infiniti
      }
    };

    // Intercetta console.log
    console.log = (...args) => {
      saveLog('log', args);
      originalLog(...args);
    };

    // Intercetta console.error
    console.error = (...args) => {
      saveLog('error', args);
      originalError(...args);
    };

    // Intercetta console.warn
    console.warn = (...args) => {
      saveLog('warn', args);
      originalWarn(...args);
    };

    // Intercetta console.info
    console.info = (...args) => {
      saveLog('info', args);
      originalInfo(...args);
    };

    // Intercetta console.debug
    console.debug = (...args) => {
      saveLog('debug', args);
      originalDebug(...args);
    };

    // Cleanup: ripristina i metodi originali quando il componente viene smontato
    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
      console.info = originalInfo;
      console.debug = originalDebug;
    };
  }, []);

  const getLogs = () => {
    return logsRef.current();
  };

  const clearLogs = () => {
    logsRef.current = () => [];
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (e) {
      // Ignora errori
    }
  };

  return {
    getLogs,
    clearLogs
  };
}



