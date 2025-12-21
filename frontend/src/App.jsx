import React, { useState, useEffect } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import { CSVUploader } from './components/CSVUploader';
import { ContextBuilder } from './components/ContextBuilder';
import { TestCaseBuilder } from './components/TestCaseBuilder';
import { DiagnosticsButton } from './components/DiagnosticsButton';
import { SessionManager } from './components/SessionManager';
import { ECObjectsView } from './components/ECObjectsView';
import { BinomiView } from './components/BinomiView';
import { ContextDocumentView } from './components/ContextDocumentView';
import { BusinessSpecView } from './components/BusinessSpecView';
import { LLMMatchReviewModal } from './components/LLMMatchReviewModal';
import { GherkinTextWithHighlights } from './components/GherkinTextWithHighlights';
import CypressConfigPage from './components/CypressConfigPage';
import { useEventLogger } from './hooks/useEventLogger';
import { useConsoleLogger } from './hooks/useConsoleLogger';
import { api } from './services/api';
import { parseCSV } from './services/csvParser';

export default function App() {
  const { events, logEvent } = useEventLogger();
  const { getLogs } = useConsoleLogger();
  const [currentSession, setCurrentSession] = useState(null);
  const [context, setContext] = useState(null);
  const [testCases, setTestCases] = useState([]);
  const [selectedTestCase, setSelectedTestCase] = useState(null);
  const [step, setStep] = useState('sessions'); // 'sessions' | 'setup' | 'testcases' | 'builder' | 'ec-objects' | 'binomi' | 'context-doc' | 'business-spec'
  const [copyMessage, setCopyMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Per forzare re-render della lista
  const [loadingSession, setLoadingSession] = useState(false);
  const [isGlobalAutocompleteRunning, setIsGlobalAutocompleteRunning] = useState(false);
  const [globalAutocompleteProgress, setGlobalAutocompleteProgress] = useState(null);
  const [isObjectAutocompleteRunning, setIsObjectAutocompleteRunning] = useState(false);
  const [savedSessionName, setSavedSessionName] = useState(null);
  const [showLLMReviewModal, setShowLLMReviewModal] = useState(false);
  const [llmSuggestions, setLlmSuggestions] = useState(null);
  const [llmStats, setLlmStats] = useState(null);
  const [runningLLMMatch, setRunningLLMMatch] = useState(false);
  const [llmBinomi, setLlmBinomi] = useState([]);
  const [allECObjects, setAllECObjects] = useState([]);
  const [allBinomi, setAllBinomi] = useState([]);
  const [isAtomicSegmentationRunning, setIsAtomicSegmentationRunning] = useState(false);
  const [atomicSegmentationProgress, setAtomicSegmentationProgress] = useState(null);
  const [cypressFileName, setCypressFileName] = useState('');
  const [cypressOutputDir, setCypressOutputDir] = useState('test_cases');
  const [generatingCypressFile, setGeneratingCypressFile] = useState(false);
  const [preliminaryCode, setPreliminaryCode] = useState('');

  // Ricarica oggetti EC e binomi quando cambia refreshKey
  useEffect(() => {
    const reloadSessionData = async () => {
      if (!currentSession?.id) return;
      
      try {
        const [ecObjectsResult, binomiResult] = await Promise.all([
          api.getECObjects(currentSession.id),
          api.getBinomi(currentSession.id)
        ]);
        setAllECObjects(ecObjectsResult.objects || []);
        setAllBinomi(binomiResult.binomi || []);
      } catch (error) {
        console.error('Errore ricaricamento oggetti EC/binomi:', error);
      }
    };
    
    reloadSessionData();
  }, [refreshKey, currentSession?.id]);

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
            setSavedSessionName(session.name);
            await loadSessionData(session);
            setStep('setup'); // Vai direttamente al setup se c'è una sessione
          } else {
            // Sessione non trovata, rimuovi dal localStorage
            localStorage.removeItem('g2a_current_session_id');
            setSavedSessionName(null);
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
    
    // Controlla anche se c'è una sessione salvata ma non ancora caricata
    const checkSavedSession = () => {
      const savedSessionId = localStorage.getItem('g2a_current_session_id');
      if (savedSessionId && !currentSession) {
        // Carica il nome della sessione salvata
        api.getSessions().then(result => {
          const session = result.sessions.find(s => s.id === savedSessionId);
          if (session) {
            setSavedSessionName(session.name);
          }
        }).catch(() => {});
      }
    };
    
    checkSavedSession();
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

      // Carica sempre il CSV se presente (file salvato in sessione precedente)
      const testCasesKey = `session-${session.id}_test_cases`;
      try {
        const csvResult = await api.getSessionCSV(session.id);
        if (csvResult.success && csvResult.csvContent) {
          logEvent('info', `Caricamento automatico CSV dalla sessione: ${csvResult.fileName}`);
          
          // Parse del CSV
          const testCases = await parseCSV(csvResult.csvContent);
          
          if (testCases.length > 0) {
            setTestCases(testCases);
            // Salva anche in localStorage per velocizzare i prossimi accessi
            localStorage.setItem(testCasesKey, JSON.stringify(testCases));
            logEvent('success', `${testCases.length} test cases caricati automaticamente dal CSV "${csvResult.fileName}"`);
          }
        }
      } catch (csvError) {
        // Se il CSV non esiste, prova a caricare da localStorage
        if (csvError.message.includes('non trovato')) {
          const savedTestCases = localStorage.getItem(testCasesKey);
          if (savedTestCases) {
            const parsed = JSON.parse(savedTestCases);
            setTestCases(parsed);
            logEvent('info', `${parsed.length} test cases caricati dalla sessione (cache locale)`);
          }
        } else {
          console.error('Errore caricamento CSV automatico:', csvError);
          logEvent('warning', `Impossibile caricare CSV automaticamente: ${csvError.message}`);
          
        // Fallback a localStorage se c'è un errore
          const savedTestCases = localStorage.getItem(testCasesKey);
          if (savedTestCases) {
            const parsed = JSON.parse(savedTestCases);
            setTestCases(parsed);
            logEvent('info', `${parsed.length} test cases caricati dalla sessione (cache locale)`);
          }
        }
      }

      // Carica codice preliminare
      try {
        const prelimResult = await api.getPreliminaryCode(session.id);
        if (prelimResult.success && prelimResult.code) {
          setPreliminaryCode(prelimResult.code);
          logEvent('info', 'Codice preliminare caricato');
        }
      } catch (prelimError) {
        console.error('Errore caricamento codice preliminare:', prelimError);
        // Non bloccare il caricamento per questo errore
      }

      // Carica oggetti EC e binomi per calcolare le percentuali di copertura
      try {
        const [ecObjectsResult, binomiResult] = await Promise.all([
          api.getECObjects(session.id),
          api.getBinomi(session.id)
        ]);
        setAllECObjects(ecObjectsResult.objects || []);
        setAllBinomi(binomiResult.binomi || []);
      } catch (error) {
        console.error('Errore caricamento oggetti EC/binomi:', error);
        // Non bloccare il caricamento per questo errore
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
      setSavedSessionName(session.name);
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
      setSavedSessionName(null);
      setContext(null);
      setTestCases([]);
      setStep('sessions');
    }
  };

  // Handler per aprire la sessione attiva
  const handleOpenActiveSession = async () => {
    logEvent('info', '🔵 [CLICK] Pulsante "Sessione attiva" cliccato');
    logEvent('info', `🔵 [STATE] currentSession: ${currentSession ? JSON.stringify({ id: currentSession.id, name: currentSession.name }) : 'null'}`);
    logEvent('info', `🔵 [STATE] step corrente: ${step}`);
    logEvent('info', `🔵 [STATE] loadingSession: ${loadingSession}`);
    
    try {
      let sessionToOpen = currentSession;
      logEvent('info', `🔵 [LOGIC] sessionToOpen iniziale: ${sessionToOpen ? sessionToOpen.name : 'null'}`);
      
      // Se non c'è sessione corrente, prova a caricarla dal localStorage
      if (!sessionToOpen) {
        logEvent('info', '🔵 [LOGIC] Nessuna sessione corrente, controllo localStorage...');
        const savedSessionId = localStorage.getItem('g2a_current_session_id');
        logEvent('info', `🔵 [LOCALSTORAGE] savedSessionId: ${savedSessionId || 'null'}`);
        
        if (savedSessionId) {
          logEvent('info', '🔵 [API] Chiamata api.getSessions()...');
          setLoadingSession(true);
          logEvent('info', '🔵 [STATE] setLoadingSession(true) impostato');
          
          try {
            const result = await api.getSessions();
            logEvent('info', `🔵 [API] getSessions() completato. Sessioni trovate: ${result.sessions?.length || 0}`);
            
            if (result.sessions && result.sessions.length > 0) {
              logEvent('info', `🔵 [API] Nomi sessioni: ${result.sessions.map(s => s.name).join(', ')}`);
            }
            
            sessionToOpen = result.sessions.find(s => s.id === savedSessionId);
            logEvent('info', `🔵 [SEARCH] Ricerca sessione con id "${savedSessionId}": ${sessionToOpen ? 'TROVATA' : 'NON TROVATA'}`);
            
            if (!sessionToOpen) {
            logEvent('warning', '🔴 [ERROR] Sessione salvata non trovata nella lista sessioni');
              localStorage.removeItem('g2a_current_session_id');
              setSavedSessionName(null);
              setStep('sessions');
            logEvent('warning', '🔴 [ACTION] Aperto menu sessioni (sessione non trovata)');
              setLoadingSession(false);
              return;
            }
            
            logEvent('info', `🟢 [FOUND] Sessione trovata: ${JSON.stringify({ id: sessionToOpen.id, name: sessionToOpen.name })}`);
            setCurrentSession(sessionToOpen);
            setSavedSessionName(sessionToOpen.name);
            logEvent('info', '🟢 [STATE] currentSession e savedSessionName aggiornati');
          } catch (apiError) {
            logEvent('error', `🔴 [API ERROR] Errore chiamata getSessions: ${apiError.message}`);
            console.error('Errore API getSessions:', apiError);
            setLoadingSession(false);
            return;
          }
        } else {
          logEvent('info', '🔴 [NO SESSION] Nessuna sessione salvata in localStorage');
          setStep('sessions');
          logEvent('info', '🔴 [ACTION] Aperto menu sessioni (nessuna sessione salvata)');
          return;
        }
      } else {
        logEvent('info', `🟢 [EXISTS] Sessione corrente già presente: ${sessionToOpen.name}`);
      }
      
      // Se c'è una sessione, carica i dati e vai al setup
      if (sessionToOpen) {
        logEvent('info', `🟢 [PROCEED] Procedo con apertura sessione: ${sessionToOpen.name}`);
        setLoadingSession(true);
        logEvent('info', '🟢 [STATE] setLoadingSession(true) per caricamento dati');
        
        // Aggiorna lastAccessed
        try {
          logEvent('info', `🟢 [API] Aggiornamento lastAccessed per sessione ${sessionToOpen.id}...`);
          await api.updateSession(sessionToOpen.id, { lastAccessed: new Date().toISOString() });
          logEvent('info', '🟢 [API] lastAccessed aggiornato con successo');
        } catch (error) {
          logEvent('warning', `🟡 [WARNING] Errore aggiornamento lastAccessed: ${error.message}`);
          console.error('Errore aggiornamento lastAccessed:', error);
        }
        
        // Carica i dati della sessione (contesto e CSV)
        logEvent('info', `🟢 [LOAD] Inizio caricamento dati sessione (loadSessionData)...`);
        let testCasesLoaded = false;
        let testCasesCount = 0;
        
        try {
          await loadSessionData(sessionToOpen);
          logEvent('info', '🟢 [LOAD] loadSessionData completato');
          
          // Verifica se ci sono test cases caricati
          const testCasesKey = `session-${sessionToOpen.id}_test_cases`;
          
          // Attendi un momento per permettere il salvataggio in localStorage
          await new Promise(resolve => setTimeout(resolve, 200));
          
          const savedTestCases = localStorage.getItem(testCasesKey);
          logEvent('info', `🟢 [VERIFY] Controllo localStorage per test cases: ${savedTestCases ? 'trovato' : 'non trovato'}`);
          
          if (savedTestCases) {
            const parsed = JSON.parse(savedTestCases);
            testCasesCount = parsed.length;
            logEvent('info', `🟢 [VERIFY] Test cases trovati in localStorage: ${testCasesCount}`);
            if (testCasesCount > 0) {
              testCasesLoaded = true;
              logEvent('info', `🟢 [VERIFY] Test cases disponibili: ${testCasesCount}, vado direttamente a testcases`);
            }
          }
          
          // Verifica anche nello stato corrente (può essere obsoleto ma utile per debug)
          logEvent('info', `🟢 [VERIFY] testCases nello state corrente: ${testCases.length}`);
          if (testCases.length > 0 && !testCasesLoaded) {
            testCasesLoaded = true;
            testCasesCount = testCases.length;
            logEvent('info', `🟢 [VERIFY] Test cases nello state disponibili: ${testCases.length}`);
          }
        } catch (loadError) {
          logEvent('error', `🔴 [LOAD ERROR] Errore in loadSessionData: ${loadError.message}`);
          console.error('Errore loadSessionData:', loadError);
        }
        
        // Decidi dove andare: testcases se ci sono test cases, altrimenti setup
        if (testCasesLoaded && testCasesCount > 0) {
          logEvent('info', `🟢 [NAVIGATION] ${testCasesCount} test cases trovati, vado a "testcases"`);
          setStep('testcases');
          logEvent('info', `🟢 [STATE] step impostato a: testcases`);
          logEvent('success', `✅ [SUCCESS] Sessione "${sessionToOpen.name}" aperta con ${testCasesCount} test cases!`);
        } else {
          logEvent('info', '🟢 [NAVIGATION] Nessun test case trovato, vado a "setup"');
          setStep('setup');
          logEvent('info', `🟢 [STATE] step impostato a: setup`);
          logEvent('success', `✅ [SUCCESS] Sessione "${sessionToOpen.name}" aperta! Vai al setup per caricare il CSV.`);
        }
      } else {
        logEvent('error', '🔴 [ERROR] sessionToOpen è null dopo tutti i controlli!');
      }
    } catch (error) {
      logEvent('error', `🔴 [EXCEPTION] Eccezione catturata: ${error.message}`);
      logEvent('error', `🔴 [EXCEPTION] Stack: ${error.stack}`);
      console.error('Errore apertura sessione attiva:', error);
      logEvent('error', `🔴 [ERROR] Errore apertura sessione: ${error.message}`);
      setStep('sessions');
    } finally {
      logEvent('info', '🔵 [FINALLY] Impostazione loadingSession a false');
      setLoadingSession(false);
      logEvent('info', '🔵 [FINALLY] Funzione handleOpenActiveSession completata');
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

  // Funzione per ottenere metadati Object Autocomplete
  const getObjectAutocompleteMetadata = (testCaseId) => {
    if (!currentSession) return null;
    
    const metadataKey = `session-${currentSession.id}_object_autocomplete_metadata`;
    const saved = localStorage.getItem(metadataKey);
    
    if (!saved) return null;
    
    const metadata = JSON.parse(saved);
    return metadata[testCaseId] || null;
  };

  // Funzione per salvare metadati Object Autocomplete
  const saveObjectAutocompleteMetadata = (sessionId, completedFields) => {
    const metadataKey = `session-${sessionId}_object_autocomplete_metadata`;
    const existing = localStorage.getItem(metadataKey);
    const metadata = existing ? JSON.parse(existing) : {};
    
    // Aggiorna con i nuovi completamenti
    Object.keys(completedFields).forEach(testCaseId => {
      if (!metadata[testCaseId]) {
        metadata[testCaseId] = {};
      }
      metadata[testCaseId] = {
        ...metadata[testCaseId],
        ...completedFields[testCaseId],
        lastUpdated: new Date().toISOString()
      };
    });
    
    localStorage.setItem(metadataKey, JSON.stringify(metadata));
  };

  // Funzione per rimuovere metadati Object Autocomplete per un test case
  const removeObjectAutocompleteMetadata = (sessionId, testCaseId, phase = null) => {
    if (!currentSession || !testCaseId) return;
    
    const metadataKey = `session-${sessionId}_object_autocomplete_metadata`;
    const existing = localStorage.getItem(metadataKey);
    
    if (!existing) return;
    
    const metadata = JSON.parse(existing);
    
    if (phase) {
      // Rimuovi solo una fase specifica
      if (metadata[testCaseId]) {
        delete metadata[testCaseId][phase];
        // Se non ci sono più fasi, rimuovi l'intero test case
        if (Object.keys(metadata[testCaseId]).length === 0 || 
            (Object.keys(metadata[testCaseId]).length === 1 && metadata[testCaseId].lastUpdated)) {
          delete metadata[testCaseId];
        }
      }
    } else {
      // Rimuovi tutti i metadati per questo test case
      delete metadata[testCaseId];
    }
    
    localStorage.setItem(metadataKey, JSON.stringify(metadata));
    // Forza re-render
    setRefreshKey(prev => prev + 1);
  };

  // ========== GLOBAL AUTOCOMPLETE FUNCTIONS ==========
  
  // Carica tutti i test cases della sessione con i loro stati
  const loadAllTestCasesWithState = async (sessionId) => {
    const testCasesKey = `session-${sessionId}_test_cases`;
    const savedTestCases = localStorage.getItem(testCasesKey);
    if (!savedTestCases) return [];
    
    const testCases = JSON.parse(savedTestCases);
    const testCasesWithState = [];
    
    for (const tc of testCases) {
      const stateKey = `session-${sessionId}_test_state_${tc.id}`;
      const savedState = localStorage.getItem(stateKey);
      
      testCasesWithState.push({
        ...tc,
        state: savedState ? JSON.parse(savedState) : null,
        blockStates: savedState ? JSON.parse(savedState).blockStates : {
          given: { code: '', messages: [] },
          when: { code: '', messages: [] },
          then: { code: '', messages: [] }
        }
      });
    }
    
    return testCasesWithState;
  };

  // Categorizza test cases in codificati e non codificati
  const categorizeTestCases = (testCases) => {
    const coded = [];
    const uncoded = [];
    
    testCases.forEach(tc => {
      const hasGiven = tc.blockStates?.given?.code?.trim();
      const hasWhen = tc.blockStates?.when?.code?.trim();
      const hasThen = tc.blockStates?.then?.code?.trim();
      
      if (hasGiven || hasWhen || hasThen) {
        coded.push(tc);
      } else {
        uncoded.push(tc);
      }
    });
    
    return { coded, uncoded };
  };

  // Fallback: similarità testuale semplice
  const findSimilarBlocksSimple = (targetText, phase, codedTestCases) => {
    const targetLower = targetText.toLowerCase();
    const similarities = [];
    
    for (const tc of codedTestCases) {
      const phaseText = tc[phase];
      const phaseCode = tc.blockStates?.[phase]?.code?.trim();
      
      if (!phaseText || !phaseCode) continue;
      
      const tcLower = phaseText.toLowerCase();
      const words = targetLower.split(/\s+/);
      let matches = 0;
      
      words.forEach(word => {
        if (word.length > 3 && tcLower.includes(word)) {
          matches++;
        }
      });
      
      const similarity = matches / words.length;
      
      if (similarity > 0.3) {
        similarities.push({
          testCaseId: tc.id,
          text: phaseText,
          code: phaseCode,
          messages: tc.blockStates?.[phase]?.messages || [],
          similarity
        });
      }
    }
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 3);
  };

  // Trova blocchi GWT simili già codificati (usa solo fallback testuale per ora)
  const findSimilarGWTBlocks = async (targetText, phase, codedTestCases) => {
    // Per ora usa solo similarità testuale semplice
    // Se necessario, si può aggiungere semanticModel anche qui
    return findSimilarBlocksSimple(targetText, phase, codedTestCases);
  };

  // Rileva se un messaggio contiene una correzione
  const detectCorrection = (userMessage, aiResponse) => {
    const correctionKeywords = [
      'sbagliato', 'errato', 'errore', 'correggi', 'correzione',
      'non funziona', 'non è corretto', 'dovrebbe essere', 'invece di',
      'wrong', 'error', 'correct', 'fix', 'should be', 'instead of'
    ];
    
    const userLower = userMessage.toLowerCase();
    const aiLower = aiResponse.toLowerCase();
    
    // Se l'utente usa parole correttive
    if (correctionKeywords.some(kw => userLower.includes(kw))) {
      return true;
    }
    
    // Se l'AI risponde con pattern correttivi
    if (aiLower.includes('correzione') || aiLower.includes('corretto') || 
        aiLower.includes('modificato') || aiLower.includes('aggiornato')) {
      return true;
    }
    
    return false;
  };

  // Estrae correzioni dalle chat di tutti i test cases
  const extractCorrectionsFromChats = (allTestCases) => {
    const corrections = [];
    
    for (const tc of allTestCases) {
      for (const phase of ['given', 'when', 'then']) {
        const messages = tc.blockStates?.[phase]?.messages || [];
        
        // Analizza i messaggi per trovare pattern correttivi
        for (let i = 0; i < messages.length; i++) {
          const msg = messages[i];
          
          // Se l'utente ha corretto qualcosa, il messaggio successivo dell'AI dovrebbe contenere la correzione
          if (msg.role === 'user' && i < messages.length - 1) {
            const nextMsg = messages[i + 1];
            if (nextMsg.role === 'assistant') {
              // Rileva se è una correzione
              const isCorrection = detectCorrection(msg.content, nextMsg.content);
              
              if (isCorrection) {
                corrections.push({
                  testCaseId: tc.id,
                  phase,
                  userMessage: msg.content,
                  aiResponse: nextMsg.content,
                  originalText: tc[phase],
                  correctedCode: tc.blockStates?.[phase]?.code
                });
              }
            }
          }
        }
      }
    }
    
    return corrections;
  };

  // Costruisce il prompt per Global Autocomplete
  const buildGlobalAutocompletePrompt = (targetText, phase, similarBlocks, currentTestCase, corrections) => {
    let prompt = `Devo completare automaticamente il box ${phase.toUpperCase()} per il Test Case #${currentTestCase.id}.\n\n`;
    prompt += `Enunciato da codificare: "${targetText}"\n\n`;
    
    prompt += `Ho trovato ${similarBlocks.length} test case(s) simili già codificati:\n\n`;
    
    similarBlocks.forEach((sb, idx) => {
      prompt += `--- Test Case #${sb.testCaseId} (similarità: ${(sb.similarity * 100).toFixed(1)}%) ---\n`;
      prompt += `Enunciato: "${sb.text}"\n`;
      prompt += `Codice generato:\n\`\`\`javascript\n${sb.code}\n\`\`\`\n\n`;
      
      // Aggiungi conversazione rilevante se presente
      if (sb.messages && sb.messages.length > 0) {
        prompt += `Conversazione AI:\n`;
        sb.messages.slice(-4).forEach(msg => {
          prompt += `${msg.role === 'user' ? 'Utente' : 'AI'}: ${msg.content.substring(0, 200)}...\n`;
        });
        prompt += `\n`;
      }
    });
    
    // Aggiungi correzioni se presenti
    if (corrections.length > 0) {
      prompt += `\n⚠️ CORREZIONI IMPORTANTI DA APPLICARE:\n`;
      prompt += `Le seguenti correzioni sono state fatte in altri test cases e devono essere considerate:\n\n`;
      
      corrections.slice(0, 5).forEach(corr => {
        prompt += `- Test Case #${corr.testCaseId} (${corr.phase.toUpperCase()}):\n`;
        prompt += `  Problema: ${corr.userMessage.substring(0, 150)}...\n`;
        prompt += `  Soluzione: ${corr.aiResponse.substring(0, 200)}...\n\n`;
      });
    }
    
    prompt += `\nGenera il codice Cypress per "${targetText}" basandoti sui pattern trovati nei test case simili. `;
    prompt += `Adatta il codice al contesto specifico di questo test case. `;
    prompt += `Includi commenti esplicativi nel codice. `;
    prompt += `\n\nIMPORTANTE: Alla fine della tua risposta, aggiungi una sezione "SPIEGAZIONE:" che spiega perché hai scelto questo approccio e da quale test case simile ti sei ispirato.`;
    
    return prompt;
  };

  // Parsa la risposta dell'AI per estrarre codice e spiegazione
  const parseAIResponse = (response) => {
    // Cerca il codice tra ```javascript e ```
    const codeMatch = response.match(/```javascript\n([\s\S]*?)```/);
    const code = codeMatch ? codeMatch[1].trim() : '';
    
    // Cerca la spiegazione dopo "SPIEGAZIONE:"
    const explanationMatch = response.match(/SPIEGAZIONE:?\s*([\s\S]*?)(?:\n\n|$)/i);
    const explanation = explanationMatch ? explanationMatch[1].trim() : 
      'Codice generato automaticamente basandosi su test cases simili.';
    
    return { code, explanation };
  };

  // Salva il codice generato e aggiunge la spiegazione nella chat
  const saveGeneratedCode = async (testCaseId, phase, code, explanation, sessionId) => {
    const stateKey = `session-${sessionId}_test_state_${testCaseId}`;
    const saved = localStorage.getItem(stateKey);
    
    let blockStates = {
      given: { messages: [], code: '', loading: false, prompt: '' },
      when: { messages: [], code: '', loading: false, prompt: '' },
      then: { messages: [], code: '', loading: false, prompt: '' }
    };
    
    if (saved) {
      const parsed = JSON.parse(saved);
      blockStates = parsed.blockStates || blockStates;
    }
    
    // Smart insertion: se il box è vuoto, inserisci il codice, altrimenti aggiungi
    const currentCode = blockStates[phase].code || '';
    if (!currentCode.trim()) {
      blockStates[phase].code = code;
    } else {
      // Aggiungi il codice dopo quello esistente con una riga vuota
      blockStates[phase].code = currentCode + '\n\n' + code;
    }
    
    // Aggiungi messaggio nella chat con la spiegazione (solo se fornita)
    if (explanation) {
      blockStates[phase].messages.push({
        role: 'assistant',
        content: `✨ Codice generato automaticamente tramite Global Autocomplete:\n\n${explanation}\n\nIl codice è stato generato basandosi su test cases simili già codificati.`
      });
    }
    
    // Salva lo stato aggiornato
    const stateToSave = {
      blockStates,
      expandedBlocks: saved ? JSON.parse(saved).expandedBlocks : {},
      lastGlobalAutocomplete: new Date().toISOString(),
      globalAutocompleteFields: {
        ...(saved ? JSON.parse(saved).globalAutocompleteFields : {}),
        [phase]: true
      }
    };
    
    localStorage.setItem(stateKey, JSON.stringify(stateToSave));
  };

  // Salva metadati per mostrare nella lista
  const saveGlobalAutocompleteMetadata = (sessionId, completedFields) => {
    const metadataKey = `session-${sessionId}_global_autocomplete_metadata`;
    const existing = localStorage.getItem(metadataKey);
    const metadata = existing ? JSON.parse(existing) : {};
    
    // Aggiorna con i nuovi completamenti
    Object.keys(completedFields).forEach(testCaseId => {
      if (!metadata[testCaseId]) {
        metadata[testCaseId] = {};
      }
      metadata[testCaseId] = {
        ...metadata[testCaseId],
        ...completedFields[testCaseId],
        lastUpdated: new Date().toISOString()
      };
    });
    
    localStorage.setItem(metadataKey, JSON.stringify(metadata));
  };

  // Genera codice basandosi su blocchi simili
  const generateCodeFromSimilarBlocks = async (
    targetText,
    phase,
    similarBlocks,
    currentTestCase,
    allTestCases
  ) => {
    // Raccogli tutte le correzioni dalla chat di tutti i test cases
    const allCorrections = extractCorrectionsFromChats(allTestCases);
    
    // Costruisci il prompt per l'AI
    const prompt = buildGlobalAutocompletePrompt(
      targetText,
      phase,
      similarBlocks,
      currentTestCase,
      allCorrections
    );
    
    // Chiama l'API per generare codice
    try {
      const response = await api.chatWithAI(
        prompt,
        {
          type: phase,
          description: targetText,
          target: '',
          value: ''
        },
        context || {},
        [], // conversationHistory vuoto per Global Autocomplete
        true, // wideReasoning sempre attivo
        similarBlocks.map(sb => ({
          id: sb.testCaseId,
          given: { text: allTestCases.find(tc => tc.id === sb.testCaseId)?.given || '', code: '' },
          when: { text: allTestCases.find(tc => tc.id === sb.testCaseId)?.when || '', code: '' },
          then: { text: allTestCases.find(tc => tc.id === sb.testCaseId)?.then || '', code: '' }
        }))
      );
      
      // Estrai codice e spiegazione dalla risposta
      const { code, explanation } = parseAIResponse(response.response);
      
      return { code, explanation };
      
    } catch (error) {
      console.error('Errore generazione codice:', error);
      return null;
    }
  };

  // Completa i box GWT vuoti di un test case
  const completeTestCaseGWT = async (testCase, codedTestCases, allTestCases) => {
    const completed = { given: false, when: false, then: false };
    
    // Per ogni fase GWT
    for (const phase of ['given', 'when', 'then']) {
      const phaseText = testCase[phase];
      const currentCode = testCase.blockStates?.[phase]?.code?.trim();
      
      // Se il box è già compilato, salta
      if (currentCode) continue;
      
      // Trova enunciati simili già codificati
      const similarBlocks = await findSimilarGWTBlocks(phaseText, phase, codedTestCases);
      
      if (similarBlocks.length === 0) {
        logEvent('info', `Nessun enunciato simile trovato per ${phase.toUpperCase()} del Test Case #${testCase.id}`);
        continue;
      }
      
      // Genera codice basandosi sui pattern trovati
      const generatedCode = await generateCodeFromSimilarBlocks(
        phaseText,
        phase,
        similarBlocks,
        testCase,
        allTestCases
      );
      
      if (generatedCode && generatedCode.code) {
        // Salva il codice e la spiegazione
        await saveGeneratedCode(testCase.id, phase, generatedCode.code, generatedCode.explanation, currentSession.id);
        completed[phase] = true;
        
        logEvent('success', `✅ Completato ${phase.toUpperCase()} per Test Case #${testCase.id}`);
      }
    }
    
    return completed;
  };

  // Funzione principale Global Autocomplete
  const handleGlobalAutocomplete = async () => {
    if (!currentSession) {
      logEvent('error', 'Nessuna sessione disponibile');
      return;
    }

    setIsGlobalAutocompleteRunning(true);
    setGlobalAutocompleteProgress({ current: 0, total: 0, message: 'Inizializzazione...' });
    
    try {
      logEvent('info', '🚀 Avvio Global Autocomplete...');
      
      // 1. Carica tutti i test cases della sessione con i loro stati
      const allTestCasesWithState = await loadAllTestCasesWithState(currentSession.id);
      
      // 2. Separa test cases codificati da non codificati
      const { coded, uncoded } = categorizeTestCases(allTestCasesWithState);
      
      if (coded.length === 0) {
        logEvent('warning', 'Nessun test case già codificato trovato. Global Autocomplete richiede almeno un test case con codice.');
        return;
      }
      
      if (uncoded.length === 0) {
        logEvent('info', 'Tutti i test cases sono già codificati!');
        return;
      }
      
      logEvent('info', `Trovati ${coded.length} test cases codificati e ${uncoded.length} con box vuoti`);
      
      // 3. Per ogni test case non codificato, completa i box GWT vuoti
      let completedCount = 0;
      const completedFields = {}; // { testCaseId: { given: true, when: false, then: true } }
      
      for (let i = 0; i < uncoded.length; i++) {
        const tc = uncoded[i];
        setGlobalAutocompleteProgress({ 
          current: i + 1, 
          total: uncoded.length, 
          message: `Elaborando Test Case #${tc.id}...` 
        });
        
        const completed = await completeTestCaseGWT(tc, coded, allTestCasesWithState);
        
        if (completed.given || completed.when || completed.then) {
          completedFields[tc.id] = completed;
          completedCount++;
        }
      }
      
      // 4. Salva i metadati di completamento per mostrare nella lista
      saveGlobalAutocompleteMetadata(currentSession.id, completedFields);
      
      logEvent('success', `✅ Global Autocomplete completato! ${completedCount} test cases aggiornati.`);
      
      // 5. Forza refresh della lista
      window.dispatchEvent(new CustomEvent('global-autocomplete-completed', { 
        detail: { sessionId: currentSession.id, completedFields } 
      }));
      setRefreshKey(prev => prev + 1);
      
    } catch (error) {
      console.error('Errore Global Autocomplete:', error);
      logEvent('error', `Errore Global Autocomplete: ${error.message}`);
    } finally {
      setIsGlobalAutocompleteRunning(false);
      setGlobalAutocompleteProgress(null);
    }
  };

  // Funzione principale Object Autocomplete (Raziocinio per Oggetti)
  const handleObjectAutocomplete = async () => {
    if (!currentSession) return;
    
    setIsObjectAutocompleteRunning(true);
    setGlobalAutocompleteProgress({ current: 0, total: 0, message: 'Analisi oggetti e binomi...' });
    
    try {
      logEvent('info', '🔶 Avvio Object Autocomplete (Raziocinio per Oggetti)...');
      
      // 1. Carica dati
      const [allTestCases, ecObjectsResult, binomiResult] = await Promise.all([
        loadAllTestCasesWithState(currentSession.id),
        api.getECObjects(currentSession.id),
        api.getBinomi(currentSession.id)
      ]);
      
      const allObjects = ecObjectsResult.objects || [];
      const allBinomi = binomiResult.binomi || [];
      
      // Filtra solo binomi attivi (ignora disattivati)
      const activeBinomi = allBinomi.filter(b => (b.status || 'active') !== 'disabled');
      
      if (activeBinomi.length === 0) {
        logEvent('warning', 'Nessun binomio attivo trovato. Crea prima dei collegamenti manuali come esempi o riattiva binomi disattivati.');
        return;
      }
      
      // 2. Identifica i pattern (Binomi esistenti completi FROM->TO)
      const patterns = [];
      
      activeBinomi.forEach(binomio => {
        const fromObj = allObjects.find(o => o.id === binomio.fromObjectId);
        const toObj = allObjects.find(o => o.id === binomio.toObjectId);
        
        // Consideriamo validi solo i binomi che collegano Header(From) a Content(To)
        if (fromObj && toObj && fromObj.location === 'header' && toObj.location === 'content') {
          const normFrom = (fromObj.text || '').trim();
          const normTo = (toObj.text || '').trim();
          if (!normFrom || !normTo) return;
          patterns.push({
            fromText: normFrom,
            toText: normTo,
            sourceTestCaseId: binomio.testCaseId,
            fromObjId: fromObj.id
          });
        }
      });
      
      logEvent('info', `Trovati ${patterns.length} pattern di binomi validi per il raziocinio.`);
      if (patterns.length === 0) {
        logEvent('warning', 'Nessun pattern valido: controlla che i binomi abbiano FROM in header e TO in content, con testi non vuoti.');
        return;
      }
      // Loga i primi 3 pattern per diagnosi
      patterns.slice(0, 3).forEach((p, idx) => {
        logEvent('info', `[OBJ-AUTO][PATTERN ${idx + 1}] from="${p.fromText.substring(0, 80)}" -> to="${p.toText.substring(0, 80)}" (TC ${p.sourceTestCaseId})`);
      });
      
      // Estrai un set unico di testi FROM noti (i nostri "Segugi" per la caccia ai pattern)
      const knownFromTexts = new Set(patterns.map(p => p.fromText.trim()).filter(t => t.length > 0));
      logEvent('info', `[OBJ-AUTO] Estratti ${knownFromTexts.size} testi FROM unici per pattern discovery`);
      
      // 3. Itera sui test case per trovare match e applicare
      let updatedCount = 0;
      const completedFields = {}; 
      
      for (let i = 0; i < allTestCases.length; i++) {
        const tc = allTestCases[i];
        
        setGlobalAutocompleteProgress({ 
          current: i + 1, 
          total: allTestCases.length, 
          message: `Raziocinio su Test Case #${tc.id}...` 
        });
        
        // Trova oggetti FROM (Header) di questo test case
        let tcHeaderObjects = allObjects.filter(o => 
          String(o.testCaseId) === String(tc.id) && o.location === 'header'
        );
        logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Header objects: ${tcHeaderObjects.length}`);
        
        // Trova binomi già esistenti per questo TC per evitare duplicati/sovrascritture (solo attivi)
        const tcBinomi = activeBinomi.filter(b => String(b.testCaseId) === String(tc.id));
        const connectedFromIds = new Set(tcBinomi.map(b => b.fromObjectId));
        logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Binomi esistenti: ${tcBinomi.length}, from già connessi: ${connectedFromIds.size}`);
        
        let tcUpdated = false;
        
        // Raggruppa oggetti per boxType (given, when, then)
        const objectsByBox = { given: [], when: [], then: [] };
        tcHeaderObjects.forEach(obj => {
          if (obj.boxType && objectsByBox[obj.boxType]) {
            objectsByBox[obj.boxType].push(obj);
          }
        });
        
        for (const boxType of ['given', 'when', 'then']) {
          // Inizializza boxObjects dalla lista esistente (potrebbe essere vuota)
          let boxObjects = objectsByBox[boxType] || [];
          
          // Recupera il testo del box per la scansione pattern-driven
          const phaseText = (tc[boxType] || '').trim();
          
          // PATTERN-DRIVEN OBJECT DISCOVERY: Scansiona il testo cercando pattern noti
          if (phaseText && knownFromTexts.size > 0) {
            const discoveredObjects = [];
            
            // Per ogni testo FROM noto, cerca occorrenze nel testo del box
            for (const knownFromText of knownFromTexts) {
              // Usa findPartialMatch per trovare occorrenze (gestisce anche variazioni)
              const matchResult = findPartialMatch(phaseText, knownFromText);
              
              if (matchResult && matchResult.similarity > 0.95) {
                // Trovata un'occorrenza! Verifica se è già coperta da un oggetto esistente
                const matchStart = matchResult.startIndex;
                const matchEnd = matchResult.endIndex;
                const matchText = matchResult.extractedText;
                
                // Verifica se questa posizione è già coperta da un oggetto esistente
                // Controllo rigoroso: nessuna intersezione permessa con oggetti esistenti
                const isCovered = boxObjects.some(existingObj => {
                  const existingStart = existingObj.startIndex ?? 0;
                  const existingEnd = existingObj.endIndex ?? (existingStart + (existingObj.text || '').length);
                  
                  // Controlla sovrapposizione parziale o totale: se i due intervalli si toccano
                  // matchStart < existingEnd && matchEnd > existingStart
                  return matchStart < existingEnd && matchEnd > existingStart;
                });
                
                // Se non è coperto, crea un oggetto virtuale
                if (!isCovered) {
                  const virtualId = `virtual-${currentSession.id}-TC${tc.id}-${boxType.toUpperCase()}-PATTERN-${Date.now()}-${Math.floor(Math.random()*10000)}`;
                  const virtualObj = {
                    id: virtualId,
                    sessionId: currentSession.id,
                    testCaseId: String(tc.id),
                    boxType: boxType,
                    boxNumber: 800 + discoveredObjects.length, // Numero diverso per distinguerli
                    text: matchText,
                    location: 'header',
                    startIndex: matchStart,
                    endIndex: matchEnd,
                    createdAt: new Date().toISOString(),
                    isVirtual: true,
                    discoveredFromPattern: knownFromText // Traccia da quale pattern è stato scoperto
                  };
                  
                  discoveredObjects.push(virtualObj);
                  logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Scoperto pattern "${knownFromText.substring(0, 50)}..." @${matchStart}-${matchEnd} in ${boxType.toUpperCase()}`);
                } else {
                  logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Pattern "${knownFromText.substring(0, 50)}..." già coperto da oggetto esistente, salto`);
                }
              }
            }
            
            // Aggiungi gli oggetti scoperti alla lista
            if (discoveredObjects.length > 0) {
              boxObjects = boxObjects.concat(discoveredObjects);
              objectsByBox[boxType] = boxObjects;
              logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Scoperti ${discoveredObjects.length} nuovi oggetti header tramite pattern discovery in ${boxType.toUpperCase()}`);
            }
          }
          
          // Fallback legacy: se non ci sono oggetti header per questa fase, crea un oggetto header virtuale (non salvato) dal testo Gherkin.
          // Verrà materializzato solo se troviamo un match.
          if (!boxObjects || boxObjects.length === 0) {
            if (phaseText) {
              const autoId = `virtual-${currentSession.id}-TC${tc.id}-${boxType.toUpperCase()}-AUTOFROM-${Date.now()}-${Math.floor(Math.random()*10000)}`;
              const autoObj = {
                id: autoId,
                sessionId: currentSession.id,
                testCaseId: String(tc.id),
                boxType: boxType,
                boxNumber: 900 + Math.floor(Math.random()*99),
                text: phaseText,
                location: 'header',
                startIndex: 0,
                endIndex: phaseText.length,
                createdAt: new Date().toISOString(),
                isVirtual: true
              };
              objectsByBox[boxType].push(autoObj);
              boxObjects = objectsByBox[boxType];
              logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Creato oggetto header virtuale per ${boxType.toUpperCase()}: "${phaseText.substring(0,80)}"`);
            }
          }
          
          boxObjects = objectsByBox[boxType];
          if (!boxObjects || boxObjects.length === 0) {
            logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Nessun oggetto header per fase ${boxType.toUpperCase()}, salto`);
            continue;
          }
          logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Fase ${boxType.toUpperCase()} - oggetti header: ${boxObjects.length}`);

          // Recupera il codice attuale del box
          let boxCode = tc.blockStates?.[boxType]?.code || '';
          
          // Trova gli oggetti content esistenti per questo box (per calcolare posizioni di inserimento)
          const existingContentObjects = allObjects
            .filter(o => String(o.testCaseId) === String(tc.id) && o.location === 'content' && o.boxType === boxType)
            .sort((a, b) => a.startIndex - b.startIndex);
          
          // Ordina gli header per posizione (startIndex o boxNumber come fallback)
          const sortedHeaders = [...boxObjects].sort((a, b) => {
            const aIdx = a.startIndex ?? (a.boxNumber ?? 0);
            const bIdx = b.startIndex ?? (b.boxNumber ?? 0);
            return aIdx - bIdx;
          });
          
          logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Header ordinati: ${sortedHeaders.length}, Content esistenti: ${existingContentObjects.length}`);
          
          let boxUpdated = false;
          
          // Processa gli header nell'ordine corretto
          for (const obj of sortedHeaders) {
            // Se l'oggetto è già connesso, salta (non vogliamo doppi binomi dallo stesso from)
            if (connectedFromIds.has(obj.id)) {
              logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Obj "${obj.text.substring(0, 80)}" già connesso, salto`);
              continue;
            }
            
            // Helper similitudine: normalizza, gestisce anche casi di substring (es. manca una lettera)
            const normalizeMatch = (t) => (t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
            const computeSimilarity = (a, b) => {
              const na = normalizeMatch(a);
              const nb = normalizeMatch(b);
              if (!na || !nb) return 0;
              if (na === nb) return 1;
              if (na.includes(nb) || nb.includes(na)) return 0.98; // gestione near-duplicate / substring
              return calculateTextSimilarity(na, nb);
            };

            // Cerca il miglior match tra i pattern (testo normalizzato)
            let bestMatch = null;
            let bestSimilarity = 0;
            const fromTextNorm = normalizeMatch(obj.text);
            logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Check obj="${fromTextNorm}" (${boxType.toUpperCase()})`);
            
            for (const pattern of patterns) {
              // Opzionale: Evita auto-match nello stesso test case (per evitare loop strani, anche se improbabile)
              // if (String(pattern.sourceTestCaseId) === String(tc.id)) continue;
              
              const similarity = computeSimilarity(fromTextNorm, pattern.fromText);
              // Soglia meno rigida per favorire match reali anche con differenze minime
              if (similarity > 0.65 && similarity > bestSimilarity) { 
                bestSimilarity = similarity;
                bestMatch = pattern;
              }
            }
            
            if (bestMatch) {
              logEvent('info', `[OBJ-AUTO][TC ${tc.id}] MATCH ✅ sim=${(bestSimilarity*100).toFixed(1)}% -> to="${bestMatch.toText.substring(0,80)}"`);
              // TROVATO MATCH! Applica automazione
              // 1. Crea Oggetto TO
              const newToText = bestMatch.toText;
              
              // Calcola la posizione di inserimento basata sull'ordine degli header
              let insertPosition = boxCode.length; // Default: in fondo
              
              // Trova la posizione dell'header corrente nell'ordine
              const currentHeaderIndex = sortedHeaders.findIndex(h => h.id === obj.id);
              
              if (currentHeaderIndex >= 0) {
                // Cerca il TO dell'header precedente (se esiste) per inserire dopo di esso
                let foundInsertPoint = false;
                
                // Cerca header precedenti nell'ordine
                for (let prevIdx = currentHeaderIndex - 1; prevIdx >= 0; prevIdx--) {
                  const prevHeader = sortedHeaders[prevIdx];
                  // Trova il binomio che collega questo header precedente a un TO
                  const prevBinomio = tcBinomi.find(b => b.fromObjectId === prevHeader.id);
                  if (prevBinomio) {
                    // Trova l'oggetto TO corrispondente
                    const prevToObj = existingContentObjects.find(o => o.id === prevBinomio.toObjectId);
                    if (prevToObj) {
                      // Inserisci dopo questo TO (alla fine del suo endIndex)
                      insertPosition = prevToObj.endIndex;
                      foundInsertPoint = true;
                      logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Inserimento dopo TO dell'header precedente @${insertPosition}`);
                      break;
                    }
                  }
                }
                
                // Se non abbiamo trovato un punto di inserimento, cerca l'header successivo
                if (!foundInsertPoint) {
                  for (let nextIdx = currentHeaderIndex + 1; nextIdx < sortedHeaders.length; nextIdx++) {
                    const nextHeader = sortedHeaders[nextIdx];
                    const nextBinomio = tcBinomi.find(b => b.fromObjectId === nextHeader.id);
                    if (nextBinomio) {
                      const nextToObj = existingContentObjects.find(o => o.id === nextBinomio.toObjectId);
                      if (nextToObj) {
                        // Inserisci prima di questo TO (al suo startIndex)
                        insertPosition = nextToObj.startIndex;
                        foundInsertPoint = true;
                        logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Inserimento prima del TO dell'header successivo @${insertPosition}`);
                        break;
                      }
                    }
                  }
                }
                
                // Se ancora non abbiamo trovato un punto, inseriamo in fondo
                if (!foundInsertPoint) {
                  insertPosition = boxCode.length;
                  logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Inserimento in fondo @${insertPosition}`);
                }
              }
              
              // Calcola il separatore (newline doppio se c'è codice prima o dopo)
              const beforeText = boxCode.substring(0, insertPosition);
              const afterText = boxCode.substring(insertPosition);
              const needsSeparatorBefore = beforeText.trim().length > 0;
              const needsSeparatorAfter = afterText.trim().length > 0;
              const separator = (needsSeparatorBefore || needsSeparatorAfter) ? '\n\n' : '';
              
              // Calcola gli indici finali considerando il separatore
              // Il separatore va sempre prima del nuovo TO se c'è codice prima, o dopo se c'è solo codice dopo
              const separatorBefore = needsSeparatorBefore ? separator : '';
              const separatorAfter = needsSeparatorAfter && !needsSeparatorBefore ? separator : '';
              const actualInsertPos = insertPosition + separatorBefore.length;
              const objectStart = actualInsertPos;
              const objectEnd = objectStart + newToText.length;
              
              // Inserisci il nuovo TO nella posizione corretta
              boxCode = beforeText + separatorBefore + newToText + separatorAfter + afterText;
              
              // Aggiorna gli indici degli oggetti content successivi all'inserimento e salvali nel DB
              const insertedLength = newToText.length + separatorBefore.length + separatorAfter.length;
              const objectsToUpdate = [];
              for (const contentObj of existingContentObjects) {
                if (contentObj.startIndex >= insertPosition) {
                  const updatedObj = {
                    ...contentObj,
                    startIndex: contentObj.startIndex + insertedLength,
                    endIndex: contentObj.endIndex + insertedLength
                  };
                  objectsToUpdate.push(updatedObj);
                  // Aggiorna anche nella lista locale
                  contentObj.startIndex = updatedObj.startIndex;
                  contentObj.endIndex = updatedObj.endIndex;
                }
              }
              
              // Salva gli aggiornamenti degli indici nel database
              for (const objToUpdate of objectsToUpdate) {
                try {
                  await api.saveECObject(currentSession.id, objToUpdate);
                  // Aggiorna anche in allObjects
                  const idx = allObjects.findIndex(o => o.id === objToUpdate.id);
                  if (idx >= 0) {
                    allObjects[idx] = objToUpdate;
                  }
                } catch (err) {
                  logEvent('error', `[OBJ-AUTO][TC ${tc.id}] Errore aggiornamento indici oggetto ${objToUpdate.id}: ${err.message}`);
                }
              }
              
              logEvent('info', `[OBJ-AUTO][TC ${tc.id}] TO inserito @${objectStart}-${objectEnd}, ${objectsToUpdate.length} oggetti aggiornati, codice totale: ${boxCode.length} caratteri`);
              
              // Determina/crea l'oggetto FROM se era virtuale, con start/end allineati al match
              let fromObjectId = obj.id;
              let fromObjectText = obj.text;
              let fromStartIdx = obj.startIndex ?? 0;
              let fromEndIdx = obj.endIndex ?? obj.text.length;

              if (obj.isVirtual || String(obj.id || '').startsWith('virtual-')) {
                const phaseText = (tc[boxType] || '');
                const phaseLower = phaseText.toLowerCase();
                const targetLower = (bestMatch.fromText || '').toLowerCase();
                let foundIdx = phaseLower.indexOf(targetLower);
                if (foundIdx < 0) foundIdx = 0;
                const matchStart = foundIdx;
                const matchEnd = Math.min(phaseText.length, foundIdx + (bestMatch.fromText || '').length);
                const matchText = phaseText.substring(matchStart, matchEnd) || bestMatch.fromText || obj.text;

                const newFromId = `${currentSession.id}-TC${tc.id}-${boxType.toUpperCase()}-AUTOFROM-${Date.now()}-${Math.floor(Math.random()*10000)}`;
                const newFromObj = {
                  id: newFromId,
                  sessionId: currentSession.id,
                  testCaseId: String(tc.id),
                  boxType: boxType,
                  boxNumber: obj.boxNumber || (900 + Math.floor(Math.random()*99)),
                  text: matchText,
                  location: 'header',
                  startIndex: matchStart,
                  endIndex: matchEnd,
                  createdAt: new Date().toISOString()
                };
                try {
                  await api.saveECObject(currentSession.id, newFromObj);
                  allObjects.push(newFromObj);
                  tcHeaderObjects.push(newFromObj);
                  objectsByBox[boxType].push(newFromObj);
                  fromObjectId = newFromId;
                  fromObjectText = matchText;
                  fromStartIdx = matchStart;
                  fromEndIdx = matchEnd;
                  logEvent('info', `[OBJ-AUTO][TC ${tc.id}] Materializzato FROM auto: "${matchText.substring(0,80)}" @${matchStart}-${matchEnd}`);
                } catch (err) {
                  logEvent('error', `[OBJ-AUTO][TC ${tc.id}] Errore salvataggio FROM auto: ${err.message}`);
                }
              }

              // ID univoco per il nuovo oggetto TO
              const toObjectId = `${currentSession.id}-TC${tc.id}-${boxType.toUpperCase()}-AUTO-${Date.now()}-${Math.floor(Math.random()*10000)}`;
              
              const newToObject = {
                id: toObjectId,
                sessionId: currentSession.id,
                testCaseId: String(tc.id),
                boxType: boxType,
                boxNumber: 900 + Math.floor(Math.random()*99), // Numero alto per differenziare
                text: newToText,
                location: 'content',
                startIndex: objectStart,
                endIndex: objectEnd,
                createdAt: new Date().toISOString()
              };
              
              // Salva oggetto TO
              await api.saveECObject(currentSession.id, newToObject);
              
              // Aggiungi l'oggetto TO alle collezioni in memoria per il riuso
              allObjects.push(newToObject);
              existingContentObjects.push(newToObject);
              // Mantieni ordinato per startIndex
              existingContentObjects.sort((a, b) => a.startIndex - b.startIndex);
              
              // 2. Crea Binomio
              const binomioId = `bf-${currentSession.id}-TC${tc.id}-AUTO-${Date.now()}-${Math.floor(Math.random()*10000)}`;
              const newBinomio = {
                id: binomioId,
                sessionId: currentSession.id,
                testCaseId: String(tc.id),
                fromObjectId: fromObjectId, // Collega al FROM (materializzato se era virtuale)
                toObjectId: toObjectId, // Collega al nuovo TO
                fromPoint: { x: 0.5, y: 1 },
                toPoint: { x: 0.5, y: 0 },
                createdAt: new Date().toISOString()
              };
              
              // Salva Binomio
              await api.saveBinomio(currentSession.id, newBinomio);
              
              // Aggiungi il binomio alle collezioni in memoria per il riuso
              allBinomi.push(newBinomio);
              tcBinomi.push(newBinomio);
              
              // Se l'oggetto FROM era auto-creato, aggiungilo ai binomi connessi per evitarne il riuso
              connectedFromIds.add(fromObjectId);
              
              logEvent('success', `📏 [AUTO-MATCH] TC#${tc.id}: Collegato "${obj.text.substring(0, 50)}..." a nuovo TO (sim: ${(bestSimilarity*100).toFixed(1)}%)`);
              
              boxUpdated = true;
              tcUpdated = true;
              
              // Segna come completato nei metadati
              if (!completedFields[tc.id]) completedFields[tc.id] = {};
              completedFields[tc.id][boxType] = true;
              
              // Aggiungi l'ID from ai connessi per evitare ri-processamento nel loop corrente se ci fossero duplicati
              connectedFromIds.add(obj.id);
            }
          }
          
          // Se il codice del box è cambiato, salva lo stato del test case
          if (boxUpdated) {
            // Nota: saveGeneratedCode si aspetta solo il NUOVO codice se deve appendere, 
            // ma qui abbiamo ricostruito boxCode completo (o appeso localmente).
            // saveGeneratedCode ha logica "se esiste appende". 
            // Invece di usare saveGeneratedCode che potrebbe duplicare, 
            // salviamo direttamente lo stato intero sovrascrivendo il codice del blocco.
            
            const stateKey = `session-${currentSession.id}_test_state_${tc.id}`;
            const savedStateStr = localStorage.getItem(stateKey);
            let stateObj = savedStateStr ? JSON.parse(savedStateStr) : { blockStates: { given: {}, when: {}, then: {} } };
            
            if (!stateObj.blockStates[boxType]) stateObj.blockStates[boxType] = {};
            stateObj.blockStates[boxType].code = boxCode;
            
            // Aggiungi messaggio chat
            if (!stateObj.blockStates[boxType].messages) stateObj.blockStates[boxType].messages = [];
            stateObj.blockStates[boxType].messages.push({
              role: 'assistant',
              content: '🔶 Codice aggiornato da "Raziocinio per Oggetti": nuovi binomi creati automaticamente.'
            });
            
            localStorage.setItem(stateKey, JSON.stringify(stateObj));
          }
        }
        
        if (tcUpdated) updatedCount++;
      }
      
      if (updatedCount > 0) {
        saveObjectAutocompleteMetadata(currentSession.id, completedFields);
        logEvent('success', `✅ Raziocinio per Oggetti completato: ${updatedCount} test cases aggiornati con nuovi binomi.`);
        setRefreshKey(prev => prev + 1);
      } else {
        logEvent('info', 'Nessun nuovo collegamento possibile trovato con i binomi modello attuali.');
      }
      
    } catch (error) {
      console.error('Errore Object Autocomplete:', error);
      logEvent('error', `Errore Raziocinio per Oggetti: ${error.message}`);
    } finally {
      setIsObjectAutocompleteRunning(false);
      setGlobalAutocompleteProgress(null);
    }
  };

  // Componente disco percentuale per visualizzare la copertura
  const CoverageIndicator = ({ percentage }) => {
    const size = 28;
    const strokeWidth = 3.5;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    
    const getColor = () => {
      if (percentage >= 80) return '#4caf50'; // Verde
      if (percentage >= 50) return '#ff9800'; // Arancione
      return '#f44336'; // Rosso
    };
    
    const getMessage = () => {
      if (percentage === 100) return 'Copertura completa';
      if (percentage >= 80) return 'Buona copertura';
      if (percentage >= 50) return 'Copertura media';
      if (percentage > 0) return 'Copertura bassa';
      return 'Nessuna copertura';
    };
    
    return (
      <svg 
        width={size} 
        height={size} 
        style={{ 
          display: 'inline-block', 
          verticalAlign: 'middle', 
          marginLeft: '8px',
          cursor: 'help'
        }}
        title={`${getMessage()}: ${percentage}% del testo è coperto da binomi`}
      >
        {/* Cerchio di sfondo grigio */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#e0e0e0"
          strokeWidth={strokeWidth}
        />
        {/* Cerchio colorato per la percentuale */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={getColor()}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.3s ease' }}
        />
        {/* Testo percentuale al centro (solo se > 0) */}
        {percentage > 0 && (
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="9"
            fontWeight="bold"
            fill={getColor()}
          >
            {percentage}
          </text>
        )}
      </svg>
    );
  };

  // Funzione per calcolare la percentuale di copertura di un enunciato tramite binomi
  const calculateCoveragePercentage = (text, testCaseId, phase) => {
    if (!text || !currentSession?.id) return 0;
    
    // Rimuovi parole chiave Gherkin dal conteggio
    const cleanText = text
      .replace(/^(Given|When|Then|And|Or|But)\s+/i, '')
      .replace(/\s+(and|or|but)\s+/gi, ' ')
      .replace(/[,;:]/g, '')
      .trim();
    
    if (!cleanText) return 0;
    
    // Lunghezza totale del testo pulito (base per il calcolo)
    const totalLength = cleanText.length;
    if (totalLength === 0) return 0;
    
    // Trova tutti gli oggetti EC di tipo FROM (header) per questo test case e fase
    const phaseObjects = allECObjects.filter(obj => 
      obj.testCaseId === String(testCaseId) && 
      obj.boxType === phase && 
      obj.location === 'header'
    );
    
    if (phaseObjects.length === 0) return 0;
    
    // Trova i binomi collegati a questi oggetti FROM
    const connectedObjects = phaseObjects.filter(obj => {
      // Cerca se esiste un binomio per questo oggetto FROM
      return allBinomi.some(b => 
        (b.fromObjectId === obj.id || b.fromObjectId === obj.ecObjectId) &&
        b.testCaseId === String(testCaseId) &&
        (b.status === undefined || b.status === 'active')
      );
    });
    
    if (connectedObjects.length === 0) return 0;
    
    // Calcola la lunghezza totale coperta (somma dei testi degli oggetti collegati)
    let coveredLength = 0;
    connectedObjects.forEach(obj => {
      if (obj.text) {
        // Rimuovi anche dalle parti coperte le parole chiave
        const cleanObjText = obj.text
          .replace(/^(Given|When|Then|And|Or|But)\s+/i, '')
          .replace(/\s+(and|or|but)\s+/gi, ' ')
          .replace(/[,;:]/g, '')
          .trim();
        coveredLength += cleanObjText.length;
      }
    });
    
    // Calcola percentuale (limitata a 100%)
    const percentage = Math.min(100, Math.round((coveredLength / totalLength) * 100));
    return percentage;
  };

  // Handler per Segmentazione Atomica di tutti i test cases
  const handleAtomicSegmentation = async () => {
    if (!currentSession?.id || testCases.length === 0) {
      alert('Nessun test case disponibile per la segmentazione');
      return;
    }
    
    const confirm = window.confirm(
      `Vuoi applicare la segmentazione semantica automatica a tutti i ${testCases.length} test cases?\n\n` +
      `Questo creerà automaticamente gli oggetti EC (FROM) per ogni chunk semantico identificato in tutti gli enunciati Given/When/Then.`
    );
    
    if (!confirm) return;
    
    try {
      setIsAtomicSegmentationRunning(true);
      logEvent('info', `⚛️ Avvio Segmentazione Atomica per ${testCases.length} test cases...`);
      
      let totalChunksCreated = 0;
      let totalObjectsCreated = 0;
      let errorsCount = 0;
      
      // Genera ID univoco per gli oggetti EC
      const generateECObjectId = (boxType, boxNumber) => {
        const boxTypeUpper = boxType.toUpperCase();
        return `${currentSession.id}-TC${boxTypeUpper}-${boxNumber}-${Date.now()}`;
      };
      
      // Conta oggetti esistenti per ottenere il prossimo numero
      const getNextBoxNumber = async (boxType) => {
        const existingObjects = allECObjects.filter(
          obj => obj.boxType === boxType && obj.sessionId === currentSession.id
        );
        return existingObjects.length + 1;
      };
      
      // Per ogni test case
      for (let i = 0; i < testCases.length; i++) {
        const tc = testCases[i];
        setAtomicSegmentationProgress({
          current: i + 1,
          total: testCases.length,
          testCaseId: tc.id,
          message: `Elaborando Test Case #${tc.id}...`
        });
        
        // Per ogni fase (given, when, then)
        for (const phase of ['given', 'when', 'then']) {
          const text = tc[phase];
          if (!text || text.trim().length === 0) continue;
          
          try {
            logEvent('info', `⚛️ Segmentazione ${phase.toUpperCase()} per TC#${tc.id}...`);
            
            // Chiama API di segmentazione
            const result = await api.segmentSemanticChunks(text, phase);
            
            if (result.success && result.chunks && result.chunks.length > 0) {
              totalChunksCreated += result.chunks.length;
              
              logEvent('info', `📝 Testo originale: "${text}"`);
              logEvent('info', `🔍 Chunks ricevuti: ${result.chunks.length}`);
              
              // Crea oggetti EC per ogni chunk
              let searchOffset = 0; // Per gestire chunk duplicati nel testo e skip operatori
              for (const chunk of result.chunks) {
                const boxNumber = await getNextBoxNumber(phase);
                const ecObjectId = generateECObjectId(phase, boxNumber + totalObjectsCreated);
                
                // Cerca il chunk nel testo originale a partire da searchOffset
                // Questo funziona perché i chunk non contengono operatori Gherkin
                const startIndex = text.indexOf(chunk.text, searchOffset);
                
                if (startIndex === -1) {
                  // Chunk non trovato, probabilmente un problema con la segmentazione
                  logEvent('warning', `⚠️ Chunk non trovato nel testo: "${chunk.text}"`);
                  // Usa posizione approssimata
                  const endIndex = searchOffset + chunk.text.length;
                  
                  const ecObject = {
                    id: ecObjectId,
                    sessionId: currentSession.id,
                    testCaseId: String(tc.id),
                    boxType: phase,
                    boxNumber: boxNumber + totalObjectsCreated,
                    text: chunk.text,
                    location: 'header', // FROM object
                    startIndex: searchOffset,
                    endIndex: endIndex,
                    createdAt: new Date().toISOString(),
                    meta: {
                      autoSegmented: true,
                      semanticType: chunk.semanticType,
                      sourceText: text,
                      sourcePhase: phase,
                      positionNotFound: true
                    }
                  };
                  
                  await api.saveECObject(currentSession.id, ecObject);
                  totalObjectsCreated++;
                  searchOffset = endIndex;
                  continue;
                }
                
                const endIndex = startIndex + chunk.text.length;
                
                // Aggiorna l'offset per la prossima ricerca (dopo questo chunk)
                searchOffset = endIndex;
                
                const ecObject = {
                  id: ecObjectId,
                  sessionId: currentSession.id,
                  testCaseId: String(tc.id),
                  boxType: phase,
                  boxNumber: boxNumber + totalObjectsCreated,
                  text: chunk.text,
                  location: 'header', // FROM object
                  startIndex: startIndex,
                  endIndex: endIndex,
                  createdAt: new Date().toISOString(),
                  meta: {
                    autoSegmented: true,
                    semanticType: chunk.semanticType,
                    sourceText: text,
                    sourcePhase: phase
                  }
                };
                
                await api.saveECObject(currentSession.id, ecObject);
                totalObjectsCreated++;
                
                logEvent('success', `✓ Oggetto creato: "${chunk.text.substring(0, 40)}..." @ [${startIndex}:${endIndex}]`);
              }
            }
          } catch (error) {
            console.error(`Errore segmentazione ${phase} per TC#${tc.id}:`, error);
            logEvent('error', `Errore ${phase} TC#${tc.id}: ${error.message}`);
            errorsCount++;
          }
        }
        
        // Piccola pausa per non sovraccaricare l'API
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      // Ricarica gli oggetti EC
      const ecObjectsResult = await api.getECObjects(currentSession.id);
      setAllECObjects(ecObjectsResult.objects || []);
      
      // Incrementa refreshKey per forzare re-render
      setRefreshKey(prev => prev + 1);
      
      const summary = `✅ Segmentazione Atomica Completata!\n\n` +
        `• Test Cases elaborati: ${testCases.length}\n` +
        `• Chunk semantici identificati: ${totalChunksCreated}\n` +
        `• Oggetti EC creati: ${totalObjectsCreated}\n` +
        (errorsCount > 0 ? `• Errori: ${errorsCount}\n` : '') +
        `\nGli oggetti FROM sono ora disponibili e pronti per essere collegati!`;
      
      logEvent('success', summary);
      alert(summary);
      
    } catch (error) {
      console.error('Errore Segmentazione Atomica:', error);
      logEvent('error', `Errore Segmentazione Atomica: ${error.message}`);
      alert(`Errore durante la segmentazione atomica: ${error.message}`);
    } finally {
      setIsAtomicSegmentationRunning(false);
      setAtomicSegmentationProgress(null);
    }
  };

  // Handler per Run LLM Assisted Match
  const handleRunLLMMatch = async () => {
    if (!currentSession?.id) return;

    try {
      setRunningLLMMatch(true);
      logEvent('info', '🤖 Avvio Run LLM Assisted Match...');

      const result = await api.runLLMMatch(currentSession.id);

      if (!result.suggestions || result.suggestions.length === 0) {
        logEvent('warning', 'Nessuna suggestion trovata dall\'LLM. Potrebbero non esserci oggetti FROM non collegati o pattern disponibili.');
        alert('Nessuna suggestion trovata. Verifica che ci siano oggetti FROM non collegati e binomi pattern disponibili.');
        return;
      }

      // Carica oggetti e binomi per il modale
      const [ecObjectsResult, binomiResult] = await Promise.all([
        api.getECObjects(currentSession.id),
        api.getBinomi(currentSession.id)
      ]);

      setLlmSuggestions(result.suggestions);
      setLlmStats(result.stats);
      setLlmBinomi(binomiResult.binomi || []);
      setShowLLMReviewModal(true);
      logEvent('success', `LLM ha trovato ${result.suggestions.length} suggestions`);
    } catch (error) {
      console.error('Errore Run LLM Match:', error);
      logEvent('error', `Errore Run LLM Match: ${error.message}`);
      alert(`Errore durante l'esecuzione del Run LLM Match: ${error.message}`);
    } finally {
      setRunningLLMMatch(false);
    }
  };

  // Handler per conferma suggestions LLM
  const handleConfirmLLMSuggestions = async (acceptedIds) => {
    if (!currentSession?.id || !acceptedIds || acceptedIds.length === 0) return;

    try {
      logEvent('info', `Conferma ${acceptedIds.length} suggestions LLM...`);
      const result = await api.confirmLLMSuggestions(currentSession.id, acceptedIds);
      
      logEvent('success', `Creati ${result.createdBinomi?.length || 0} nuovi binomi da LLM Match`);
      setShowLLMReviewModal(false);
      setLlmSuggestions(null);
      setLlmStats(null);
      setLlmBinomi([]);
      
      // Ricarica i test cases per mostrare i nuovi binomi
      setRefreshKey(prev => prev + 1);
      
      alert(`Creati ${result.createdBinomi?.length || 0} nuovi binomi. Il Documento di Contesto è stato amalgamato automaticamente.`);
    } catch (error) {
      console.error('Errore conferma LLM Suggestions:', error);
      logEvent('error', `Errore conferma suggestions: ${error.message}`);
      alert(`Errore durante la conferma: ${error.message}`);
    }
  };

// Funzione per calcolare similarità testuale tra due testi
  const calculateTextSimilarity = (text1, text2) => {
    if (!text1 || !text2) return 0;
    const normalize = (text) => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    };
    
    const words1 = normalize(text1);
    const words2 = normalize(text2);
    if (words1.length === 0 || words2.length === 0) return 0;
    
    const set1 = new Set(words1);
    const set2 = new Set(words2);
    const intersection = [...set1].filter(x => set2.has(x)).length;
    const union = new Set([...set1, ...set2]).size;
    if (union === 0) return 0;
    return intersection / union;
  };

// Funzione per trovare match parziali: cerca se l'oggetto EC è contenuto o molto simile
  // a una parte dell'enunciato del test case
  // IMPORTANTE: La porzione estratta deve essere IDENTICA (o quasi identica > 0.95) all'oggetto EC
  const findPartialMatch = (enunciato, ecObjectText) => {
    if (!enunciato || !ecObjectText) return null;
    
    // Prima prova a cercare se l'oggetto EC è contenuto esattamente nell'enunciato
    // (case-insensitive, ignorando spazi extra)
    const normalizeForExactMatch = (text) => {
      return text.toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
    };
    
    const normalizedECObject = normalizeForExactMatch(ecObjectText);
    const normalizedEnunciato = normalizeForExactMatch(enunciato);
    
    // Cerca se l'oggetto EC è contenuto esattamente nell'enunciato
    const exactIndex = normalizedEnunciato.indexOf(normalizedECObject);
    if (exactIndex >= 0) {
      // Trovato match esatto! Estrai la porzione originale
      // Cerca la posizione nel testo originale (case-sensitive)
      const ecObjectLower = ecObjectText.toLowerCase();
      const enunciatoLower = enunciato.toLowerCase();
      const foundIndex = enunciatoLower.indexOf(ecObjectLower);
      
      if (foundIndex >= 0) {
        return {
          similarity: 1.0, // Match esatto
          extractedText: enunciato.substring(foundIndex, foundIndex + ecObjectText.length),
          startIndex: foundIndex,
          endIndex: foundIndex + ecObjectText.length
        };
      }
    }
    
    // Se non c'è match esatto, prova con similarità molto alta (> 0.95)
    const normalize = (text) => {
      return text.toLowerCase()
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 2);
    };
    
    const enunciatoWords = normalize(enunciato);
    const ecObjectWords = normalize(ecObjectText);
    
    if (ecObjectWords.length === 0) return null;
    
    // Cerca sequenze che hanno similarità molto alta (> 0.95) con l'oggetto EC
    const minSequenceLength = Math.min(3, ecObjectWords.length);
    let bestMatch = null;
    let bestSimilarity = 0;
    
    for (let i = 0; i <= enunciatoWords.length - minSequenceLength; i++) {
      for (let len = ecObjectWords.length; len >= minSequenceLength; len--) {
        if (i + len > enunciatoWords.length) continue;
        
        const subsequence = enunciatoWords.slice(i, i + len);
        const similarity = calculateTextSimilarity(
          subsequence.join(' '),
          ecObjectWords.join(' ')
        );
        
        // Richiedi similarità molto alta (> 0.95) per match parziale
        if (similarity > 0.95 && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          
          // Cerca la posizione nel testo originale
          const subsequencePattern = subsequence
            .map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('\\s+');
          
          const regex = new RegExp(`\\b${subsequencePattern}\\b`, 'i');
          const match = enunciato.match(regex);
          
          if (match) {
            bestMatch = {
              similarity: similarity,
              extractedText: match[0],
              startIndex: match.index,
              endIndex: match.index + match[0].length
            };
          }
        }
      }
    }
    
    return bestMatch;
  };

  // Funzione per generare ID oggetto EC
  const generateECObjectId = (sessionId, testCaseId, boxType, boxNumber) => {
    if (!sessionId || !testCaseId) return null;
    const boxTypeUpper = boxType.toUpperCase();
    return `${sessionId}-TC${testCaseId}-${boxTypeUpper}-${boxNumber}`;
  };

  // Funzione per ottenere il prossimo numero box per un tipo
  const getNextBoxNumber = async (sessionId, testCaseId, boxType) => {
    try {
      const result = await api.getECObjects(sessionId, testCaseId);
      const existingObjects = (result.objects || []).filter(
        obj => obj.boxType === boxType && obj.testCaseId === String(testCaseId)
      );
      return existingObjects.length + 1;
    } catch (error) {
      console.error('Errore conteggio oggetti:', error);
      return 1;
    }
  };

  // Funzione per generare ID binomio
  const generateBinomioId = (sessionId, testCaseId, binomiCount) => {
    if (!sessionId || !testCaseId) return null;
    const nextNumber = String(binomiCount + 1).padStart(3, '0');
    return `bf-${sessionId}-TC${testCaseId}-${nextNumber}`;
  };

  // Funzione per cancellare tutto: oggetti EC, binomi, e codice generato
  const handleDeleteAll = async () => {
    if (!currentSession) return;

    const confirmed = window.confirm(
      'ATTENZIONE: Sei sicuro di voler cancellare TUTTO?\n\n' +
      'Questa azione cancellerà:\n' +
      '- Tutti gli Oggetti EC\n' +
      '- Tutti i Binomi Fondamentali\n' +
      '- Tutto il codice Cypress generato nei Test Cases\n' +
      '- Tutti i metadati di Autocomplete\n\n' +
      'Questa operazione NON può essere annullata.'
    );

    if (!confirmed) return;

    try {
      logEvent('info', '🗑️ Avvio cancellazione completa...');

      // 1. Cancella tutti i binomi
      const binomiResult = await api.getBinomi(currentSession.id);
      const binomi = binomiResult.binomi || [];
      for (const b of binomi) {
        await api.deleteBinomio(currentSession.id, b.id);
      }
      logEvent('success', `✅ Cancellati ${binomi.length} binomi`);

      // 2. Cancella tutti gli oggetti EC
      const objectsResult = await api.getECObjects(currentSession.id);
      const objects = objectsResult.objects || [];
      for (const obj of objects) {
        await api.deleteECObject(currentSession.id, obj.id);
      }
      logEvent('success', `✅ Cancellati ${objects.length} oggetti EC`);

      // 3. Svuota il codice generato e i metadati per tutti i test cases
      const allTestCases = await loadAllTestCasesWithState(currentSession.id);
      for (const tc of allTestCases) {
        // Reset stato test case (codice e messaggi)
        const stateKey = `session-${currentSession.id}_test_state_${tc.id}`;
        localStorage.removeItem(stateKey);
        
        // Reset file salvato (se presente)
        const fileKey = `session-${currentSession.id}_test_file_${tc.id}`;
        localStorage.removeItem(fileKey);
      }
      
      // 4. Rimuovi metadati globali di autocomplete
      localStorage.removeItem(`session-${currentSession.id}_global_autocomplete_metadata`);
      localStorage.removeItem(`session-${currentSession.id}_object_autocomplete_metadata`);

      logEvent('success', '✅ Cancellazione completa terminata! Tutti i dati sono stati resettati.');
      setRefreshKey(prev => prev + 1); // Forza aggiornamento UI

    } catch (error) {
      console.error('Errore durante la cancellazione completa:', error);
      logEvent('error', `❌ Errore cancellazione completa: ${error.message}`);
    }
  };

  // Funzione per salvare il codice preliminare con validazione
  const handleSavePreliminaryCode = async (code) => {
    if (!currentSession?.id) {
      logEvent('error', 'Nessuna sessione attiva');
      return;
    }

    try {
      logEvent('info', '🔍 Validazione codice preliminare...');
      
      // Valida e correggi il codice (modalità parziale per non chiudere describe aperti)
      const validationResponse = await fetch('http://localhost:3001/api/code-validator/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code, 
          isPartial: true // Importante: indica che è codice preliminare, quindi blocchi aperti sono OK
        })
      });
      
      const validation = await validationResponse.json();
      
      if (!validation.success) {
        logEvent('error', `Errore validazione: ${validation.error}`);
        return;
      }

      // Mostra errori e warning se presenti
      if (validation.errors && validation.errors.length > 0) {
        logEvent('warning', `⚠️ Errori rilevati:\n${validation.errors.join('\n')}`);
      }
      
      if (validation.warnings && validation.warnings.length > 0) {
        logEvent('info', `💡 Correzioni applicate:\n${validation.warnings.join('\n')}`);
      }

      // Usa il codice corretto se ci sono stati cambiamenti
      const codeToSave = validation.hasChanges ? validation.fixedCode : code;
      
      // Aggiorna lo stato con il codice corretto
      if (validation.hasChanges) {
        setPreliminaryCode(codeToSave);
        logEvent('success', '✨ Codice corretto automaticamente');
      }

      // Salva
      await api.savePreliminaryCode(currentSession.id, codeToSave);
      logEvent('success', '✅ Codice preliminare salvato');
      
    } catch (error) {
      console.error('Errore salvataggio codice preliminare:', error);
      logEvent('error', `Errore salvataggio codice preliminare: ${error.message}`);
    }
  };

  // Funzione per generare il file Cypress completo
  const handleGenerateCypressFile = async () => {
    console.log('🔍 DEBUG handleGenerateCypressFile chiamata');
    console.log('- currentSession:', currentSession?.id);
    console.log('- cypressFileName:', cypressFileName);
    console.log('- cypressOutputDir:', cypressOutputDir);
    console.log('- testCases.length:', testCases.length);
    
    if (!currentSession || !cypressFileName || !cypressOutputDir || testCases.length === 0) {
      const missing = [];
      if (!currentSession) missing.push('sessione');
      if (!cypressFileName) missing.push('nome file');
      if (!cypressOutputDir) missing.push('directory');
      if (testCases.length === 0) missing.push('test cases');
      
      logEvent('error', `⚠️ Parametri mancanti: ${missing.join(', ')}`);
      alert(`⚠️ Impossibile generare il file. Mancano:\n\n${missing.join('\n')}`);
      return;
    }

    setGeneratingCypressFile(true);
    
    try {
      // 1. AUTO-SALVATAGGIO: Salva sempre il codice preliminare corrente prima di generare
      if (preliminaryCode && preliminaryCode.trim()) {
        logEvent('info', '💾 Auto-salvataggio codice preliminare...');
        try {
          await api.savePreliminaryCode(currentSession.id, preliminaryCode);
        } catch (saveError) {
          console.error('Errore auto-salvataggio:', saveError);
          // Continuiamo comunque, magari il backend lo riceve nel body
        }
      }

      logEvent('info', `🚀 Avvio generazione file Cypress: ${cypressFileName}`);
      
      console.log('📤 Invio richiesta a backend:', {
        suiteName: currentSession.name || 'Test Suite',
        testCases: testCases.length,
        fileName: cypressFileName,
        outputDir: cypressOutputDir,
        preliminaryCode: preliminaryCode ? 'presente' : 'vuoto'
      });
      
      const response = await fetch('http://localhost:3001/api/test-generator/generate-suite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: currentSession.id,
          suiteName: currentSession.name || 'Test Suite',
          testCases: testCases,
          fileName: cypressFileName,
          outputDir: cypressOutputDir,
          preliminaryCode: preliminaryCode
        })
      });

      console.log('📥 Risposta backend ricevuta:', response.status, response.statusText);
      
      const result = await response.json();
      console.log('📋 Risultato parsed:', result);

      if (result.success) {
        logEvent('success', `✅ File Cypress generato con successo!`);
        alert(
          `✅ File Cypress generato con successo!\n\n` +
          `📁 Percorso: ${result.filePath}\n` +
          `📊 Test cases: ${result.testCasesCount}\n\n` +
          `Per eseguirlo:\n` +
          `cd ${result.projectRoot}\n` +
          `npx cypress run --spec "${result.relativePath}"`
        );
      } else {
        logEvent('error', `❌ Errore generazione file: ${result.error}`);
        alert(`❌ Errore durante la generazione del file:\n\n${result.error}`);
      }
    } catch (error) {
      console.error('Errore generazione file Cypress:', error);
      logEvent('error', `❌ Errore generazione file Cypress: ${error.message}`);
      alert(`❌ Errore durante la generazione del file:\n\n${error.message}`);
    } finally {
      setGeneratingCypressFile(false);
    }
  };

  // Funzione principale Object Autocomplete
  // ========== END GLOBAL AUTOCOMPLETE FUNCTIONS ==========

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
            {step !== 'sessions' && (currentSession || savedSessionName) && (
              <button 
                className="current-session-button"
                onClick={handleOpenActiveSession}
                disabled={loadingSession}
                title="Apri la sessione attiva"
              >
                {loadingSession ? '⏳ Caricamento...' : `Sessione attiva: ${currentSession?.name || savedSessionName}`}
              </button>
            )}
          </div>
          <div className="header-actions">
            <button 
              className="config-button"
              onClick={() => setStep('cypress-config')}
              title="Configurazione Sorgenti Cypress"
            >
              ⚙️ Config Cypress
            </button>
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
        {step === 'cypress-config' && (
          <CypressConfigPage />
        )}

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
            <CSVUploader currentSession={currentSession} onCSVLoaded={handleCSVLoaded} onLogEvent={logEvent} />
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
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                {/* Bottoni Global Autocomplete e Object Autocomplete */}
                <button
                  className="global-autocomplete-button"
                  onClick={handleGlobalAutocomplete}
                  disabled={isGlobalAutocompleteRunning}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: isGlobalAutocompleteRunning ? '#95a5a6' : '#28a745',
                    color: 'white',
                    border: 'none',
                    cursor: isGlobalAutocompleteRunning ? 'not-allowed' : 'pointer',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease'
                  }}
                  title="Global Autocomplete: Completa automaticamente tutti i box GWT vuoti basandosi su test cases simili"
                >
                  {isGlobalAutocompleteRunning ? '⏳' : '✨'}
                </button>
                <button
                  className="object-autocomplete-button"
                  onClick={handleObjectAutocomplete}
                  disabled={isObjectAutocompleteRunning}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: isObjectAutocompleteRunning ? '#95a5a6' : '#ff9800',
                    color: 'white',
                    border: 'none',
                    cursor: isObjectAutocompleteRunning ? 'not-allowed' : 'pointer',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease'
                  }}
                  title="Object Autocomplete: Raziocinio per Oggetti"
                >
                  {isObjectAutocompleteRunning ? '⏳' : '🔶'}
                </button>
                <button
                  className="atomic-segmentation-button"
                  onClick={handleAtomicSegmentation}
                  disabled={isAtomicSegmentationRunning || !currentSession?.id || testCases.length === 0}
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    backgroundColor: isAtomicSegmentationRunning ? '#95a5a6' : '#9c27b0',
                    color: 'white',
                    border: 'none',
                    cursor: (isAtomicSegmentationRunning || !currentSession?.id || testCases.length === 0) ? 'not-allowed' : 'pointer',
                    fontSize: '24px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease',
                    opacity: (!currentSession?.id || testCases.length === 0) ? 0.5 : 1
                  }}
                  title="⚛️ Segmentazione Atomica: Chunckizza automaticamente tutti gli enunciati GWT in oggetti EC semantici"
                >
                  {isAtomicSegmentationRunning ? '⏳' : '⚛️'}
                </button>
                {currentSession?.id && (
                  <>
                    <button
                      onClick={handleRunLLMMatch}
                      disabled={runningLLMMatch}
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        padding: '0',
                        backgroundColor: runningLLMMatch ? '#95a5a6' : '#8b4513',
                        color: 'white',
                        border: 'none',
                        cursor: runningLLMMatch ? 'not-allowed' : 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.3s ease'
                      }}
                      title="Run LLM Assisted Match"
                    >
                      {runningLLMMatch ? '⏳' : '🤖'}
                    </button>
                    <button 
                      onClick={() => setStep('ec-objects')} 
                      className="view-button"
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        padding: '0',
                        backgroundColor: '#667eea',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.3s ease'
                      }}
                      title="Visualizza Oggetti EC"
                    >
                      📊
                    </button>
                    <button 
                      onClick={() => setStep('binomi')} 
                      className="view-button"
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        padding: '0',
                        backgroundColor: '#ff9800',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.3s ease'
                      }}
                      title="Visualizza Binomi Fondamentali"
                    >
                      📏
                    </button>
                    <button 
                      onClick={() => setStep('context-doc')} 
                      className="view-button"
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        padding: '0',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.3s ease'
                      }}
                      title="Documento di Contesto"
                    >
                      📄
                    </button>
                    <button
                      onClick={() => setStep('business-spec')}
                      className="view-button"
                      style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        padding: '0',
                        backgroundColor: '#e67e22',
                        color: 'white',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '20px',
                        fontWeight: 'bold',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                        transition: 'all 0.3s ease'
                      }}
                      title="Business Specifications"
                    >
                      📋
                    </button>
                  </>
                )}
                <button 
                  onClick={handleExportCSV} 
                  className="export-csv-button"
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    padding: '0',
                    backgroundColor: '#28a745',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease'
                  }}
                  title="CSV Export"
                >
                  📥
                </button>
                <button 
                  onClick={handleDeleteAll} 
                  className="delete-all-button"
                  style={{
                    width: '50px',
                    height: '50px',
                    borderRadius: '50%',
                    padding: '0',
                    backgroundColor: '#dc3545',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                    transition: 'all 0.3s ease'
                  }}
                  title="Cancella Tutto (Oggetti, Binomi, Codice)"
                >
                  🗑️
                </button>
              </div>
            </div>
            
            {/* Mostra progresso Global Autocomplete se attivo */}
            {globalAutocompleteProgress && (
              <div style={{ 
                margin: '15px 0', 
                padding: '12px 15px', 
                backgroundColor: '#e3f2fd', 
                border: '1px solid #2196f3', 
                borderRadius: '5px',
                fontSize: '14px'
                }}>
                <strong>⏳ Global Autocomplete in corso...</strong>
                <div style={{ marginTop: '8px' }}>
                  {globalAutocompleteProgress.message}
                  {globalAutocompleteProgress.total > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      Progresso: {globalAutocompleteProgress.current} / {globalAutocompleteProgress.total}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Mostra progresso Segmentazione Atomica se attiva */}
            {atomicSegmentationProgress && (
              <div style={{ 
                margin: '15px 0', 
                padding: '12px 15px', 
                backgroundColor: '#f3e5f5', 
                border: '1px solid #9c27b0', 
                borderRadius: '5px',
                fontSize: '14px'
                }}>
                <strong>⏳ ⚛️ Segmentazione Atomica in corso...</strong>
                <div style={{ marginTop: '8px' }}>
                  {atomicSegmentationProgress.message}
                  {atomicSegmentationProgress.total > 0 && (
                    <div style={{ marginTop: '4px', fontSize: '12px', color: '#666' }}>
                      Progresso: {atomicSegmentationProgress.current} / {atomicSegmentationProgress.total}
                      {atomicSegmentationProgress.testCaseId && ` (Test Case #${atomicSegmentationProgress.testCaseId})`}
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {/* Sezione File Cypress di destinazione */}
            <div className="cypress-file-generation-section" style={{
              margin: '20px 0',
              padding: '20px',
              backgroundColor: '#f8f9fa',
              border: '2px solid #667eea',
              borderRadius: '8px'
            }}>
              <h3 style={{ marginTop: 0, color: '#667eea' }}>📄 Genera File Cypress</h3>
              <p style={{ color: '#666', marginBottom: '15px' }}>
                Genera un unico file Cypress con tutti i test cases di questa sessione
              </p>
              
              {/* Campo Codice Preliminare */}
              <div style={{ marginBottom: '20px' }}>
                <div style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between', 
                  alignItems: 'center',
                  marginBottom: '8px'
                }}>
                  <label style={{ fontWeight: 'bold', fontSize: '14px' }}>
                    Codice Preliminare (imports, describe, beforeEach)
                  </label>
                  <button
                    onClick={() => handleSavePreliminaryCode(preliminaryCode)}
                    style={{
                      padding: '4px 12px',
                      backgroundColor: '#28a745',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: 'bold'
                    }}
                  >
                    💾 Salva
                  </button>
                </div>
                <div style={{
                  backgroundColor: '#1e1e1e',
                  borderRadius: '4px',
                  padding: '10px',
                  fontFamily: 'monospace',
                  fontSize: '13px',
                  minHeight: '150px',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  <Editor
                    value={preliminaryCode}
                    onValueChange={code => setPreliminaryCode(code)}
                    highlight={code => highlight(code, languages.javascript, 'javascript')}
                    padding={10}
                    style={{
                      fontFamily: '"Fira code", "Fira Mono", monospace',
                      fontSize: 13,
                      minHeight: '130px'
                    }}
                    placeholder="// Inserisci qui il codice preliminare (imports, describe, beforeEach)&#10;// Esempio:&#10;// import { EquipmentPage } from '../pages/equipment_pages';&#10;// import { faker } from '@faker-js/faker';&#10;//&#10;// const equipmentPage = new EquipmentPage();&#10;// const imageTitle = 'Teste.png';"
                  />
                </div>
                <p style={{ 
                  fontSize: '11px', 
                  color: '#666', 
                  marginTop: '5px',
                  fontStyle: 'italic'
                }}>
                  💡 Questo codice verrà inserito all'inizio del file Cypress, prima di tutti gli "it"
                </p>
              </div>
              
              <div style={{ display: 'flex', gap: '15px', marginBottom: '15px', flexWrap: 'wrap' }}>
                <div style={{ flex: '1', minWidth: '250px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Nome File
                  </label>
                  <input
                    type="text"
                    value={cypressFileName}
                    onChange={(e) => setCypressFileName(e.target.value)}
                    placeholder="es. FGC-9144.cy.js"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                
                <div style={{ flex: '1', minWidth: '250px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                    Directory (relativa al progetto Cypress)
                  </label>
                  <input
                    type="text"
                    value={cypressOutputDir}
                    onChange={(e) => setCypressOutputDir(e.target.value)}
                    placeholder="es. test_cases"
                    style={{
                      width: '100%',
                      padding: '8px',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              
              {cypressFileName && cypressOutputDir && (
                <div style={{
                  padding: '10px',
                  backgroundColor: '#e3f2fd',
                  borderRadius: '4px',
                  marginBottom: '15px',
                  fontSize: '13px'
                }}>
                  <strong>ℹ️ Il file verrà salvato in:</strong>
                  <br />
                  <code style={{ 
                    backgroundColor: '#fff',
                    padding: '2px 6px',
                    borderRadius: '3px',
                    fontSize: '12px'
                  }}>
                    {`<project-root>/${cypressOutputDir}/${cypressFileName}`}
                  </code>
                </div>
              )}
              
              <button
                onClick={() => {
                  console.log('🖱️ CLICK sul bottone Genera File Cypress');
                  console.log('Bottone disabled?', !cypressFileName || !cypressOutputDir || testCases.length === 0 || generatingCypressFile);
                  handleGenerateCypressFile();
                }}
                disabled={!cypressFileName || !cypressOutputDir || testCases.length === 0 || generatingCypressFile}
                style={{
                  padding: '10px 20px',
                  backgroundColor: (!cypressFileName || !cypressOutputDir || testCases.length === 0 || generatingCypressFile) ? '#95a5a6' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '5px',
                  cursor: (!cypressFileName || !cypressOutputDir || testCases.length === 0 || generatingCypressFile) ? 'not-allowed' : 'pointer',
                  fontSize: '16px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}
              >
                {generatingCypressFile ? '⏳ Generazione...' : '🚀 Genera File Cypress'}
              </button>
              
              {/* Debug info */}
              {process.env.NODE_ENV === 'development' && (
                <div style={{ 
                  marginTop: '10px', 
                  fontSize: '11px', 
                  color: '#666',
                  padding: '8px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '4px'
                }}>
                  <strong>🔍 Debug:</strong>
                  <br/>• Sessione: {currentSession?.id ? '✅' : '❌'}
                  <br/>• Nome file: {cypressFileName ? `✅ "${cypressFileName}"` : '❌ vuoto'}
                  <br/>• Directory: {cypressOutputDir ? `✅ "${cypressOutputDir}"` : '❌ vuoto'}
                  <br/>• Test cases: {testCases.length > 0 ? `✅ ${testCases.length}` : '❌ 0'}
                  <br/>• Bottone: {(!cypressFileName || !cypressOutputDir || testCases.length === 0 || generatingCypressFile) ? '🔒 DISABILITATO' : '✅ ABILITATO'}
                </div>
              )}
            </div>
            
            <h2>Test Cases Caricati ({testCases.length})</h2>
            <div className="test-cases-list" key={refreshKey}>
              {testCases.map((tc, idx) => {
                const automationStatus = checkAutomationStatus(tc.id);
                const globalAutocompleteMeta = getGlobalAutocompleteMetadata(tc.id);
                const objectAutocompleteMeta = getObjectAutocompleteMetadata(tc.id);
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
                    
                    {/* Indicatori Object Autocomplete (Raziocinio per Oggetti) */}
                    {objectAutocompleteMeta && (
                      <div className="object-autocomplete-indicators" style={{
                        marginBottom: '10px',
                        padding: '8px',
                        backgroundColor: '#fff3e0',
                        borderRadius: '4px',
                        fontSize: '12px',
                        borderLeft: '3px solid #ff9800',
                        position: 'relative'
                      }}>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            removeObjectAutocompleteMetadata(currentSession.id, tc.id);
                            logEvent('info', `Avviso "Editato da Raziocinio per Oggetti" rimosso per Test Case #${tc.id}`);
                          }}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: 'transparent',
                            border: 'none',
                            cursor: 'pointer',
                            fontSize: '16px',
                            color: '#666',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            lineHeight: '1'
                          }}
                          title="Rimuovi avviso"
                          onMouseEnter={(e) => {
                            e.target.style.backgroundColor = '#ff9800';
                            e.target.style.color = 'white';
                          }}
                          onMouseLeave={(e) => {
                            e.target.style.backgroundColor = 'transparent';
                            e.target.style.color = '#666';
                          }}
                        >
                          ×
                        </button>
                        <strong>🛠️ Editato da Raziocinio per Oggetti:</strong>
                        <div style={{ marginTop: '4px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {objectAutocompleteMeta.given && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#ff9800', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>Given</span>
                          )}
                          {objectAutocompleteMeta.when && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#ff9800', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>When</span>
                          )}
                          {objectAutocompleteMeta.then && (
                            <span style={{ 
                              padding: '2px 8px', 
                              backgroundColor: '#ff9800', 
                              color: 'white', 
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: '600'
                            }}>Then</span>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <p>
                      <strong>Given:</strong>{' '}
                      <GherkinTextWithHighlights 
                        text={tc.given}
                        testCaseId={tc.id}
                        boxType="given"
                        ecObjects={allECObjects}
                      />
                      <CoverageIndicator percentage={calculateCoveragePercentage(tc.given, tc.id, 'given')} />
                    </p>
                    <p>
                      <strong>When:</strong>{' '}
                      <GherkinTextWithHighlights 
                        text={tc.when}
                        testCaseId={tc.id}
                        boxType="when"
                        ecObjects={allECObjects}
                      />
                      <CoverageIndicator percentage={calculateCoveragePercentage(tc.when, tc.id, 'when')} />
                    </p>
                    <p>
                      <strong>Then:</strong>{' '}
                      <GherkinTextWithHighlights 
                        text={tc.then}
                        testCaseId={tc.id}
                        boxType="then"
                        ecObjects={allECObjects}
                      />
                      <CoverageIndicator percentage={calculateCoveragePercentage(tc.then, tc.id, 'then')} />
                    </p>
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
            refreshKey={refreshKey}
            preliminaryCode={preliminaryCode}
            onPreliminaryCodeChange={setPreliminaryCode}
            onUpdateTestCase={handleUpdateTestCase}
            onBack={() => {
              setStep('testcases');
              setSelectedTestCase(null);
              setRefreshKey(prev => prev + 1); // Forza aggiornamento lista
            }}
            onLogEvent={logEvent}
          />
        )}

        {step === 'ec-objects' && currentSession && (
          <ECObjectsView
            sessionId={currentSession.id}
            onBack={() => setStep('testcases')}
            onLogEvent={logEvent}
          />
        )}

        {step === 'binomi' && currentSession && (
          <BinomiView
            sessionId={currentSession.id}
            onBack={() => setStep('testcases')}
            onLogEvent={logEvent}
            onBinomioDeleted={async (binomioId) => {
              // Quando viene rimosso un binomio, verifica se ci sono ancora binomi per i test case
              // e rimuovi i metadati Object Autocomplete se necessario
              try {
                const binomiResult = await api.getBinomi(currentSession.id);
                const allBinomi = binomiResult.binomi || [];
                
                // Raggruppa binomi per test case
                const binomiByTestCase = new Map();
                allBinomi.forEach(b => {
                  const tcId = b.testCaseId;
                  if (!binomiByTestCase.has(tcId)) {
                    binomiByTestCase.set(tcId, []);
                  }
                  binomiByTestCase.get(tcId).push(b);
                });
                
                // Verifica per ogni test case se ci sono ancora binomi
                const metadataKey = `session-${currentSession.id}_object_autocomplete_metadata`;
                const existing = localStorage.getItem(metadataKey);
                if (existing) {
                  const metadata = JSON.parse(existing);
                  let updated = false;
                  
                  Object.keys(metadata).forEach(testCaseId => {
                    // Se non ci sono più binomi per questo test case, rimuovi i metadati
                    if (!binomiByTestCase.has(testCaseId) || binomiByTestCase.get(testCaseId).length === 0) {
                      delete metadata[testCaseId];
                      updated = true;
                    }
                  });
                  
                  if (updated) {
                    localStorage.setItem(metadataKey, JSON.stringify(metadata));
                    setRefreshKey(prev => prev + 1);
                  }
                }
              } catch (error) {
                console.error('Errore verifica metadati dopo rimozione binomio:', error);
              }
            }}
          />
        )}

        {step === 'context-doc' && currentSession && (
          <ContextDocumentView
            sessionId={currentSession.id}
            onBack={() => setStep('testcases')}
            onLogEvent={logEvent}
          />
        )}

        {step === 'business-spec' && currentSession && (
          <BusinessSpecView
            sessionId={currentSession.id}
            onBack={() => setStep('testcases')}
            onLogEvent={logEvent}
          />
        )}

        {showLLMReviewModal && currentSession && (
          <LLMMatchReviewModal
            suggestions={llmSuggestions || []}
            stats={llmStats}
            ecObjects={testCases.flatMap(tc => {
              const objects = [];
              if (tc.given) objects.push(...(tc.given.objects || []));
              if (tc.when) objects.push(...(tc.when.objects || []));
              if (tc.then) objects.push(...(tc.then.objects || []));
              return objects;
            })}
            binomi={llmBinomi}
            onAccept={handleConfirmLLMSuggestions}
            onReject={() => {
              setShowLLMReviewModal(false);
              setLlmSuggestions(null);
              setLlmStats(null);
              setLlmBinomi([]);
            }}
            onClose={() => {
              setShowLLMReviewModal(false);
              setLlmSuggestions(null);
              setLlmStats(null);
              setLlmBinomi([]);
            }}
          />
        )}
      </main>
    </div>
  );
}

