import React, { useState, useEffect } from 'react';
import { CSVUploader } from './components/CSVUploader';
import { ContextBuilder } from './components/ContextBuilder';
import { TestCaseBuilder } from './components/TestCaseBuilder';
import { DiagnosticsButton } from './components/DiagnosticsButton';
import { SessionManager } from './components/SessionManager';
import { useEventLogger } from './hooks/useEventLogger';
import { useConsoleLogger } from './hooks/useConsoleLogger';
import { api } from './services/api';

export default function App() {
  const { events, logEvent } = useEventLogger();
  const { getLogs } = useConsoleLogger();
  const [currentSession, setCurrentSession] = useState(null);
  const [context, setContext] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  const [step, setStep] = useState('sessions'); // 'sessions' | 'setup' | 'testcases' | 'builder'
  const [copyMessage, setCopyMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Per forzare re-render della lista
  const [loadingSession, setLoadingSession] = useState(false);

  // Carica sessione corrente all'avvio
  useEffect(() => {
    const loadCurrentSession = async () => {
      try {
        const savedSessionId = localStorage.getItem('g2a_current_session_id');
        if (savedSessionId) {
          setLoadingSession(true);
          const result = await api.getSessions();
          const session = result.sessions.find(s => s.id === savedSessionId);
          if (session) {
            setCurrentSession(session);
            await loadSessionData(session);
            setStep('setup'); // Vai direttamente al setup se c'è una sessione
          } else {
            // Sessione non trovata, rimuovi dal localStorage
            localStorage.removeItem('g2a_current_session_id');
          }
        }
      } catch (error) {
        console.error('Errore caricamento sessione:', error);
        logEvent('error', `Errore caricamento sessione: ${error.message}`);
      } finally {
        setLoadingSession(false);
      }
    };

    loadCurrentSession();
  }, []);

  // Funzione per caricare dati della sessione
  const loadSessionData = async (session) => {
    if (!session) return;

    try {
      // Carica contesto dalla sessione (se esiste)
      const contextKey = `session-${session.id}_context`;
      const savedContext = localStorage.getItem(contextKey);
      if (savedContext) {
        const parsed = JSON.parse(savedContext);
        setContext(parsed);
        logEvent('info', `Contesto caricato dalla sessione "${session.name}"`);
      }

      // Carica test cases dalla sessione (se esiste)
      const testCasesKey = `session-${session.id}_test_cases`;
      const savedTestCases = localStorage.getItem(testCasesKey);
      if (savedTestCases) {
        const parsed = JSON.parse(savedTestCases);
        setTestCases(parsed);
        logEvent('info', `${parsed.length} test cases caricati dalla sessione`);
      }
    } catch (error) {
      console.error('Errore caricamento dati sessione:', error);
      logEvent('error', `Errore caricamento dati sessione: ${error.message}`);
    }
  };

  // Log eventi importanti
  useEffect(() => {
    if (currentSession) {
      logEvent('info', `Sessione attiva: "${currentSession.name}"`);
    } else {
      logEvent('info', 'Applicazione avviata - Seleziona una sessione');
    }
  }, [currentSession, logEvent]);

  // Handler per selezione sessione
  const handleSessionSelect = async (session) => {
    setCurrentSession(session);
    if (session) {
      localStorage.setItem('g2a_current_session_id', session.id);
      // Aggiorna lastAccessed
      try {
        await api.updateSession(session.id, { lastAccessed: new Date().toISOString() });
      } catch (error) {
        console.error('Errore aggiornamento lastAccessed:', error);
      }
      await loadSessionData(session);
      setStep('setup');
      logEvent('info', `Sessione "${session.name}" selezionata`);
    } else {
      localStorage.removeItem('g2a_current_session_id');
      setContext(null);
      setTestCases([]);
      setStep('sessions');
    }
  };

  const handleContextReady = (extractedContext) => {
    setContext(extractedContext);
    
    if (currentSession) {
      // Salva con prefisso sessione
      const contextKey = `session-${currentSession.id}_context`;
      localStorage.setItem(contextKey, JSON.stringify(extractedContext));
      
      // Salva anche nel file della sessione (via backend se necessario)
      logEvent('success', 'Contesto Cypress estratto con successo', {
        selectors: extractedContext.selectors?.length || 0,
        methods: extractedContext.methods?.length || 0,
        files: extractedContext.filesAnalyzed?.length || 0,
        session: currentSession.name
      });
    } else {
      // Fallback al vecchio sistema (per compatibilità)
      localStorage.setItem('g2a_context', JSON.stringify(extractedContext));
      logEvent('success', 'Contesto Cypress estratto con successo', {
        selectors: extractedContext.selectors?.length || 0,
        methods: extractedContext.methods?.length || 0,
        files: extractedContext.filesAnalyzed?.length || 0
      });
    }
  };

  const handleCSVLoaded = (parsedCases, fileName) => {
    setTestCases(parsedCases);
    
    // Salva test cases nella sessione
    if (currentSession) {
      const testCasesKey = `session-${currentSession.id}_test_cases`;
      localStorage.setItem(testCasesKey, JSON.stringify(parsedCases));
    }
    
    setStep('testcases');
    logEvent('success', `CSV caricato: ${parsedCases.length} test cases`, { fileName });
  };

  const handleCopyMessage = (message) => {
    setCopyMessage(message);
    setTimeout(() => setCopyMessage(null), 3000);
  };

  const handleUpdateTestCase = (testCaseId, updates) => {
    if (!testCaseId || !updates) return;
    setTestCases(prev =>
      prev.map(tc => (tc.id === testCaseId ? { ...tc, ...updates } : tc))
    );
    setSelectedTestCase(prev =>
      prev && prev.id === testCaseId ? { ...prev, ...updates } : prev
    );
  };

  // Funzione per ottenere metadati Global Autocomplete
  const getGlobalAutocompleteMetadata = (testCaseId) => {
    if (!currentSession) return null;
    
    const metadataKey = `session-${currentSession.id}_global_autocomplete_metadata`;
    const saved = localStorage.getItem(metadataKey);
    
    if (!saved) return null;
    
    const metadata = JSON.parse(saved);
    return metadata[testCaseId] || null;
  };

  // Listener per aggiornamento lista dopo Global Autocomplete
  useEffect(() => {
    const handleGlobalAutocompleteCompleted = () => {
      setRefreshKey(prev => prev + 1); // Forza re-render della lista
    };
    
    window.addEventListener('global-autocomplete-completed', handleGlobalAutocompleteCompleted);
    
    return () => {
      window.removeEventListener('global-autocomplete-completed', handleGlobalAutocompleteCompleted);
    };
  }, []);

  // Funzione per verificare se un test case ha automazione pronta
  const checkAutomationStatus = (testCaseId) => {
    if (!testCaseId) return 'pending';
    
    try {
      // Usa prefisso sessione se disponibile
      const stateKey = currentSession 
        ? `session-${currentSession.id}_test_state_${testCaseId}`
        : `g2a_test_state_${testCaseId}`;
      const saved = localStorage.getItem(stateKey);
      
      if (!saved) {
        return 'pending';
      }
      
      const parsed = JSON.parse(saved);
      
      // Verifica che tutte e tre le fasi abbiano codice
      const hasGivenCode = parsed.blockStates?.given?.code && parsed.blockStates.given.code.trim().length > 0;
      const hasWhenCode = parsed.blockStates?.when?.code && parsed.blockStates.when.code.trim().length > 0;
      const hasThenCode = parsed.blockStates?.then?.code && parsed.blockStates.then.code.trim().length > 0;
      
      // Verifica che sia stato fatto Save
      const hasBeenSaved = parsed.saved === true || parsed.lastSaved;
      
      if (hasGivenCode && hasWhenCode && hasThenCode && hasBeenSaved) {
        return 'ready';
      }
      
      return 'pending';
    } catch (error) {
      console.error('Errore verifica stato automazione:', error);
      return 'pending';
    }
  };

  // Funzione per costruire il codice completo di un test case
  const buildCompleteTestCodeForExport = (testCase) => {
    if (!testCase?.id) return '';
    
    try {
      // Usa prefisso sessione se disponibile
      const stateKey = currentSession 
        ? `session-${currentSession.id}_test_state_${testCase.id}`
        : `g2a_test_state_${testCase.id}`;
      const saved = localStorage.getItem(stateKey);
      
      if (!saved) return '';
      
      const parsed = JSON.parse(saved);
      const givenCode = parsed.blockStates?.given?.code || '';
      const whenCode = parsed.blockStates?.when?.code || '';
      const thenCode = parsed.blockStates?.then?.code || '';
      
      if (!givenCode && !whenCode && !thenCode) {
        return '';
      }

      // Estrai il body di ogni fase (simile alla logica in TestCaseBuilder)
      const extractBody = (code, phaseType = null) => {
        if (!code) return '';
        
        let cleaned = code.trim();
        
        // Rimuovi wrapper describe/it se presenti
        const itMatch = cleaned.match(/it\([^)]*\)\s*=>\s*\{?\s*([\s\S]*?)\s*\}?\s*\}\)?\s*;?\s*$/);
        if (itMatch) {
          cleaned = itMatch[1].trim();
        } else {
          cleaned = cleaned.replace(/describe\([^)]*\)\s*=>\s*\{?\s*/g, '');
        }
        
        // Rimuovi TUTTE le chiusure finali (iterativo)
        let previousLength = cleaned.length;
        do {
          previousLength = cleaned.length;
          cleaned = cleaned.replace(/\s*\}\)?\s*;?\s*$/g, '');
          cleaned = cleaned.replace(/\s*\}\s*$/g, '');
          cleaned = cleaned.replace(/\s*\)\s*;?\s*$/g, '');
          cleaned = cleaned.trim();
        } while (cleaned.length < previousLength && cleaned.length > 0);
        
        // Rimuovi commenti di fase e log duplicati
        cleaned = cleaned
          .replace(/\/\/\s*=====\s*(GIVEN|WHEN|THEN)\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"][🔵🟡🟢]\s*(GIVEN|WHEN|THEN):.*?['"]\);/g, '')
          .trim();
        
        // Per WHEN e THEN: rimuovi cy.visit()
        if (phaseType === 'when' || phaseType === 'then') {
          cleaned = cleaned.split('\n')
            .filter(line => {
              const trimmed = line.trim();
              return !(trimmed.includes('cy.visit(') && !trimmed.startsWith('//'));
            })
            .join('\n');
        }
        
        // Rimuovi placeholder
        cleaned = cleaned.split('\n')
          .filter(line => {
            const trimmed = line.trim();
            return !(trimmed.includes('URL_DELLA_TUA_PAGINA') || 
                    trimmed.includes('SOSTITUISCI') || 
                    trimmed.includes('REPLACE'));
          })
          .join('\n');
        
        return cleaned.trim();
      };

      const givenBody = extractBody(givenCode);
      const whenBody = extractBody(whenCode, 'when');
      const thenBody = extractBody(thenCode, 'then');

      const buildPhaseLines = (cleanBody, phaseLabel, emoji, statement) => {
        const lines = [
          `    // ===== ${phaseLabel} PHASE =====`,
          `    cy.log('${emoji} ${phaseLabel}: ${statement}');`
        ];

        if (!cleanBody) {
          return lines;
        }

        const rawLines = cleanBody.split('\n');
        const hasContent = rawLines.some(line => line.trim().length > 0);
        if (!hasContent) {
          return lines;
        }

        rawLines.forEach(line => {
          const trimmedEnd = line.replace(/\s+$/g, '');
          if (trimmedEnd.trim().length === 0) {
            lines.push('');
          } else {
            lines.push(`    ${trimmedEnd}`);
          }
        });

        return lines;
      };

      const appendPhaseBlock = (collector, blockLines) => {
        if (!blockLines.length) return collector;
        if (collector.length > 0) {
          collector.push('');
        }
        collector.push(...blockLines);
        return collector;
      };

      const testName = `Test Case #${testCase.id}`;
      const testDescription = `${testCase.given} | ${testCase.when} | ${testCase.then}`.substring(0, 100);
      
      let completeCode = `describe('${testName}', () => {\n`;
      completeCode += `  it('${testDescription}', () => {\n`;

      let phaseLines = [];

      if (givenBody) {
        const cleanGiven = givenBody
          .replace(/\/\/\s*=====\s*GIVEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🔵\s*GIVEN:.*?['"]\);/g, '')
          .trim();
        const lines = buildPhaseLines(cleanGiven, 'GIVEN', '🔵', testCase.given);
        phaseLines = appendPhaseBlock(phaseLines, lines);
      }
      if (whenBody) {
        const cleanWhen = whenBody
          .replace(/\/\/\s*=====\s*WHEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🟡\s*WHEN:.*?['"]\);/g, '')
          .split('\n')
          .filter(line => !line.trim().includes('cy.visit(') || line.trim().startsWith('//'))
          .join('\n')
          .trim();
        const lines = buildPhaseLines(cleanWhen, 'WHEN', '🟡', testCase.when);
        phaseLines = appendPhaseBlock(phaseLines, lines);
      }
      if (thenBody) {
        const cleanThen = thenBody
          .replace(/\/\/\s*=====\s*THEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🟢\s*THEN:.*?['"]\);/g, '')
          .split('\n')
          .filter(line => !line.trim().includes('cy.visit(') || line.trim().startsWith('//'))
          .join('\n')
          .trim();
        const lines = buildPhaseLines(cleanThen, 'THEN', '🟢', testCase.then);
        phaseLines = appendPhaseBlock(phaseLines, lines);
      }

      if (phaseLines.length) {
        completeCode += `${phaseLines.join('\n')}\n`;
      }

      completeCode += `  });\n`;
      completeCode += `});`;

      return completeCode;
    } catch (error) {
      console.error('Errore costruzione codice completo:', error);
      return '';
    }
  };

  // Funzione per esportare CSV
  const handleExportCSV = () => {
    if (testCases.length === 0) {
      logEvent('warning', 'Nessun test case da esportare');
      return;
    }

    try {
      // Intestazioni CSV
      const headers = ['numero', 'Given', 'When', 'Then', 'Automation'];
      
      // Funzione per escape CSV (gestisce newline e virgolette)
      const escapeCSV = (value) => {
        if (!value) return '';
        const stringValue = String(value);
        // Se contiene newline, virgolette o virgole, racchiudilo tra virgolette doppie
        if (stringValue.includes('\n') || stringValue.includes('"') || stringValue.includes(',')) {
          // Sostituisci le virgolette doppie con doppie virgolette doppie (standard CSV)
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      // Costruisci le righe CSV
      const rows = testCases.map(tc => {
        const automationCode = buildCompleteTestCodeForExport(tc);
        return [
          tc.id || '',
          escapeCSV(tc.given || ''),
          escapeCSV(tc.when || ''),
          escapeCSV(tc.then || ''),
          escapeCSV(automationCode)
        ];
      });

      // Combina headers e rows
      const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
      ].join('\n');

      // Crea blob e download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `g2a_test_cases_export_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      logEvent('success', `CSV esportato: ${testCases.length} test cases`);
    } catch (error) {
      console.error('Errore esportazione CSV:', error);
      logEvent('error', `Errore esportazione CSV: ${error.message}`);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>🚀 G2A - Gherkin to Automation</h1>
            <p>Convert Gherkin test cases to Cypress automation scripts</p>
            {currentSession && (
              <p className="current-session-indicator">
                📁 Sessione attiva: <strong>{currentSession.name}</strong>
              </p>
            )}
          </div>
          <div className="header-actions">
            {currentSession && step !== 'sessions' && (
              <button 
                className="sessions-button"
                onClick={() => setStep('sessions')}
                title="Gestisci sessioni"
              >
                📁 Sessioni
              </button>
            )}
            <DiagnosticsButton events={events} onCopy={handleCopyMessage} consoleLogs={getLogs()} />
          </div>
        </div>
        {copyMessage && <div className="copy-message">{copyMessage}</div>}
      </header>

      <main className="app-main">
        {step === 'sessions' && (
          <SessionManager
            currentSession={currentSession}
            onSessionSelect={handleSessionSelect}
            onLogEvent={logEvent}
          />
        )}

        {step === 'setup' && currentSession && (
          <div className="landing">
            <ContextBuilder onContextReady={handleContextReady} onLogEvent={logEvent} />
            <CSVUploader onCSVLoaded={handleCSVLoaded} onLogEvent={logEvent} />
          </div>
        )}

        {step === 'setup' && !currentSession && (
          <div className="no-session-warning">
            <h2>⚠️ Nessuna sessione selezionata</h2>
            <p>Seleziona o crea una sessione per iniziare a lavorare.</p>
            <button 
              className="go-to-sessions-button"
              onClick={() => setStep('sessions')}
            >
              Vai alle Sessioni →
            </button>
          </div>
        )}

        {step === 'testcases' && testCases.length > 0 && (
          <div className="test-cases-view">
            <div className="test-cases-header">
              <button onClick={() => setStep('setup')} className="back-button">
                ← Torna al Setup
              </button>
              <button onClick={handleExportCSV} className="export-csv-button">
                📥 CSV Export
              </button>
            </div>
            <h2>Test Cases Caricati ({testCases.length})</h2>
            <div className="test-cases-list" key={refreshKey}>
              {testCases.map((tc, idx) => {
                const automationStatus = checkAutomationStatus(tc.id);
                const globalAutocompleteMeta = getGlobalAutocompleteMetadata(tc.id);
                return (
                  <div 
                    key={idx} 
                    className="test-case-card clickable"
                    onClick={() => {
                      setSelectedTestCase(tc);
                      setStep('builder');
                      logEvent('info', `Test case #${tc.id} selezionato`);
                    }}
                  >
                    <div className="test-case-card-header">
                      <h3>Test Case #{tc.id}</h3>
                      <div 
                        className={`automation-status ${automationStatus}`}
                        title={automationStatus === 'ready' ? 'Automation Ready' : 'Automation Pending'}
                      >
                        <span className="status-dot"></span>
                        <span className="status-text">
                          {automationStatus === 'ready' ? 'Automation Ready' : 'Automation Pending'}
                        </span>
                      </div>
                    </div>
                    
                    {/* Indicatori Global Autocomplete */}
                    {globalAutocompleteMeta && (
                      <div className="global-autocomplete-indicators" style={{
                        marginBottom: '10px',
                        padding: '8px',
                        backgroundColor: '#e8f5e9',
                        borderRadius: '4px',
                        fontSize: '12px',
                        borderLeft: '3px solid #4caf50'
                      }}>
                        <strong>✨ Completato da Global Autocomplete:</strong>
                        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {globalAutocompleteMeta.given && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#4caf50', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>Given</span>
                          )}
                          {globalAutocompleteMeta.when && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#4caf50', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>When</span>
                          )}
                          {globalAutocompleteMeta.then && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#4caf50', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>Then</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <p><strong>Given:</strong> {tc.given}</p>
                    <p><strong>When:</strong> {tc.when}</p>
                    <p><strong>Then:</strong> {tc.then}</p>
                    <button className="open-button">Apri Builder →</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {step === 'builder' && selectedTestCase && (
          <TestCaseBuilder
            testCase={selectedTestCase}
            context={context}
            currentSession={currentSession}
            onUpdateTestCase={handleUpdateTestCase}
            onBack={() => {
              setStep('testcases');
              setSelectedTestCase(null);
              setRefreshKey(prev => prev + 1); // Forza aggiornamento lista
            }}
            onLogEvent={logEvent}
          />
        )}
      </main>
    </div>
  );
}

