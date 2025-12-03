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

      // Verifica oggetti Layer EC
      const testObjects = window.g2a_testObjects || [];
      const headerObjects = testObjects.filter(obj => obj.location === 'header');
      const contentObjects = testObjects.filter(obj => obj.location === 'content');
      
      let objectsText = '';
      if (testObjects.length === 0) {
        objectsText = 'Nessun oggetto creato nel Layer EC.';
      } else {
        objectsText = `Totale oggetti: ${testObjects.length}
- Oggetti header (enunciato): ${headerObjects.length}
- Oggetti contenuto (codice): ${contentObjects.length}

Dettaglio oggetti:
${testObjects.map((obj, idx) => {
          const locationLabel = obj.location === 'header' ? 'Header (Enunciato)' : 'Contenuto (Codice)';
          const textPreview = obj.text.length > 50 ? obj.text.substring(0, 50) + '...' : obj.text;
          return `${idx + 1}. [${locationLabel}] "${textPreview}" (indici: ${obj.startIndex}-${obj.endIndex})`;
        }).join('\n')}`;
      }

      const fullText = `=== G2A Diagnostics ===
Data/Ora: ${new Date().toLocaleString('it-IT')}

--- EVENTI APPLICAZIONE (Ultimi ${last20.length}) ---

${diagnosticText}

--- LOG DI CONSOLE (Ultimi ${last50ConsoleLogs.length}) ---

${consoleText}

--- VERIFICA OGGETTI LAYER EC ---

${objectsText}

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

