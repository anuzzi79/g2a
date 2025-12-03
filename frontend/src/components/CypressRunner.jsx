import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../services/api';
import '../styles/CypressRunner.css';

/**
 * Componente per eseguire e testare codice Cypress
 */
export function CypressRunner({ code, onClose, onLogEvent, outputFilePath }) {
  const [selectedCode, setSelectedCode] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [logs, setLogs] = useState([]);
  const codeRef = useRef(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [headedMode, setHeadedMode] = useState(true);
  const abortControllerRef = useRef(null);

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
    await runCypressCode(code, true);
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
    
    await runCypressCode(codeToRun, false);
  };

  const handleStopExecution = async () => {
    if (!running) return;
    
    try {
      onLogEvent?.('info', 'Fermata esecuzione richiesta...');
      setLogs(prev => [...prev, { type: 'info', message: 'Fermata esecuzione richiesta...', timestamp: new Date() }]);
      
      // Cancella la fetch request se ancora in corso
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      
      // Chiama l'endpoint backend per fermare il processo
      await api.stopCypressExecution();
      
      setRunning(false);
      setResults({ success: false, error: 'Esecuzione fermata dall\'utente' });
      setLogs(prev => [...prev, { 
        type: 'warning', 
        message: 'Esecuzione fermata dall\'utente', 
        timestamp: new Date() 
      }]);
      onLogEvent?.('warning', 'Esecuzione fermata dall\'utente');
    } catch (error) {
      console.error('Errore fermata esecuzione:', error);
      onLogEvent?.('error', `Errore fermata esecuzione: ${error.message}`);
    }
  };

  const runCypressCode = async (codeToRun, shouldSaveFile) => {
    setRunning(true);
    setResults(null);
    setLogs(prev => [...prev, { type: 'info', message: 'Avvio esecuzione Cypress...', timestamp: new Date() }]);
    onLogEvent?.('info', headedMode 
      ? 'Modalità visibile attiva: si aprirà un browser reale.'
      : 'Modalità headless attiva: esecuzione in background.');
    onLogEvent?.('info', 'Esecuzione codice Cypress in corso...');

    // Crea nuovo AbortController per questa esecuzione
    abortControllerRef.current = new AbortController();

    try {
      // Nota: api.runCypressCode non supporta ancora AbortSignal direttamente
      // ma possiamo comunque chiamare stopCypressExecution se necessario
      const result = await api.runCypressCode(codeToRun, targetUrl, { 
        headed: headedMode,
        keepBrowserOpen: headedMode,
        outputFilePath: shouldSaveFile && outputFilePath ? outputFilePath : null
      });
      
      setResults(result);
      setLogs(prev => [...prev, { 
        type: result.success ? 'success' : 'error', 
        message: result.success ? 'Esecuzione completata' : 'Esecuzione fallita',
        timestamp: new Date()
      }]);
      
      if (result.success) {
        onLogEvent?.('success', 'Codice Cypress eseguito con successo');
        if (result.savedFilePath) {
          onLogEvent?.('success', `File Cypress aggiornato: ${result.savedFilePath}`);
          setLogs(prev => [...prev, {
            type: 'success',
            message: `File aggiornato: ${result.savedFilePath}`,
            timestamp: new Date()
          }]);
        } else if (result.saveFileError) {
          onLogEvent?.('error', `Salvataggio file fallito: ${result.saveFileError}`);
          setLogs(prev => [...prev, {
            type: 'error',
            message: `Salvataggio file fallito: ${result.saveFileError}`,
            timestamp: new Date()
          }]);
        }
        if (result.output) {
          setLogs(prev => [...prev, { 
            type: 'info', 
            message: `Output: ${result.output.substring(0, 200)}...`,
            timestamp: new Date()
          }]);
        }
      } else {
        const errorMsg = result.error || 'Errore sconosciuto';
        
        // Se l'esecuzione è stata fermata manualmente, mostra messaggio appropriato
        if (errorMsg.includes('fermata') || errorMsg.includes('STOPPED')) {
          setResults({ success: false, error: 'Esecuzione fermata dall\'utente' });
          setLogs(prev => [...prev, { 
            type: 'warning', 
            message: 'Esecuzione fermata dall\'utente',
            timestamp: new Date()
          }]);
          onLogEvent?.('warning', 'Esecuzione fermata dall\'utente');
          return;
        }
        
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
        if (result.saveFileError) {
          onLogEvent?.('error', `Salvataggio file fallito: ${result.saveFileError}`);
        } else if (result.savedFilePath) {
          onLogEvent?.('success', `File Cypress aggiornato: ${result.savedFilePath}`);
        }
      }
    } catch (error) {
      // Se l'errore è dovuto all'abort o alla fermata manuale, non mostrarlo come errore generico
      if (error.name === 'AbortError' || 
          error.message?.includes('fermata') || 
          error.message?.includes('STOPPED') ||
          error.code === 'STOPPED') {
        // Già gestito in handleStopExecution o dal backend
        setRunning(false);
        abortControllerRef.current = null;
        return;
      }
      
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
      abortControllerRef.current = null;
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
              <button
                className="stop-execution-button"
                onClick={handleStopExecution}
                style={{
                  marginTop: '15px',
                  padding: '10px 20px',
                  backgroundColor: '#f44336',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                ⏹️ Stop the Execution
              </button>
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
                  {results.savedFilePath && (
                    <p className="saved-file">📁 File aggiornato: {results.savedFilePath}</p>
                  )}
                  {results.saveFileError && (
                    <p className="error">❌ Salvataggio file fallito: {results.saveFileError}</p>
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
                  {results.savedFilePath && (
                    <p className="saved-file">📁 File aggiornato: {results.savedFilePath}</p>
                  )}
                  {results.saveFileError && (
                    <p className="error">❌ Salvataggio file fallito: {results.saveFileError}</p>
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

