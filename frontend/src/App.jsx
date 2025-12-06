import React, { useState, useEffect } from 'react';
import { CSVUploader } from './components/CSVUploader';
import { ContextBuilder } from './components/ContextBuilder';
import { TestCaseBuilder } from './components/TestCaseBuilder';
import { DiagnosticsButton } from './components/DiagnosticsButton';
import { SessionManager } from './components/SessionManager';
import { ECObjectsView } from './components/ECObjectsView';
import { BinomiView } from './components/BinomiView';
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
  const [step, setStep] = useState('sessions'); // 'sessions' | 'setup' | 'testcases' | 'builder' | 'ec-objects' | 'binomi'
  const [copyMessage, setCopyMessage] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0); // Per forzare re-render della lista
  const [loadingSession, setLoadingSession] = useState(false);
  const [isGlobalAutocompleteRunning, setIsGlobalAutocompleteRunning] = useState(false);
  const [globalAutocompleteProgress, setGlobalAutocompleteProgress] = useState(null);
  const [isObjectAutocompleteRunning, setIsObjectAutocompleteRunning] = useState(false);
  const [savedSessionName, setSavedSessionName] = useState(null);

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

  // Funzione principale Object Autocomplete
  const handleObjectAutocomplete = async () => {
    if (!currentSession) {
      logEvent('error', 'Nessuna sessione disponibile');
      return;
    }

    setIsObjectAutocompleteRunning(true);
    try {
      logEvent('info', '🚀 Avvio Object Autocomplete (Raziocinio per Oggetti)...');
      
      // Fase 1: Preparazione Dati
      logEvent('info', '📦 Fase 1: Caricamento oggetti EC e binomi fondamentali...');
      const [ecObjectsResult, binomiResult] = await Promise.all([
        api.getECObjects(currentSession.id),
        api.getBinomi(currentSession.id)
      ]);
      
      const allECObjects = ecObjectsResult.objects || [];
      const allBinomi = binomiResult.binomi || [];
      
      logEvent('info', `✅ Caricati ${allECObjects.length} oggetti EC e ${allBinomi.length} binomi fondamentali`);
      
      // Filtra oggetti EC che hanno binomi (solo quelli con codice associato)
      logEvent('info', '🔍 Analisi binomi per identificare oggetti EC con codice associato...');
      const ecObjectsWithBinomi = new Set();
      const fromObjectToCodeMap = new Map(); // fromObjectId -> toObject (codice)
      
      for (const binomio of allBinomi) {
        ecObjectsWithBinomi.add(binomio.fromObjectId);
        const toObject = allECObjects.find(obj => obj.id === binomio.toObjectId);
        if (toObject) {
          fromObjectToCodeMap.set(binomio.fromObjectId, toObject);
        }
      }
      
      // Filtra oggetti EC "From" (enunciati GWT, location: 'header') che hanno binomi
      const fromECObjects = allECObjects.filter(obj => 
        obj.location === 'header' && ecObjectsWithBinomi.has(obj.id)
      );
      
      if (fromECObjects.length === 0) {
        logEvent('warning', '⚠️ Nessun oggetto EC con binomio trovato. Crea prima alcuni oggetti EC con binomi.');
        return;
      }
      
      logEvent('info', `✅ Trovati ${fromECObjects.length} oggetti EC "From" (enunciati) con codice associato`);
      
      // Carica tutti i test cases della sessione
      logEvent('info', '📋 Caricamento test cases della sessione...');
      const allTestCases = await loadAllTestCasesWithState(currentSession.id);
      
      if (allTestCases.length === 0) {
        logEvent('warning', '⚠️ Nessun test case trovato nella sessione');
        return;
      }
      
      logEvent('info', `✅ Caricati ${allTestCases.length} test cases`);
      logEvent('info', '🔍 Fase 2: Ricerca similarità tra enunciati GWT e oggetti EC...');
      
      // Fase 2: Ricerca Similarità e Creazione Oggetti
      let totalMatches = 0;
      let totalObjectsCreated = 0;
      let totalBinomiCreated = 0;
      const matches = []; // { testCaseId, phase, enunciato, matchedECObject, codiceAssociato }
      const completedFields = {}; // Per salvare i metadati
      
      for (let i = 0; i < allTestCases.length; i++) {
        const testCase = allTestCases[i];
        logEvent('info', `🔎 Analizzando Test Case #${testCase.id} (${i + 1}/${allTestCases.length})...`);
        
        // Per ogni fase GWT (given, when, then)
        for (const phase of ['given', 'when', 'then']) {
          const phaseText = testCase[phase];
          if (!phaseText || !phaseText.trim()) continue;
          
          logEvent('info', `  📝 Analizzando fase ${phase.toUpperCase()}: "${phaseText.substring(0, 50)}${phaseText.length > 50 ? '...' : ''}"`);
          
          // Cerca match con oggetti EC "From"
          // IMPORTANTE: Escludi gli oggetti EC che appartengono già a questo test case
          // per evitare di creare duplicati nel test case di origine
          const fromECObjectsToCheck = fromECObjects.filter(obj => 
            obj.testCaseId !== String(testCase.id)
          );
          
          let matchFound = false;
          for (const fromECObject of fromECObjectsToCheck) {
            // Prima prova con match completo
            let similarity = calculateTextSimilarity(phaseText, fromECObject.text);
            let extractedText = null;
            let startIndex = 0;
            let endIndex = phaseText.length;
            
            // Se la similarità è bassa, prova con match parziale
            if (similarity < 0.7) {
              const partialMatch = findPartialMatch(phaseText, fromECObject.text);
              if (partialMatch && partialMatch.similarity >= 0.7) {
                similarity = partialMatch.similarity;
                extractedText = partialMatch.extractedText;
                startIndex = partialMatch.startIndex;
                endIndex = partialMatch.endIndex;
              }
            } else {
              // Match completo: usa tutto l'enunciato
              extractedText = phaseText;
            }
            
            // Soglia di similarità: 0.7 (alta)
            if (similarity >= 0.7) {
              const toObject = fromObjectToCodeMap.get(fromECObject.id);
              if (toObject) {
                // IMPORTANTE: Verifica sovrapposizioni PRIMA di aggiungere il match
                // Controlla se esiste già un oggetto EC "From" per questo test case e fase che si sovrappone
                const finalTextToCheck = extractedText || phaseText;
                const existingFromObjectsForPhase = allECObjects.filter(obj => 
                  obj.testCaseId === String(testCase.id) &&
                  obj.boxType === phase &&
                  obj.location === 'header'
                );
                
                // Verifica se il nuovo oggetto si sovrappone a uno esistente
                let hasOverlap = false;
                for (const existingObj of existingFromObjectsForPhase) {
                  const existingText = existingObj.text.toLowerCase().trim();
                  const newText = finalTextToCheck.toLowerCase().trim();
                  
                  // Controlla se il nuovo testo è contenuto nell'esistente o viceversa
                  // Questo previene sovrapposizioni come "the user is at path..." vs "Given the user is at path..."
                  if (existingText.includes(newText) || newText.includes(existingText)) {
                    hasOverlap = true;
                    logEvent('warning', `  ⚠️ Sovrapposizione rilevata! Esiste già un oggetto EC "From" per TC${testCase.id} - ${phase.toUpperCase()}: "${existingObj.text.substring(0, 50)}${existingObj.text.length > 50 ? '...' : ''}". Il nuovo oggetto "${finalTextToCheck.substring(0, 50)}${finalTextToCheck.length > 50 ? '...' : ''}" si sovrappone. Match saltato.`);
                    break;
                  }
                }
                
                // Aggiungi il match solo se non c'è sovrapposizione
                if (!hasOverlap) {
                  matches.push({
                    testCaseId: testCase.id,
                    phase: phase,
                    enunciato: phaseText, // Testo completo originale
                    extractedText: extractedText, // Porzione estratta (se match parziale)
                    startIndex: startIndex,
                    endIndex: endIndex,
                    matchedECObject: fromECObject,
                    codiceAssociato: toObject,
                    similarity: similarity
                  });
                  totalMatches++;
                  matchFound = true;
                  const matchType = extractedText && extractedText !== phaseText ? ' (parziale)' : '';
                  logEvent('success', `    ✅ Match trovato${matchType}! Similarità: ${(similarity * 100).toFixed(1)}% con oggetto EC "${fromECObject.text.substring(0, 40)}..."`);
                }
              }
            }
          }
          if (!matchFound) {
            logEvent('info', `    ⏭️ Nessun match trovato per questa fase`);
          }
        }
      }
      
      logEvent('info', `✅ Fase 2 completata: trovati ${totalMatches} match con similarità >= 0.7`);
      
      if (matches.length === 0) {
        logEvent('info', 'ℹ️ Nessun match trovato. Prova a creare più oggetti EC con binomi.');
        return;
      }
      
      // Fase 3: Creazione Oggetti EC e Inserimento Codice
      logEvent('info', '🔨 Fase 3: Creazione oggetti EC e inserimento codice...');
      
      // Inizializza contatori binomi per ogni test case con i valori esistenti
      const binomiCountByTestCase = new Map(); // testCaseId -> count
      for (const binomio of allBinomi) {
        const tcId = binomio.testCaseId;
        const currentCount = binomiCountByTestCase.get(tcId) || 0;
        binomiCountByTestCase.set(tcId, currentCount + 1);
      }
      
      // Raggruppa match per test case e fase per evitare duplicati
      const processedMatches = new Set();
      
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const matchKey = `${match.testCaseId}-${match.phase}`;
        
        // Processa solo il match con la similarità più alta per ogni test case + fase
        if (processedMatches.has(matchKey)) continue;
        
        // Trova il match migliore per questa combinazione
        const bestMatch = matches
          .filter(m => `${m.testCaseId}-${m.phase}` === matchKey)
          .sort((a, b) => b.similarity - a.similarity)[0];
        
        processedMatches.add(matchKey);
        
        logEvent('info', `🔧 Processando match ${i + 1}/${matches.length}: TC${bestMatch.testCaseId} - ${bestMatch.phase.toUpperCase()} (similarità: ${(bestMatch.similarity * 100).toFixed(1)}%)`);
        
        try {
          // Verifica se esiste già un binomio per questa combinazione testCaseId + phase
          // per evitare duplicati quando si esegue Object Autocomplete più volte
          const fullText = bestMatch.enunciato;
          const matchedText = bestMatch.matchedECObject.text;
          const similarity = bestMatch.similarity;
          
          let startIndex, endIndex, finalText;
          
          // Se c'è un testo estratto (match parziale), usalo
          if (bestMatch.extractedText) {
            finalText = bestMatch.extractedText;
            startIndex = bestMatch.startIndex;
            endIndex = bestMatch.endIndex;
          } else if (similarity > 0.9) {
            // Match completo con alta similarità
            finalText = fullText;
            startIndex = 0;
            endIndex = fullText.length;
          } else {
            // Cerca la posizione nel testo
            const lowerFullText = fullText.toLowerCase();
            const lowerMatchedText = matchedText.toLowerCase();
            const foundIndex = lowerFullText.indexOf(lowerMatchedText);
            
            if (foundIndex >= 0) {
              finalText = matchedText;
              startIndex = foundIndex;
              endIndex = foundIndex + matchedText.length;
            } else {
              finalText = fullText;
              startIndex = 0;
              endIndex = fullText.length;
            }
          }
          
          // Verifica se esiste già un oggetto EC "From" con lo stesso testo per questo test case e fase
          const existingFromObject = allECObjects.find(obj => 
            obj.testCaseId === String(bestMatch.testCaseId) &&
            obj.boxType === bestMatch.phase &&
            obj.location === 'header' &&
            obj.text === finalText
          );
          
          // IMPORTANTE: Verifica sovrapposizioni con oggetti EC "From" esistenti
          // Se esiste già un oggetto EC "From" per questo test case e fase, verifica se il nuovo si sovrappone
          if (!existingFromObject) {
            const existingFromObjectsForPhase = allECObjects.filter(obj => 
              obj.testCaseId === String(bestMatch.testCaseId) &&
              obj.boxType === bestMatch.phase &&
              obj.location === 'header'
            );
            
            // Verifica se il nuovo oggetto si sovrappone a uno esistente
            let hasOverlap = false;
            for (const existingObj of existingFromObjectsForPhase) {
              const existingText = existingObj.text.toLowerCase().trim();
              const newText = finalText.toLowerCase().trim();
              
              // Controlla se il nuovo testo è contenuto nell'esistente o viceversa
              // Questo previene sovrapposizioni come "the user is at path..." vs "Given the user is at path..."
              // IMPORTANTE: Non considerare sovrapposizione se i testi sono identici (già gestito da existingFromObject)
              if (existingText !== newText && (existingText.includes(newText) || newText.includes(existingText))) {
                hasOverlap = true;
                logEvent('warning', `  ⚠️ Sovrapposizione rilevata! Esiste già un oggetto EC "From" per TC${bestMatch.testCaseId} - ${bestMatch.phase.toUpperCase()}: "${existingObj.text.substring(0, 50)}${existingObj.text.length > 50 ? '...' : ''}". Il nuovo oggetto "${finalText.substring(0, 50)}${finalText.length > 50 ? '...' : ''}" si sovrappone. Saltato.`);
                break;
              }
            }
            
            if (hasOverlap) {
              continue; // Salta questo match per evitare sovrapposizione
            }
          }
          
          let fromObjectId;
          let fromECObject;
          let boxNumber;
          
          if (existingFromObject) {
            // Verifica se esiste già un binomio che collega questo oggetto EC "From" a un oggetto EC "To" con lo stesso codice
            const existingBinomio = allBinomi.find(b => 
              b.fromObjectId === existingFromObject.id &&
              b.testCaseId === String(bestMatch.testCaseId)
            );
            
            if (existingBinomio) {
              const existingToObject = allECObjects.find(obj => obj.id === existingBinomio.toObjectId);
              if (existingToObject && existingToObject.text === bestMatch.codiceAssociato.text) {
                logEvent('info', `  ⏭️ Binomio già esistente per TC${bestMatch.testCaseId} - ${bestMatch.phase.toUpperCase()}. Saltato.`);
                continue;
              }
            }
            
            // Usa l'oggetto EC "From" esistente
            fromObjectId = existingFromObject.id;
            fromECObject = existingFromObject;
            boxNumber = existingFromObject.boxNumber;
            logEvent('info', `  ℹ️ Oggetto EC "From" già esistente: ${fromObjectId}`);
          } else {
            // 1. Crea oggetto EC per l'enunciato
            logEvent('info', `  📌 Creazione oggetto EC "From" per enunciato...`);
            boxNumber = await getNextBoxNumber(
              currentSession.id,
              bestMatch.testCaseId,
              bestMatch.phase
            );
            fromObjectId = generateECObjectId(
              currentSession.id,
              bestMatch.testCaseId,
              bestMatch.phase,
              boxNumber
            );
            
            if (!fromObjectId) {
              logEvent('error', `    ❌ Impossibile generare ID per oggetto EC in TC${bestMatch.testCaseId}`);
              continue;
            }
            
            fromECObject = {
              id: fromObjectId,
              sessionId: currentSession.id,
              testCaseId: String(bestMatch.testCaseId),
              boxType: bestMatch.phase,
              boxNumber: boxNumber,
              text: finalText,
              location: 'header',
              startIndex: startIndex,
              endIndex: endIndex,
              createdAt: new Date().toISOString()
            };
            
            await api.saveECObject(currentSession.id, fromECObject);
            totalObjectsCreated++;
            logEvent('success', `    ✅ Oggetto EC "From" creato: ${fromObjectId}`);
          }
          
          // 2. Verifica se esiste già un oggetto EC "To" con lo stesso codice
          const existingToObject = allECObjects.find(obj => 
            obj.testCaseId === String(bestMatch.testCaseId) &&
            obj.boxType === bestMatch.phase &&
            obj.location === 'content' &&
            obj.text === bestMatch.codiceAssociato.text
          );
          
          let toObjectId;
          let toECObject;
          
          if (existingToObject) {
            // Usa l'oggetto EC "To" esistente
            toObjectId = existingToObject.id;
            toECObject = existingToObject;
            logEvent('info', `  ℹ️ Oggetto EC "To" già esistente: ${toObjectId}`);
          } else {
            // Crea oggetto EC per il codice
            logEvent('info', `  💻 Creazione oggetto EC "To" per codice...`);
            const codeBoxNumber = boxNumber + 1;
            toObjectId = generateECObjectId(
              currentSession.id,
              bestMatch.testCaseId,
              bestMatch.phase,
              codeBoxNumber
            );
            
            if (!toObjectId) {
              logEvent('error', `    ❌ Impossibile generare ID per oggetto EC codice in TC${bestMatch.testCaseId}`);
              continue;
            }
            
            toECObject = {
              id: toObjectId,
              sessionId: currentSession.id,
              testCaseId: String(bestMatch.testCaseId),
              boxType: bestMatch.phase,
              boxNumber: codeBoxNumber,
              text: bestMatch.codiceAssociato.text,
              location: 'content',
              startIndex: 0,
              endIndex: bestMatch.codiceAssociato.text.length,
              createdAt: new Date().toISOString()
            };
            
            await api.saveECObject(currentSession.id, toECObject);
            totalObjectsCreated++;
            logEvent('success', `    ✅ Oggetto EC "To" creato: ${toObjectId}`);
          }
          
          // 3. Verifica se esiste già un binomio che collega questi due oggetti EC
          const existingBinomioForObjects = allBinomi.find(b => 
            b.fromObjectId === fromObjectId &&
            b.toObjectId === toObjectId &&
            b.testCaseId === String(bestMatch.testCaseId)
          );
          
          if (existingBinomioForObjects) {
            logEvent('info', `  ⏭️ Binomio già esistente che collega questi oggetti EC. Saltato.`);
            continue;
          }
          
          // Crea binomio fondamentale
          logEvent('info', `  🔗 Creazione binomio fondamentale...`);
          const currentCount = binomiCountByTestCase.get(bestMatch.testCaseId) || 0;
          binomiCountByTestCase.set(bestMatch.testCaseId, currentCount + 1);
          
          const binomioId = generateBinomioId(
            currentSession.id,
            bestMatch.testCaseId,
            currentCount
          );
          
          if (binomioId) {
            const binomio = {
              id: binomioId,
              sessionId: currentSession.id,
              testCaseId: String(bestMatch.testCaseId),
              fromObjectId: fromObjectId,
              toObjectId: toObjectId,
              fromPoint: { x: 0.5, y: 1 },
              toPoint: { x: 0.5, y: 0 },
              createdAt: new Date().toISOString()
            };
            
            await api.saveBinomio(currentSession.id, binomio);
            totalBinomiCreated++;
            logEvent('success', `    ✅ Binomio fondamentale creato: ${binomioId}`);
          }
          
          // 4. Inserisci codice nel test case (smart insertion)
          logEvent('info', `  📝 Inserimento codice nel test case...`);
          await saveGeneratedCode(
            bestMatch.testCaseId,
            bestMatch.phase,
            bestMatch.codiceAssociato.text,
            null,
            currentSession.id
          );
          logEvent('success', `    ✅ Codice inserito nel box ${bestMatch.phase.toUpperCase()}`);
          
          // Salva metadati per questo test case
          if (!completedFields[bestMatch.testCaseId]) {
            completedFields[bestMatch.testCaseId] = {};
          }
          completedFields[bestMatch.testCaseId][bestMatch.phase] = true;
          
          logEvent('success', `✅ Processato TC${bestMatch.testCaseId} - ${bestMatch.phase.toUpperCase()}: creati oggetti EC e binomio`);
          
        } catch (error) {
          console.error('Errore processamento match:', error);
          logEvent('error', `❌ Errore processamento match per TC${match.testCaseId}: ${error.message}`);
        }
      }
      
      // Salva i metadati
      if (Object.keys(completedFields).length > 0) {
        saveObjectAutocompleteMetadata(currentSession.id, completedFields);
      }
      
      logEvent('success', `✅ Object Autocomplete completato!`);
      logEvent('info', `📊 Statistiche finali: ${totalMatches} match trovati, ${totalObjectsCreated} oggetti EC creati, ${totalBinomiCreated} binomi creati`);
      
      // Forza refresh della lista
      setRefreshKey(prev => prev + 1);
      
    } catch (error) {
      console.error('Errore Object Autocomplete:', error);
      logEvent('error', `❌ Errore Object Autocomplete: ${error.message}`);
    } finally {
      setIsObjectAutocompleteRunning(false);
    }
  };

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
                {currentSession?.id && (
                  <>
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
                      🔗
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
                        <strong>🔷 Editato da Raziocinio per Oggetti:</strong>
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
      </main>
    </div>
  );
}

