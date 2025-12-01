import React, { useState, useEffect } from 'react';
import { CSVUploader } from './components/CSVUploader';
import { ContextBuilder } from './components/ContextBuilder';
import { TestCaseBuilder } from './components/TestCaseBuilder';
import { DiagnosticsButton } from './components/DiagnosticsButton';
import { useEventLogger } from './hooks/useEventLogger';
import { useConsoleLogger } from './hooks/useConsoleLogger';

export default function App() {
  const { events, logEvent } = useEventLogger();
  const { getLogs } = useConsoleLogger();
  const [context, setContext] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  const [step, setStep] = useState('setup'); // 'setup' | 'testcases' | 'builder'
  const [copyMessage, setCopyMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Per forzare re-render della lista

  // Carica contesto da localStorage se disponibile
  useEffect(() => {
    try {
      const savedContext = localStorage.getItem('g2a_context');
      if (savedContext) {
        const parsed = JSON.parse(savedContext);
        setContext(parsed);
        logEvent('info', 'Contesto caricato da localStorage');
      }
    } catch (error) {
      console.error('Errore caricamento contesto:', error);
    }
  }, []);

  // Log eventi importanti
  useEffect(() => {
    logEvent('info', 'Applicazione avviata');
  }, [logEvent]);

  const handleContextReady = (extractedContext) => {
    setContext(extractedContext);
    localStorage.setItem('g2a_context', JSON.stringify(extractedContext));
    logEvent('success', 'Contesto Cypress estratto con successo', {
      selectors: extractedContext.selectors?.length || 0,
      methods: extractedContext.methods?.length || 0,
      files: extractedContext.filesAnalyzed?.length || 0
    });
  };

  const handleCSVLoaded = (parsedCases, fileName) => {
    setTestCases(parsedCases);
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

  // Funzione per verificare se un test case ha automazione pronta
  const checkAutomationStatus = (testCaseId) => {
    if (!testCaseId) return 'pending';
    
    try {
      const stateKey = `g2a_test_state_${testCaseId}`;
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
      const stateKey = `g2a_test_state_${testCase.id}`;
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

      const testName = `Test Case #${testCase.id}`;
      const testDescription = `${testCase.given} | ${testCase.when} | ${testCase.then}`.substring(0, 100);
      
      let completeCode = `describe('${testName}', () => {\n`;
      completeCode += `  it('${testDescription}', () => {\n`;

      if (givenBody) {
        completeCode += `    // ===== GIVEN PHASE =====\n`;
        completeCode += `    cy.log('🔵 GIVEN: ${testCase.given}');\n`;
        const cleanGiven = givenBody
          .replace(/\/\/\s*=====\s*GIVEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🔵\s*GIVEN:.*?['"]\);/g, '')
          .trim();
        if (cleanGiven) {
          const indentedGiven = cleanGiven.split('\n').map(line => `    ${line}`).join('\n');
          completeCode += `${indentedGiven}\n\n`;
        }
      }
      if (whenBody) {
        completeCode += `    // ===== WHEN PHASE =====\n`;
        completeCode += `    cy.log('🟡 WHEN: ${testCase.when}');\n`;
        const cleanWhen = whenBody
          .replace(/\/\/\s*=====\s*WHEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🟡\s*WHEN:.*?['"]\);/g, '')
          .trim();
        if (cleanWhen) {
          const indentedWhen = cleanWhen.split('\n').map(line => `    ${line}`).join('\n');
          completeCode += `${indentedWhen}\n\n`;
        }
      }
      if (thenBody) {
        completeCode += `    // ===== THEN PHASE =====\n`;
        completeCode += `    cy.log('🟢 THEN: ${testCase.then}');\n`;
        const cleanThen = thenBody
          .replace(/\/\/\s*=====\s*THEN\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"]🟢\s*THEN:.*?['"]\);/g, '')
          .trim();
        if (cleanThen) {
          const indentedThen = cleanThen.split('\n').map(line => `    ${line}`).join('\n');
          completeCode += `${indentedThen}\n`;
        }
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
          </div>
          <DiagnosticsButton events={events} onCopy={handleCopyMessage} consoleLogs={getLogs()} />
        </div>
        {copyMessage && <div className="copy-message">{copyMessage}</div>}
      </header>

      <main className="app-main">
        {step === 'setup' && (
          <div className="landing">
            <ContextBuilder onContextReady={handleContextReady} onLogEvent={logEvent} />
            <CSVUploader onCSVLoaded={handleCSVLoaded} onLogEvent={logEvent} />
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

