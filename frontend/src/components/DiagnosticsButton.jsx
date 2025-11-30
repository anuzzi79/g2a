import { useState } from 'react';

/**
 * Pulsante CD (Copia Diagnostica) - Copia ultimi 20 eventi
 */
export function DiagnosticsButton({ events, onCopy }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      const last20 = events.slice(0, 20);
      
      const diagnosticText = last20
        .map(event => {
          const time = new Date(event.timestamp).toLocaleString('it-IT');
          const dataStr = event.data ? `\n  Data: ${JSON.stringify(event.data, null, 2)}` : '';
          return `[${time}] ${event.type.toUpperCase()}: ${event.message}${dataStr}`;
        })
        .join('\n\n') || 'Nessun evento registrato';

      const fullText = `=== G2A Diagnostics - Ultimi ${last20.length} eventi ===\n\n${diagnosticText}\n\n=== Fine Diagnostics ===`;

      await navigator.clipboard.writeText(fullText);
      setCopied(true);
      onCopy?.('Eventi copiati nella clipboard!');
      
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
      title="Copia Diagnostica - Copia ultimi 20 eventi nella clipboard"
    >
      {copied ? '✓ Copiato!' : '📋 CD'}
    </button>
  );
}

