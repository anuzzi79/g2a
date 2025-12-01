import { useState } from 'react';

/**
 * Pulsante CD (Copia Diagnostica) - Copia ultimi 20 eventi + log di console
 */
export function DiagnosticsButton({ events, onCopy, consoleLogs = [] }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const last20 = events.slice(0, 20);
      const last50ConsoleLogs = consoleLogs.slice(0, 50);
      
      // Formatta eventi
      const diagnosticText = last20
        .map(event => {
          const time = new Date(event.timestamp).toLocaleString('it-IT');
          const dataStr = event.data ? `\n  Data: ${JSON.stringify(event.data, null, 2)}` : '';
          return `[${time}] ${event.type.toUpperCase()}: ${event.message}${dataStr}`;
        })
        .join('\n\n') || 'Nessun evento registrato';

      // Formatta log di console
      const consoleText = last50ConsoleLogs
        .map(log => {
          const time = new Date(log.timestamp).toLocaleString('it-IT');
          const levelIcon = {
            'error': '❌',
            'warn': '⚠️',
            'info': 'ℹ️',
            'debug': '🔍',
            'log': '📝'
          }[log.level] || '📝';
          return `[${time}] ${levelIcon} CONSOLE.${log.level.toUpperCase()}: ${log.message}`;
        })
        .join('\n') || 'Nessun log di console';

      const fullText = `=== G2A Diagnostics ===
Data/Ora: ${new Date().toLocaleString('it-IT')}

--- EVENTI APPLICAZIONE (Ultimi ${last20.length}) ---

${diagnosticText}

--- LOG DI CONSOLE (Ultimi ${last50ConsoleLogs.length}) ---

${consoleText}

=== Fine Diagnostics ===`;

      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      onCopy?.('Diagnostica completa copiata nella clipboard!');
      
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Errore copia diagnostica:', error);
      onCopy?.('Errore durante la copia');
    }
  };

  return (
    <button 
      onClick={handleCopy}
      className="diagnostics-button"
      title="Copia Diagnostica - Copia ultimi 20 eventi + log di console nella clipboard"
    >
      {copied ? '✓ Copiato!' : '📋 CD'}
    </button>
  );
}

