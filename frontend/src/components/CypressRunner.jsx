import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../services/api';
import '../styles/CypressRunner.css';

/**
 * Componente per eseguire e testare codice Cypress
 */
export function CypressRunner({ code, onClose, onLogEvent }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [logs, setLogs] = useState([]);
  const codeRef = useRef(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [headedMode, setHeadedMode] = useState(true);

  useEffect(() => {
    // Quando il codice cambia, reimposta la selezione
    if (code) {
      setSelectedCode(code);
    }
  }, [code]);

  const handleCodeSelect = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedCode(selection.toString().trim());
      onLogEvent?.('info', `Codice selezionato (${selection.toString().trim().length} caratteri)`);
    }
  };

  const handleRunFullCode = async () => {
    if (!code || !code.trim()) {
      onLogEvent?.('error', 'Nessun codice da eseguire');
      return;
    }
    await runCypressCode(code);
  };

  const handleRunSelectedCode = async () => {
    if (!selectedCode || !selectedCode.trim()) {
      onLogEvent?.('error', 'Nessun codice selezionato');
      return;
    }

    let codeToRun = selectedCode.trim();
    
    // Se il codice selezionato non contiene cy.visit o describe, aggiungilo automaticamente
    if (!codeToRun.includes('cy.visit(') && !codeToRun.includes('describe(')) {
      let visitUrl = targetUrl || '';
      
      // Estrai URL dal codice completo originale
      if (!visitUrl && code) {
        const visitMatch = code.match(/cy\.visit\(['"]([^'"]+)['"]\)/);
        if (visitMatch) {
          visitUrl = visitMatch[1];
          onLogEvent?.('info', `🚀 Navigazione automatica rilevata dal codice completo: ${visitUrl}`);
        }
      }
      
      // Se abbiamo un URL, wrappa il codice con visit
      if (visitUrl) {
        // Wrappa in un test minimale con describe/it
        codeToRun = `describe('Test Step Isolato', () => {
  it('esegue lo step selezionato', () => {
    cy.visit('${visitUrl}');
    ${codeToRun}
  });
});`;
        onLogEvent?.('info', `✓ Esecuzione step isolato con navigazione automatica a: ${visitUrl}`);
      } else {
        // Se non c'è URL nel codice e non nel campo input, prova comunque
        // (potrebbe funzionare se la pagina è già aperta o se lo step non richiede navigazione)
        onLogEvent?.('warning', 
          '⚠️ Nessun URL trovato per la navigazione. ' +
          'Il test potrebbe fallire se richiede una pagina specifica. ' +
          'Inserisci un URL nel campo "URL Target" per garantire la navigazione.'
        );
        // Wrappa comunque in describe/it per struttura valida
        codeToRun = `describe('Test Step Isolato', () => {
  it('esegue lo step selezionato', () => {
    ${codeToRun}
  });
});`;
      }
    }
    
    await runCypressCode(codeToRun);
  };

  const runCypressCode = async (codeToRun) => {
    setRunning(true);
    setResults(null);
    setLogs(prev => [...prev, { type: 'info', message: 'Avvio esecuzione Cypress...', timestamp: new Date() }]);
    onLogEvent?.('info', headedMode 
      ? 'Modalità visibile attiva: si aprirà un browser reale.'
      : 'Modalità headless attiva: esecuzione in background.');
    onLogEvent?.('info', 'Esecuzione codice Cypress in corso...');

    try {
      const result = await api.runCypressCode(codeToRun, targetUrl, { headed: headedMode });
      
      setResults(result);
      setLogs(prev => [...prev, { 
        type: result.success ? 'success' : 'error', 
        message: result.success ? 'Esecuzione completata' : 'Esecuzione fallita',
        timestamp: new Date()
      }]);
      
      if (result.success) {
        onLogEvent?.('success', 'Codice Cypress eseguito con successo');
        if (result.output) {
          setLogs(prev => [...prev, { 
            type: 'info', 
            message: `Output: ${result.output.substring(0, 200)}...`,
            timestamp: new Date()
          }]);
        }
      } else {
        const errorMsg = result.error || 'Errore sconosciuto';
        const details = result.details ? `\n\nDettagli:\n${result.details}` : '';
        const fullError = errorMsg + details;
        
        onLogEvent?.('error', `Errore esecuzione: ${errorMsg}`);
        setLogs(prev => [...prev, { 
          type: 'error', 
          message: fullError.substring(0, 500),
          timestamp: new Date()
        }]);
        
        // Aggiungi anche l'output se disponibile
        if (result.output) {
          setLogs(prev => [...prev, { 
            type: 'info', 
            message: `Output: ${result.output.substring(0, 300)}`,
            timestamp: new Date()
          }]);
        }
      }
    } catch (error) {
      const errorMsg = `Errore esecuzione Cypress: ${error.message}`;
      setResults({ success: false, error: errorMsg });
      setLogs(prev => [...prev, { 
        type: 'error', 
        message: errorMsg,
        timestamp: new Date()
      }]);
      onLogEvent?.('error', errorMsg);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="cypress-runner-overlay" onClick={onClose}>
      <div className="cypress-runner-container" onClick={(e) => e.stopPropagation()}>
        <div className="cypress-runner-header">
          <h2>🧪 Cypress Test Runner</h2>
          <button className="close-button" onClick={onClose}>×</button>
        </div>

        <div className="cypress-runner-content">
          <div className="runner-controls">
            <div className="url-input-group">
              <label>URL Target (opzionale):</label>
              <input
                type="text"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com"
                className="url-input"
              />
            </div>
            <div className="run-buttons">
              <button
                className="run-button full"
                onClick={handleRunFullCode}
                disabled={running || !code || !code.trim()}
              >
                ▶️ Esegui Codice Completo
              </button>
              <button
                className="run-button selected"
                onClick={handleRunSelectedCode}
                disabled={running || !selectedCode || !selectedCode.trim()}
              >
                ▶️ Esegui Codice Selezionato
              </button>
            </div>
            <div className="mode-toggle">
              <label className="mode-toggle-label">
                <input
                  type="checkbox"
                  checked={headedMode}
                  onChange={(e) => setHeadedMode(e.target.checked)}
                  disabled={running}
                />
                <span>Apri browser reale (modalità visibile)</span>
              </label>
              <p className="mode-toggle-hint">
                {headedMode
                  ? 'Chrome verrà aperto sul tuo PC e mostrerà i passi del test.'
                  : 'Il test verrà eseguito in background senza aprire il browser.'}
              </p>
            </div>
          </div>

          <div className="code-preview-section">
            <h3>📝 Codice da Eseguire</h3>
            <p className="hint-text">
              💡 Seleziona una parte del codice con il mouse per testarla separatamente
            </p>
            <div 
              className="code-container selectable"
              ref={codeRef}
              onMouseUp={handleCodeSelect}
            >
              <SyntaxHighlighter
                language="javascript"
                style={vscDarkPlus}
                customStyle={{
                  margin: 0,
                  borderRadius: '8px',
                  padding: '20px',
                  cursor: 'text'
                }}
              >
                {code || '// Nessun codice disponibile'}
              </SyntaxHighlighter>
            </div>
            {selectedCode && (
              <div className="selected-code-info">
                <strong>Codice selezionato:</strong>
                <pre className="selected-code-preview">{selectedCode}</pre>
              </div>
            )}
          </div>

          {running && (
            <div className="running-indicator">
              <div className="spinner"></div>
              <p>Esecuzione in corso...</p>
            </div>
          )}

          {results && (
            <div className={`results-section ${results.success ? 'success' : 'error'}`}>
              <h3>{results.success ? '✅ Successo' : '❌ Errore'}</h3>
              {results.success ? (
                <div className="success-content">
                  <p>Il codice Cypress è stato eseguito con successo!</p>
                  {results.screenshots && results.screenshots.length > 0 && (
                    <div className="screenshots">
                      <h4>Screenshot:</h4>
                      {results.screenshots.map((screenshot, idx) => (
                        <img key={idx} src={screenshot} alt={`Screenshot ${idx + 1}`} />
                      ))}
                    </div>
                  )}
                  {results.video && (
                    <div className="video">
                      <h4>Video:</h4>
                      <video controls src={results.video} />
                    </div>
                  )}
                  {results.output && (
                    <pre className="output">{results.output}</pre>
                  )}
                </div>
              ) : (
                <div className="error-content">
                  <p><strong>Errore:</strong> {results.error}</p>
                  {results.cypressError && (
                    <div className="error-cypress">
                      <strong>⚠️ Errore Cypress:</strong>
                      <pre className="error-cypress-text">{results.cypressError}</pre>
                    </div>
                  )}
                  {results.details && (
                    <div className="error-details">
                      <strong>📋 Dettagli output:</strong>
                      <pre className="error-details-text">{results.details}</pre>
                    </div>
                  )}
                  {results.testFileContent && (
                    <div className="error-testfile">
                      <strong>📄 Codice eseguito:</strong>
                      <pre className="error-testfile-text">{results.testFileContent}</pre>
                    </div>
                  )}
                  {results.fullOutput && results.fullOutput.length > 100 && (
                    <details className="error-full-output">
                      <summary><strong>🔍 Output completo (espandi per vedere tutto)</strong></summary>
                      <pre className="error-full-output-text">{results.fullOutput}</pre>
                    </details>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="logs-section">
            <h3>📋 Logs</h3>
            <div className="logs-container">
              {logs.length === 0 ? (
                <p className="empty-logs">Nessun log disponibile</p>
              ) : (
                logs.map((log, idx) => (
                  <div key={idx} className={`log-entry ${log.type}`}>
                    <span className="log-time">
                      {log.timestamp.toLocaleTimeString()}
                    </span>
                    <span className="log-message">{log.message}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

