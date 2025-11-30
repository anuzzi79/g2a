import React, { useState, useEffect } from 'react';
import { CSVUploader } from './components/CSVUploader';
import { ContextBuilder } from './components/ContextBuilder';
import { TestCaseBuilder } from './components/TestCaseBuilder';
import { DiagnosticsButton } from './components/DiagnosticsButton';
import { useEventLogger } from './hooks/useEventLogger';

export default function App() {
  const { events, logEvent } = useEventLogger();
  const [context, setContext] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  const [step, setStep] = useState('setup'); // 'setup' | 'testcases' | 'builder'
  const [copyMessage, setCopyMessage] = useState(null);

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

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div>
            <h1>🚀 G2A - Gherkin to Automation</h1>
            <p>Convert Gherkin test cases to Cypress automation scripts</p>
          </div>
          <DiagnosticsButton events={events} onCopy={handleCopyMessage} />
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
            <button onClick={() => setStep('setup')} className="back-button">
              ← Torna al Setup
            </button>
            <h2>Test Cases Caricati ({testCases.length})</h2>
            <div className="test-cases-list">
              {testCases.map((tc, idx) => (
                <div 
                  key={idx} 
                  className="test-case-card clickable"
                  onClick={() => {
                    setSelectedTestCase(tc);
                    setStep('builder');
                    logEvent('info', `Test case #${tc.id} selezionato`);
                  }}
                >
                  <h3>Test Case #{tc.id}</h3>
                  <p><strong>Given:</strong> {tc.given}</p>
                  <p><strong>When:</strong> {tc.when}</p>
                  <p><strong>Then:</strong> {tc.then}</p>
                  <button className="open-button">Apri Builder →</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'builder' && selectedTestCase && (
          <TestCaseBuilder
            testCase={selectedTestCase}
            context={context}
            onBack={() => {
              setStep('testcases');
              setSelectedTestCase(null);
            }}
            onLogEvent={logEvent}
          />
        )}
      </main>
    </div>
  );
}

