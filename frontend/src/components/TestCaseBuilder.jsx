import { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import { api } from '../services/api';
import { CypressRunner } from './CypressRunner';
import { ECObjectsView } from './ECObjectsView';
import { BinomiView } from './BinomiView';
import '../styles/TestCaseBuilder.css';
import '@tensorflow/tfjs';

/**
 * Componente per costruire un test case con AI
 */
export function TestCaseBuilder({ testCase, context, onBack, onLogEvent, onUpdateTestCase, currentSession }) {
  const [allObjects, setAllObjects] = useState([]); // Raccoglie tutti gli oggetti da tutti i blocchi GWT
  const [loadedECObjects, setLoadedECObjects] = useState([]); // Oggetti EC caricati dal database
  const [loadedBinomi, setLoadedBinomi] = useState([]); // Binomi caricati dal database
  const [showECObjectsView, setShowECObjectsView] = useState(false);
  const [showBinomiView, setShowBinomiView] = useState(false);
  
  // Funzione per generare ID oggetto EC
  const generateECObjectId = useCallback((boxType, boxNumber) => {
    if (!currentSession?.id || !testCase?.id) {
      return null;
    }
    const boxTypeUpper = boxType.toUpperCase();
    return `${currentSession.id}-TC${testCase.id}-${boxTypeUpper}-${boxNumber}`;
  }, [currentSession?.id, testCase?.id]);

  // Funzione per contare oggetti esistenti per box type nel database
  const getNextBoxNumber = useCallback(async (boxType) => {
    if (!currentSession?.id || !testCase?.id) {
      return 1;
    }
    try {
      const result = await api.getECObjects(currentSession.id, testCase.id);
      const existingObjects = (result.objects || []).filter(
        obj => obj.boxType === boxType && obj.testCaseId === String(testCase.id)
      );
      return existingObjects.length + 1;
    } catch (error) {
      console.error('Errore conteggio oggetti:', error);
      return 1;
    }
  }, [currentSession?.id, testCase?.id]);

  // Contatore locale per garantire unicità degli ID binomi
  const binomioCounterRef = useRef(new Map()); // Map<testCaseId, counter>
  
  // Funzione per generare ID binomio univoco
  const generateBinomioId = useCallback(() => {
    if (!currentSession?.id || !testCase?.id) {
      return null;
    }
    const testCaseIdStr = String(testCase.id);
    
    // Inizializza il contatore con il numero di binomi esistenti per questo test case
    if (!binomioCounterRef.current.has(testCaseIdStr)) {
      const existingBinomi = loadedBinomi.filter(
        b => b.testCaseId === testCaseIdStr
      );
      binomioCounterRef.current.set(testCaseIdStr, existingBinomi.length);
    }
    
    // Incrementa il contatore per questo test case
    const currentCount = binomioCounterRef.current.get(testCaseIdStr) || 0;
    const nextCount = currentCount + 1;
    binomioCounterRef.current.set(testCaseIdStr, nextCount);
    
    // Usa timestamp per garantire unicità assoluta anche in caso di salvataggi rapidi/contemporanei
    const timestamp = Date.now();
    const nextNumber = String(nextCount).padStart(3, '0');
    // Formato: bf-{sessionId}-TC{testCaseId}-{numeroSequenziale}-{timestamp}
    return `bf-${currentSession.id}-TC${testCase.id}-${nextNumber}-${timestamp}`;
  }, [currentSession?.id, testCase?.id, loadedBinomi]);
  
  // Reset del contatore quando cambiano sessione o test case
  useEffect(() => {
    binomioCounterRef.current.clear();
  }, [currentSession?.id, testCase?.id]);
  
  // Inizializza il contatore quando vengono caricati i binomi
  useEffect(() => {
    if (loadedBinomi.length > 0 && testCase?.id) {
      const testCaseIdStr = String(testCase.id);
      const existingBinomi = loadedBinomi.filter(
        b => b.testCaseId === testCaseIdStr
      );
      // Trova il numero sequenziale massimo tra i binomi esistenti
      let maxNumber = 0;
      for (const binomio of existingBinomi) {
        // Estrai il numero sequenziale dall'ID (formato: ...-NNN-timestamp)
        const match = binomio.id.match(/-TC\d+-(\d{3})-/);
        if (match) {
          const num = parseInt(match[1], 10);
          maxNumber = Math.max(maxNumber, num);
        }
      }
      binomioCounterRef.current.set(testCaseIdStr, maxNumber);
      console.log(`Contatore binomi inizializzato per TC${testCaseIdStr}: ${maxNumber}`);
    }
  }, [loadedBinomi, testCase?.id]);

  // Funzione per caricare oggetti EC e binomi dal database
  const loadECData = useCallback(async () => {
    if (!currentSession?.id || !testCase?.id) {
      return;
    }
    try {
      const [objectsResult, binomiResult] = await Promise.all([
        api.getECObjects(currentSession.id, testCase.id),
        api.getBinomi(currentSession.id, testCase.id)
      ]);
      setLoadedECObjects(objectsResult.objects || []);
      setLoadedBinomi(binomiResult.binomi || []);
      console.log('Oggetti EC caricati:', objectsResult.objects?.length || 0);
      console.log('Binomi caricati:', binomiResult.binomi?.length || 0);
    } catch (error) {
      console.error('Errore caricamento dati EC:', error);
      onLogEvent?.('error', `Errore caricamento oggetti EC: ${error.message}`);
    }
  }, [currentSession?.id, testCase?.id, onLogEvent]);

  // Carica oggetti EC e binomi dal database al mount
  useEffect(() => {
    loadECData();
  }, [loadECData]);
  
  // Ricarica oggetti EC quando si ritorna da ECObjectsView
  useEffect(() => {
    if (!showECObjectsView && currentSession?.id && testCase?.id) {
      // Ricarica gli oggetti EC quando si ritorna dalla vista
      loadECData();
    }
  }, [showECObjectsView, currentSession?.id, testCase?.id, loadECData]);
  
  // Callback per aggiornare loadedECObjects quando viene salvato un nuovo oggetto EC
  const handleECObjectSaved = useCallback((ecObject) => {
    // Verifica che l'oggetto appartenga al test case corrente
    if (ecObject.testCaseId !== String(testCase?.id)) {
      console.log('Oggetto EC ignorato: appartiene a un test case diverso', ecObject.id);
      return;
    }
    
    setLoadedECObjects(prev => {
      const existing = prev.find(obj => obj.id === ecObject.id);
      if (existing) {
        // Se esiste già, aggiornalo
        return prev.map(obj => obj.id === ecObject.id ? ecObject : obj);
      } else {
        // Altrimenti aggiungilo
        console.log('📝 Aggiunto nuovo oggetto EC a loadedECObjects:', ecObject.id);
        return [...prev, ecObject];
      }
    });
  }, [testCase?.id]);
  
  // Callback per aggiornare loadedBinomi quando viene salvato un nuovo binomio
  const handleBinomioSaved = useCallback((binomio) => {
    setLoadedBinomi(prev => {
      const existing = prev.find(b => b.id === binomio.id);
      if (existing) {
        // Se esiste già, aggiornalo
        return prev.map(b => b.id === binomio.id ? binomio : b);
      } else {
        // Altrimenti aggiungilo
        console.log('📝 Aggiunto nuovo binomio a loadedBinomi:', binomio.id);
        return [...prev, binomio];
      }
    });
  }, []);
  
  // Callback per aggiornare loadedBinomi quando viene cancellato un binomio
  const handleBinomioDeleted = useCallback((binomioId) => {
    setLoadedBinomi(prev => {
      const filtered = prev.filter(b => b.id !== binomioId);
      console.log('🗑️ Rimosso binomio da loadedBinomi:', binomioId);
      return filtered;
    });
  }, []);

  // Helper per ottenere oggetti per un box type specifico
  const getObjectsForBoxType = useCallback((boxType) => {
    return loadedECObjects.filter(obj => 
      obj.boxType === boxType && 
      obj.testCaseId === String(testCase?.id)
    );
  }, [loadedECObjects, testCase?.id]);
  
  // Callback memoizzati per onObjectsChange per evitare re-render infiniti
  const handleGivenObjectsChange = useCallback((objects) => {
    setAllObjects(prev => {
      const filtered = prev.filter(obj => !obj.id.startsWith('given-'));
      return [...filtered, ...objects.map(obj => ({ ...obj, id: `given-${obj.id || Date.now()}` }))];
    });
  }, []);
  
  const handleWhenObjectsChange = useCallback((objects) => {
    setAllObjects(prev => {
      const filtered = prev.filter(obj => !obj.id.startsWith('when-'));
      return [...filtered, ...objects.map(obj => ({ ...obj, id: `when-${obj.id || Date.now()}` }))];
    });
  }, []);
  
  const handleThenObjectsChange = useCallback((objects) => {
    setAllObjects(prev => {
      const filtered = prev.filter(obj => !obj.id.startsWith('then-'));
      return [...filtered, ...objects.map(obj => ({ ...obj, id: `then-${obj.id || Date.now()}` }))];
    });
  }, []);
  
  // Espone gli oggetti per il report diagnostico
  useEffect(() => {
    window.g2a_testObjects = allObjects;
    return () => {
      delete window.g2a_testObjects;
    };
  }, [allObjects]);
  const [expandedBlocks, setExpandedBlocks] = useState({
    given: false,
    when: false,
    then: false
  });

  const [blockStates, setBlockStates] = useState({
    given: { messages: [], code: '', loading: false, prompt: '' },
    when: { messages: [], code: '', loading: false, prompt: '' },
    then: { messages: [], code: '', loading: false, prompt: '' }
  });
  const [semanticModel, setSemanticModel] = useState(null);
  const embeddingCacheRef = useRef({});

  const [showRunner, setShowRunner] = useState(false);
  const [runnerCode, setRunnerCode] = useState('');
  const [targetFilePath, setTargetFilePath] = useState('');
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const testFileStorageKey = useMemo(
    () => {
      if (!testCase) return null;
      return currentSession 
        ? `session-${currentSession.id}_test_file_${testCase.id}`
        : `g2a_test_file_${testCase.id}`;
    },
    [testCase?.id, currentSession?.id]
  );

  const testStateStorageKey = useMemo(
    () => {
      if (!testCase) return null;
      return currentSession 
        ? `session-${currentSession.id}_test_state_${testCase.id}`
        : `g2a_test_state_${testCase.id}`;
    },
    [testCase?.id, currentSession?.id]
  );

  // Carica lo stato salvato quando il componente viene montato o cambia il testCase
  useEffect(() => {
    if (!testCase?.id || !testStateStorageKey) {
      return;
    }

    setIsLoadingState(true);
    try {
      const saved = localStorage.getItem(testStateStorageKey);
      console.log('=== CARICAMENTO STATO ===');
      console.log('Chiave:', testStateStorageKey);
      console.log('Dati salvati trovati:', !!saved);
      
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log('Stato parsato:', {
          hasGivenCode: !!parsed.blockStates?.given?.code,
          hasWhenCode: !!parsed.blockStates?.when?.code,
          hasThenCode: !!parsed.blockStates?.then?.code,
          givenCodeLength: parsed.blockStates?.given?.code?.length || 0,
          whenCodeLength: parsed.blockStates?.when?.code?.length || 0,
          thenCodeLength: parsed.blockStates?.then?.code?.length || 0
        });
        
        if (parsed.blockStates) {
          const newState = {
            given: {
              messages: parsed.blockStates.given?.messages || [],
              code: parsed.blockStates.given?.code || '',
              loading: false,
              prompt: parsed.blockStates.given?.prompt || ''
            },
            when: {
              messages: parsed.blockStates.when?.messages || [],
              code: parsed.blockStates.when?.code || '',
              loading: false,
              prompt: parsed.blockStates.when?.prompt || ''
            },
            then: {
              messages: parsed.blockStates.then?.messages || [],
              code: parsed.blockStates.then?.code || '',
              loading: false,
              prompt: parsed.blockStates.then?.prompt || ''
            }
          };
          console.log('Impostazione nuovo stato:', {
            givenCodeLength: newState.given.code.length,
            whenCodeLength: newState.when.code.length,
            thenCodeLength: newState.then.code.length
          });
          setBlockStates(newState);
        }
        if (parsed.expandedBlocks) {
          setExpandedBlocks(parsed.expandedBlocks);
        }
        setHasLoadedState(true);
        onLogEvent?.('info', `Stato test case #${testCase.id} ripristinato`);
      } else {
        console.log('Nessuno stato salvato trovato per questo test case');
        setHasLoadedState(true); // Anche se non c'è stato salvato, segna come caricato
      }
    } catch (error) {
      console.error('Errore caricamento stato test case:', error);
      onLogEvent?.('error', `Errore caricamento stato: ${error.message}`);
      setHasLoadedState(true); // Anche in caso di errore, segna come caricato
    } finally {
      // Aspetta di più prima di permettere il salvataggio per evitare loop
      setTimeout(() => {
        console.log('Caricamento completato, abilitazione salvataggio');
        setIsLoadingState(false);
      }, 500);
    }
  }, [testCase?.id, testStateStorageKey]); // Solo quando cambia il testCase

  useEffect(() => {
    let isActive = true;
    const loadSemanticModel = async () => {
      try {
        const use = await import('@tensorflow-models/universal-sentence-encoder');
        const model = await use.load();
        if (!isActive) return;
        setSemanticModel(model);
        console.info('[Semantic Reasoning] Universal Sentence Encoder caricato');
      } catch (error) {
        if (!isActive) return;
        console.error('[Semantic Reasoning] Errore caricamento USE:', error);
      }
    };

    loadSemanticModel();
    return () => {
      isActive = false;
    };
  }, []);

  // Funzione helper per salvare lo stato
  const saveStateToLocalStorage = useCallback(() => {
    if (!testCase?.id || !testStateStorageKey || isLoadingState || !hasLoadedState) {
      return;
    }

    // IMPORTANTE: Salva sempre lo stato, anche se è vuoto, per permettere di cancellare il contenuto
    // e sovrascrivere il vecchio valore nel localStorage
    try {
      const stateToSave = {
        blockStates: {
          given: {
            code: blockStates.given.code,
            messages: blockStates.given.messages,
            prompt: blockStates.given.prompt
          },
          when: {
            code: blockStates.when.code,
            messages: blockStates.when.messages,
            prompt: blockStates.when.prompt
          },
          then: {
            code: blockStates.then.code,
            messages: blockStates.then.messages,
            prompt: blockStates.then.prompt
          }
        },
        expandedBlocks,
        lastSaved: new Date().toISOString(),
        saved: blockStates.saved || false, // Mantieni il flag saved se già presente
        // Salva anche i dati del test case per Wide Reasoning
        testCaseData: {
          given: testCase.given,
          when: testCase.when,
          then: testCase.then
        }
      };
      console.log('=== SALVATAGGIO STATO ===');
      console.log('Dati da salvare:', {
        givenCodeLength: stateToSave.blockStates.given.code.length,
        whenCodeLength: stateToSave.blockStates.when.code.length,
        thenCodeLength: stateToSave.blockStates.then.code.length
      });
      localStorage.setItem(testStateStorageKey, JSON.stringify(stateToSave));
      console.log('Stato salvato con successo');
    } catch (error) {
      console.error('Errore salvataggio stato test case:', error);
      onLogEvent?.('error', `Errore salvataggio stato: ${error.message}`);
    }
  }, [blockStates, expandedBlocks, testCase, testStateStorageKey, isLoadingState, hasLoadedState, onLogEvent]);

  // Salva lo stato in localStorage quando cambia (con debounce per evitare salvataggi troppo frequenti)
  useEffect(() => {
    if (!testCase?.id || !testStateStorageKey || isLoadingState || !hasLoadedState) {
      return;
    }

    // Debounce: salva dopo 500ms di inattività
    const timeoutId = setTimeout(() => {
      saveStateToLocalStorage();
    }, 500);

    // Cleanup: salva immediatamente quando il componente viene smontato o quando cambia il test case
    return () => {
      clearTimeout(timeoutId);
      // Salvataggio immediato al cleanup per assicurarsi che le modifiche vengano salvate
      saveStateToLocalStorage();
    };
  }, [blockStates.given.code, blockStates.given.messages, blockStates.given.prompt,
      blockStates.when.code, blockStates.when.messages, blockStates.when.prompt,
      blockStates.then.code, blockStates.then.messages, blockStates.then.prompt,
      expandedBlocks, testCase?.id, testStateStorageKey, isLoadingState, hasLoadedState, saveStateToLocalStorage]);

  // Helper per generare un percorso più leggibile usando il nome della sessione
  const getReadableSessionPath = (session, fileName) => {
    if (!session?.basePath) return null;
    
    if (session.name) {
      // Genera un percorso più leggibile usando il nome della sessione invece dell'UUID
      const basePathParts = session.basePath.split(/[/\\]/);
      const sessionsIndex = basePathParts.findIndex(part => part === 'sessions');
      
      if (sessionsIndex !== -1) {
        // Costruisci il percorso usando il nome della sessione
        const sessionsBase = basePathParts.slice(0, sessionsIndex + 1).join('\\');
        // Sanitizza il nome della sessione per usarlo come nome directory (rimuovi caratteri non validi)
        const sanitizedName = session.name.replace(/[<>:"/\\|?*]/g, '_').trim();
        const testFilesDir = `${sessionsBase}\\${sanitizedName}\\test_files`;
        return fileName ? `${testFilesDir}\\${fileName}` : testFilesDir;
      }
    }
    
    // Fallback: usa il basePath originale con UUID
    const defaultDir = session.basePath.includes('\\')
      ? `${session.basePath}\\test_files`
      : `${session.basePath}/test_files`;
    return fileName ? `${defaultDir}\\${fileName}` : defaultDir;
  };

  useEffect(() => {
    if (!testCase) {
      setTargetFilePath('');
      return;
    }
    let storedPath = '';
    if (testFileStorageKey) {
      try {
        storedPath = localStorage.getItem(testFileStorageKey) || '';
      } catch {
        storedPath = '';
      }
    }
    
    // Se non c'è un percorso salvato, usa il default basato sulla sessione
    if (!storedPath && !testCase.automation) {
      let defaultPath;
      if (currentSession) {
        const defaultFileName = `test_case${testCase.id}.cy.js`;
        const readablePath = getReadableSessionPath(currentSession, defaultFileName);
        defaultPath = readablePath || `C:\\Users\\Antonio Nuzzi\\g2a\\test\\${defaultFileName}`;
      } else {
        // Fallback al vecchio percorso
        defaultPath = `C:\\Users\\Antonio Nuzzi\\g2a\\test\\test_case${testCase.id}.cy.js`;
      }
      setTargetFilePath(defaultPath);
      // Salva in localStorage
      if (testFileStorageKey) {
        try {
          localStorage.setItem(testFileStorageKey, defaultPath);
        } catch (error) {
          console.error('Errore salvataggio percorso test file:', error);
        }
      }
    } else {
      const initialPath = storedPath || testCase.automation || '';
      setTargetFilePath(initialPath);
    }
  }, [testCase, testFileStorageKey, currentSession]);

  const persistTargetFilePath = (value) => {
    setTargetFilePath(value);
    if (testCase?.id && onUpdateTestCase) {
      onUpdateTestCase(testCase.id, { automation: value });
    }
    if (testFileStorageKey) {
      try {
        if (value) {
          localStorage.setItem(testFileStorageKey, value);
        } else {
          localStorage.removeItem(testFileStorageKey);
        }
      } catch (error) {
        console.error('Errore salvataggio percorso test file:', error);
      }
    }
  };

  const handleBrowseTestFile = async () => {
    try {
      onLogEvent?.('info', 'Seleziona il file Cypress da sovrascrivere');
      const result = await api.selectFile(
        'Seleziona file Cypress di destinazione',
        'Cypress Spec|*.cy.js;*.cy.ts;*.js;*.ts;*.tsx|Tutti i file|*.*'
      );
      if (result?.path) {
        persistTargetFilePath(result.path);
        onLogEvent?.('success', `File Cypress selezionato: ${result.path}`);
      } else if (result?.error) {
        onLogEvent?.('error', `Errore selezione file: ${result.error}`);
      }
    } catch (error) {
      onLogEvent?.('error', `Errore selezione file: ${error.message}`);
    }
  };

  /**
   * Combina il codice di tutte e tre le fasi in un unico test Cypress
   */
  const buildCompleteTestCode = () => {
    const givenCode = blockStates.given.code || '';
    const whenCode = blockStates.when.code || '';
    const thenCode = blockStates.then.code || '';

    // Se non c'è codice, restituisci un test vuoto
    if (!givenCode && !whenCode && !thenCode) {
      return '';
    }

    // Funzione per validare e correggere il codice (bilanciamento parentesi, rimozione righe incomplete)
    const sanitizeCode = (code) => {
      if (!code) return '';
      
      const lines = code.split('\n');
      const sanitizedLines = [];
      
      for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        const trimmed = line.trim();
        
        // Se la riga termina con una chiamata incompleta (es: .click( senza chiusura), correggila
        if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('*')) {
          // Pattern per chiamate incomplete: .metodo( senza chiusura )
          const incompleteCall = trimmed.match(/\.(click|type|get|contains|wait|should|trigger|visit|log)\([^)]*$/);
          if (incompleteCall) {
            // Se la riga termina con .metodo( ma non ha ), aggiungi );
            if (!trimmed.includes(')')) {
              line = line.trimEnd() + ');';
            } else if (trimmed.endsWith('(')) {
              line = line.trimEnd() + ');';
            }
          }
          
          // Pattern per chiamate con parametri ma senza chiusura: .metodo('param' senza )
          if (trimmed.match(/['"][^'"]*$/)) {
            // Se termina con una stringa non chiusa, potrebbe essere incompleta
            // Ma non la correggiamo automaticamente per evitare errori
          }
        }
        
        sanitizedLines.push(line);
      }
      
      let sanitized = sanitizedLines.join('\n');
      
      // Conta parentesi finali per bilanciare
      let openParens = 0;
      let openBraces = 0;
      for (const char of sanitized) {
        if (char === '(') openParens++;
        if (char === ')') openParens--;
        if (char === '{') openBraces++;
        if (char === '}') openBraces--;
      }
      
      // Aggiungi parentesi mancanti alla fine se necessario (ma solo se sono poche)
      if (openParens > 0 && openParens <= 5) {
        sanitized += ')'.repeat(openParens);
      }
      if (openBraces > 0 && openBraces <= 5) {
        sanitized += '}'.repeat(openBraces);
      }
      
      return sanitized;
    };

    // Estrai solo il corpo del codice (rimuovi describe/it se presenti)
    const extractBody = (code, phaseType = null) => {
      if (!code) return '';
      
      let cleaned = code.trim();
      
      // Sanitizza il codice prima di processarlo
      cleaned = sanitizeCode(cleaned);
      
      // Se il codice contiene describe/it, estrai solo il contenuto del blocco it()
      const itMatch = cleaned.match(/it\([^)]*\)\s*=>\s*\{?\s*([\s\S]*?)\s*\}?\s*\}\)?\s*;?\s*$/);
      if (itMatch) {
        cleaned = itMatch[1].trim();
      } else {
        // Se non c'è it(), prova a rimuovere describe() se presente
        cleaned = cleaned.replace(/describe\([^)]*\)\s*=>\s*\{?\s*/g, '');
      }
      
      // Rimuovi TUTTE le chiusure finali (iterativo per gestire multiple chiusure)
      let previousLength = cleaned.length;
      do {
        previousLength = cleaned.length;
        // Rimuovi chiusure alla fine: }); oppure }); oppure } oppure );
        cleaned = cleaned.replace(/\s*\}\)?\s*;?\s*$/g, '');
        cleaned = cleaned.replace(/\s*\}\s*$/g, '');
        cleaned = cleaned.replace(/\s*\)\s*;?\s*$/g, '');
        cleaned = cleaned.trim();
      } while (cleaned.length < previousLength && cleaned.length > 0);
      
      // Rimuovi tutti i commenti di fase e log duplicati
      cleaned = cleaned
        .replace(/\/\/\s*=====\s*(GIVEN|WHEN|THEN)\s*PHASE\s*=====/gi, '')
        .replace(/cy\.log\(['"][🔵🟡🟢]\s*(GIVEN|WHEN|THEN):.*?['"]\);/g, '')
        .trim();
      
      // Per WHEN e THEN: rimuovi cy.visit() (la navigazione è già stata fatta in GIVEN)
      if (phaseType === 'when' || phaseType === 'then') {
        // Rimuovi righe che contengono cy.visit()
        const visitFilterLines = cleaned.split('\n');
        cleaned = visitFilterLines
          .filter(line => {
            const trimmed = line.trim();
            // Rimuovi righe con cy.visit() ma mantieni i commenti
            if (trimmed.includes('cy.visit(') && !trimmed.startsWith('//')) {
              return false;
            }
            return true;
          })
          .join('\n');
      }
      
      // Rimuovi righe con placeholder o URL non validi
      const placeholderLines = cleaned.split('\n');
      cleaned = placeholderLines
        .filter(line => {
          const trimmed = line.trim();
          // Rimuovi righe con placeholder comuni
          if (trimmed.includes('URL_DELLA_TUA_PAGINA') || 
              trimmed.includes('SOSTITUISCI') || 
              trimmed.includes('REPLACE') ||
              trimmed.match(/cy\.visit\(['"]URL_/i)) {
            return false;
          }
          return true;
        })
        .join('\n');
      
      // Correggi chiamate incomplete comuni
      cleaned = cleaned
        .replace(/\.click\(\s*$/gm, '.click();') // .click( senza chiusura diventa .click();
        .replace(/\.type\(\s*$/gm, '.type(\'\');') // .type( senza parametri
        .replace(/\.visit\(\s*$/gm, '.visit(\'\');'); // .visit( senza URL
      
      // Rimuovi indentazione iniziale comune (se presente)
      const indentLines = cleaned.split('\n');
      if (indentLines.length > 0) {
        // Trova il numero minimo di spazi all'inizio delle righe
        const minIndent = indentLines
          .filter(line => line.trim())
          .reduce((min, line) => {
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            return Math.min(min, indent);
          }, Infinity);
        
        // Rimuovi l'indentazione comune
        if (minIndent > 0 && minIndent < Infinity) {
          cleaned = indentLines.map(line => {
            if (line.trim()) {
              return line.substring(minIndent);
            }
            return line;
          }).join('\n');
        }
      }
      
      // Rimuovi eventuali righe vuote eccessive
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
      
      // Sanitizza di nuovo dopo la pulizia
      cleaned = sanitizeCode(cleaned);
      
      return cleaned.trim();
    };

    const givenBody = extractBody(givenCode);
    // Rimuovi cy.visit() da WHEN e THEN (la navigazione è già stata fatta in GIVEN)
    const whenBody = extractBody(whenCode, 'when');
    const thenBody = extractBody(thenCode, 'then');

    const formatPhaseLines = (cleanBody, phaseLabel, emoji, statement) => {
      const phaseLines = [
        `    // ===== ${phaseLabel} PHASE =====`,
        `    cy.log('${emoji} ${phaseLabel}: ${statement}');`
      ];

      if (!cleanBody) {
        return phaseLines;
      }

      const rawLines = cleanBody.split('\n');
      const hasContent = rawLines.some(line => line.trim().length > 0);
      if (!hasContent) {
        return phaseLines;
      }

      rawLines.forEach(line => {
        const trimmedEnd = line.replace(/\s+$/g, '');
        if (trimmedEnd.trim().length === 0) {
          phaseLines.push('');
        } else {
          phaseLines.push(`    ${trimmedEnd}`);
        }
      });

      return phaseLines;
    };

    const appendPhaseBlock = (collector, blockLines) => {
      if (!blockLines.length) return collector;
      if (collector.length > 0) {
        collector.push('');
      }
      return [...collector, ...blockLines];
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
      const lines = formatPhaseLines(cleanGiven, 'GIVEN', '🔵', testCase.given);
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
      const lines = formatPhaseLines(cleanWhen, 'WHEN', '🟡', testCase.when);
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
      const lines = formatPhaseLines(cleanThen, 'THEN', '🟢', testCase.then);
      phaseLines = appendPhaseBlock(phaseLines, lines);
    }

    if (phaseLines.length) {
      completeCode += `${phaseLines.join('\n')}\n`;
    }

    completeCode += `  });\n`;
    completeCode += `});`;

    return completeCode;
  };

  const toggleBlock = (blockType) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [blockType]: !prev[blockType]
    }));
  };

  /**
   * Recupera tutti i test case da localStorage (tranne quello corrente)
   */
  const normalizeTextForCache = (text) => {
    if (!text) return '';
    return text.trim().replace(/\s+/g, ' ').toLowerCase();
  };

  const cosineSimilarity = (vecA, vecB) => {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0;
    let magnitudeA = 0;
    let magnitudeB = 0;
    for (let i = 0; i < vecA.length; i += 1) {
      dotProduct += vecA[i] * vecB[i];
      magnitudeA += vecA[i] * vecA[i];
      magnitudeB += vecB[i] * vecB[i];
    }
    if (magnitudeA === 0 || magnitudeB === 0) return 0;
    return Math.max(0, dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB)));
  };

  const getEmbeddingForText = async (text) => {
    if (!semanticModel) return null;
    const cacheKey = normalizeTextForCache(text);
    if (!cacheKey) return null;
    if (embeddingCacheRef.current[cacheKey]) {
      return embeddingCacheRef.current[cacheKey];
    }
    try {
      const embeddings = await semanticModel.embed([cacheKey]);
      const array = await embeddings.array();
      embeddings.dispose();
      const result = array[0];
      embeddingCacheRef.current[cacheKey] = result;
      return result;
    } catch (error) {
      console.warn('[Semantic Reasoning] Impossibile generare embedding:', error);
      return null;
    }
  };

  const getAllOtherTestCases = () => {
    const allTestCases = [];
    try {
      // Scansiona tutte le chiavi in localStorage
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('g2a_test_state_')) {
          const testCaseId = key.replace('g2a_test_state_', '');
          // Salta il test case corrente
          if (testCaseId === String(testCase?.id)) continue;
          
          try {
            const saved = localStorage.getItem(key);
            if (saved) {
              const parsed = JSON.parse(saved);
              // Ora abbiamo anche i dati del test case salvati nello stato
              allTestCases.push({
                id: testCaseId,
                blockStates: parsed.blockStates,
                testCaseData: parsed.testCaseData || {}
              });
            }
          } catch (error) {
            console.error(`Errore parsing test case ${testCaseId}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Errore recupero test cases:', error);
    }
    return allTestCases;
  };

  /**
   * Trova test case simili basandosi sulla similarità del testo
   * Cerca in tutte le fasi del test case, non solo quella corrente
   */
  const findSimilarTestCases = async (currentBlockText, blockType) => {
    const allOtherTestCases = getAllOtherTestCases();
    if (!currentBlockText) {
      return [];
    }

    const similarCases = [];
    const trimmedCurrentText = currentBlockText.trim();
    const currentEmbedding = trimmedCurrentText 
      ? await getEmbeddingForText(trimmedCurrentText) 
      : null;

    const calculateSimilarity = (text1, text2) => {
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

    const measureSimilarity = async (candidateText) => {
      if (!candidateText) return 0;
      const trimmedCandidate = candidateText.trim();
      if (!trimmedCandidate) return 0;
      let similarity = 0;
      if (currentEmbedding) {
        const candidateEmbedding = await getEmbeddingForText(trimmedCandidate);
        if (candidateEmbedding) {
          similarity = cosineSimilarity(currentEmbedding, candidateEmbedding);
        }
      }
      if (!similarity) {
        similarity = calculateSimilarity(trimmedCurrentText, trimmedCandidate);
      }
      return similarity;
    };

    for (const tc of allOtherTestCases) {
      let bestSimilarity = 0;
      let bestBlockText = '';
      let bestBlockCode = '';
      let bestBlockType = blockType;

      const evaluatePhase = async (phase, isPrimaryPhase) => {
        const phaseText = tc.testCaseData?.[phase] || '';
        const phaseCode = tc.blockStates?.[phase]?.code || '';
        if (!phaseText || !phaseCode.trim()) return;

        let similarity = 0;
        try {
          similarity = await measureSimilarity(phaseText);
        } catch (error) {
          console.warn('[Semantic Reasoning] Errore comparazione testi:', error);
        }
        if (!similarity || similarity <= 0) return;

        const shouldReplace = isPrimaryPhase
          ? similarity > bestSimilarity
          : similarity > bestSimilarity * 1.1;

        if (shouldReplace) {
          bestSimilarity = similarity;
          bestBlockText = phaseText;
          bestBlockCode = phaseCode;
          bestBlockType = phase;
        }
      };

      await evaluatePhase(blockType, true);
      for (const phase of ['given', 'when', 'then']) {
        if (phase === blockType) continue;
        await evaluatePhase(phase, false);
      }

      if (bestSimilarity > 0.08 && bestBlockCode.trim()) {
        similarCases.push({
          id: tc.id,
          similarity: bestSimilarity,
          blockText: bestBlockText,
          blockType: bestBlockType,
          code: bestBlockCode,
          allPhases: {
            given: tc.testCaseData?.given || '',
            when: tc.testCaseData?.when || '',
            then: tc.testCaseData?.then || ''
          },
          allCode: {
            given: tc.blockStates?.given?.code || '',
            when: tc.blockStates?.when?.code || '',
            then: tc.blockStates?.then?.code || ''
          }
        });
      }
    }

    return similarCases
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  const handleSendPrompt = async (blockType, text, wideReasoning = false) => {
    if (!text.trim() || !testCase) return;

    const blockText = {
      given: testCase.given,
      when: testCase.when,
      then: testCase.then
    }[blockType];

    // RILEVA AUTOMATICAMENTE se l'utente chiede di cercare in altri test case
    const wideReasoningKeywords = [
      'altri casi di test', 'altri test case', 'altri test', 
      'ritrovare', 'ritrova', 'cerca in', 'cercare in',
      'negli altri test', 'nei casi di test', 'nei test precedenti',
      'hai già fatto', 'già implementato', 'già risolto',
      'test simili', 'casi simili', 'problema simile',
      'esempi precedenti', 'altri esempi', 'soluzioni simili'
    ];
    
    const textLower = text.toLowerCase();
    const shouldAutoActivateWideReasoning = wideReasoningKeywords.some(keyword => 
      textLower.includes(keyword)
    );
    
    // Attiva Wide Reasoning se richiesto esplicitamente o se il flag è già attivo
    const finalWideReasoning = wideReasoning || shouldAutoActivateWideReasoning;
    
    if (shouldAutoActivateWideReasoning && !wideReasoning) {
      onLogEvent?.('info', '🔍 Rilevata richiesta di ricerca in altri test case - attivazione automatica Wide Reasoning');
    }

    const currentState = blockStates[blockType];
    const newMessages = [...currentState.messages, { role: 'user', content: text }];
    const allowedRoles = new Set(['system', 'user', 'assistant', 'function', 'tool', 'developer']);
    const conversationHistory = newMessages.filter(msg => allowedRoles.has(msg.role));
    
    // Aggiorna stato con nuovo messaggio utente
    setBlockStates(prev => ({
      ...prev,
      [blockType]: {
        ...prev[blockType],
        messages: newMessages,
        prompt: '',
        loading: true,
        wideReasoningActive: finalWideReasoning // Salva lo stato Wide Reasoning
      }
    }));

    const modeText = finalWideReasoning ? ' (Wide Reasoning attivo)' : '';
    onLogEvent?.('info', `Invio prompt per ${blockType}: ${text.substring(0, 50)}...${modeText}`);

    try {
      // Crea actionPart basato sul blocco
      const actionPart = {
        type: blockType,
        description: blockText,
        target: null,
        value: null
      };

      // AGGIUNGI CONTESTO DELLE ALTRE FASI
      const otherPhasesContext = {
        given: blockType !== 'given' ? {
          text: testCase.given,
          code: blockStates.given.code || ''
        } : null,
        when: blockType !== 'when' ? {
          text: testCase.when,
          code: blockStates.when.code || ''
        } : null,
        then: blockType !== 'then' ? {
          text: testCase.then,
          code: blockStates.then.code || ''
        } : null
      };

      // Se wideReasoning è attivo, trova test case simili
      let similarTestCases = [];
      if (finalWideReasoning) {
        try {
          similarTestCases = await findSimilarTestCases(blockText, blockType);
        } catch (error) {
          console.error('[Wide Reasoning] Errore ricerca test simili:', error);
          similarTestCases = [];
        }
        console.log(`[Wide Reasoning] Trovati ${similarTestCases.length} test case simili:`, similarTestCases);
        if (similarTestCases.length > 0) {
          const details = similarTestCases.map(tc => 
            `TC#${tc.id} (${(tc.similarity * 100).toFixed(0)}% similarità)`
          ).join(', ');
          onLogEvent?.('info', `✅ Trovati ${similarTestCases.length} test case simili: ${details}`);
          console.log(`[Wide Reasoning] Dettagli test case simili:`, similarTestCases.map(tc => ({
            id: tc.id,
            similarity: `${(tc.similarity * 100).toFixed(1)}%`,
            blockText: tc.blockText?.substring(0, 50) + '...',
            hasCode: !!tc.code,
            codeLength: tc.code?.length || 0
          })));
        } else {
          onLogEvent?.('warning', '⚠️ Nessun test case simile trovato con codice. Verifica che esistano altri test case con automazione completata.');
          console.warn(`[Wide Reasoning] Nessun test case simile trovato. Test case corrente: "${blockText.substring(0, 50)}..."`);
        }
      }

      // Ottimizza il contesto: invia solo i dati essenziali
      // Invece dell'intero oggetto context, invia solo i riferimenti
      const optimizedContext = {
        selectorsCount: effectiveContext.selectors?.length || 0,
        methodsCount: effectiveContext.methods?.length || 0,
        filesAnalyzed: effectiveContext.filesAnalyzed?.length || 0,
        // Invia solo i primi 50 selettori e 10 metodi per ridurre il payload
        selectors: effectiveContext.selectors?.slice(0, 50) || [],
        methods: effectiveContext.methods?.slice(0, 10) || [],
        groupedSelectors: effectiveContext.groupedSelectors || {},
        // AGGIUNGI CONTESTO DELLE ALTRE FASI
        otherPhases: otherPhasesContext,
        // AGGIUNGI TEST CASE SIMILI SE WIDE REASONING È ATTIVO
        wideReasoning: finalWideReasoning,
        similarTestCases: similarTestCases
      };

      const result = await api.chatWithAI(text, actionPart, optimizedContext, conversationHistory);
      
      // Estrai codice se presente nella risposta
      const codeMatch = result.response.match(/```(?:javascript|js|cypress)?\n?([\s\S]*?)```/);
      const extractedCode = codeMatch ? codeMatch[1].trim() : '';
      
      // Se non c'è codice in formato markdown, cerca direttamente comandi Cypress
      let finalCode = extractedCode;
      if (!finalCode && result.response.includes('cy.')) {
        // Estrai tutte le righe che contengono cy.
        const lines = result.response.split('\n').filter(line => 
          line.trim().startsWith('cy.') || 
          line.trim().match(/^\s*(cy\.|it\(|describe\(|before\(|after\()/)
        );
        finalCode = lines.join('\n');
      }

      // AGGIUNGI LOG E COMMENTO ALLA FASE
      if (finalCode) {
        const phaseLabel = blockType.toUpperCase();
        const phaseEmoji = blockType === 'given' ? '🔵' : blockType === 'when' ? '🟡' : '🟢';
        const phaseComment = `// ===== ${phaseLabel} PHASE =====`;
        const phaseLog = `cy.log('${phaseEmoji} ${phaseLabel}: ${blockText}');`;
        
        // Rimuovi eventuali wrapper describe/it se presenti nel codice generato
        let cleanCode = finalCode
          .replace(/describe\([^)]*\)\s*=>\s*\{?\s*it\([^)]*\)\s*=>\s*\{?\s*/g, '')
          .replace(/\s*\}?\s*\}?\s*$/g, '') // Rimuovi tutte le chiusure finali
          .trim();
        
        // Rimuovi eventuali commenti e log duplicati se già presenti
        cleanCode = cleanCode
          .replace(/\/\/\s*=====\s*[A-Z]+\s*PHASE\s*=====/gi, '')
          .replace(/cy\.log\(['"][🔵🟡🟢]\s*[A-Z]+:.*?['"]\);/g, '')
          .trim();
        
        // Aggiungi commento e log all'inizio solo se il codice non è vuoto
        if (cleanCode) {
          finalCode = `${phaseComment}\n${phaseLog}\n${cleanCode}`;
        } else {
          finalCode = `${phaseComment}\n${phaseLog}`;
        }
      }

      setBlockStates(prev => ({
        ...prev,
        [blockType]: {
          ...prev[blockType],
          messages: [...newMessages, { role: 'assistant', content: result.response }],
          code: finalCode || prev[blockType].code,
          loading: false
        }
      }));

      if (finalCode) {
        onLogEvent?.('success', `Codice Cypress generato per ${blockType}`);
      }
    } catch (error) {
      onLogEvent?.('error', `Errore chat AI per ${blockType}: ${error.message}`);
      setBlockStates(prev => ({
        ...prev,
        [blockType]: {
          ...prev[blockType],
          messages: [...newMessages, { role: 'error', content: `Errore: ${error.message}` }],
          loading: false
        }
      }));
    }
  };

  const handlePromptChange = (blockType, value) => {
    setBlockStates(prev => ({
      ...prev,
      [blockType]: {
        ...prev[blockType],
        prompt: value
      }
    }));
  };

  const handleCodeChange = (blockType, value) => {
    setBlockStates(prev => ({
      ...prev,
      [blockType]: {
        ...prev[blockType],
        code: value
      }
    }));
    // Il salvataggio verrà eseguito automaticamente dal useEffect con debounce
    // ma assicuriamoci che venga triggerato
  };

  // Salvataggio esplicito quando si esce dal componente o si cambia test case
  useEffect(() => {
    return () => {
      // Cleanup: salva lo stato quando il componente viene smontato
      if (testCase?.id && testStateStorageKey && hasLoadedState && !isLoadingState) {
        saveStateToLocalStorage();
      }
    };
  }, [testCase?.id, testStateStorageKey, hasLoadedState, isLoadingState, saveStateToLocalStorage]);

  const handleTargetFileInput = (e) => {
    persistTargetFilePath(e.target.value);
  };

  if (!testCase) {
    return <div>Nessun test case selezionato</div>;
  }

  // Crea un contesto vuoto di default se non è disponibile
  // Questo permette di usare il Test Builder anche senza contesto preliminare
  const defaultContext = {
    selectors: [],
    methods: [],
    filesAnalyzed: [],
    resources: [],
    groupedSelectors: {}
  };
  const effectiveContext = context || defaultContext;

  // MODIFICA onOpenRunner per usare il codice completo
  const extractCodeFromAIResponse = (responseText) => {
    if (!responseText) return '';
    const codeMatch = responseText.match(/```(?:javascript|js|cypress)?\n?([\s\S]*?)```/);
    if (codeMatch) {
      return codeMatch[1].trim();
    }
    if (responseText.includes('cy.')) {
      const lines = responseText.split('\n').filter(line => line.trim().startsWith('cy.') || line.trim().match(/^\s*(cy\.|it\(|describe\()/i));
      if (lines.length) {
        return lines.join('\n').trim();
      }
    }
    return responseText.trim();
  };

  const reviewMergedCodeWithAI = async (mergedCode) => {
    if (!mergedCode.trim()) return mergedCode;

    const actionPart = {
      type: 'review',
      description: 'Revisione del codice unito prima di eseguire il test completo',
      target: null,
      value: null
    };

    const contextForReview = {
      selectorsCount: effectiveContext.selectors?.length || 0,
      methodsCount: effectiveContext.methods?.length || 0,
      filesAnalyzed: effectiveContext.filesAnalyzed?.length || 0,
      selectors: effectiveContext.selectors?.slice(0, 20) || [],
      methods: effectiveContext.methods?.slice(0, 10) || [],
      groupedSelectors: effectiveContext.groupedSelectors || {},
      otherPhases: {
        given: { text: testCase.given },
        when: { text: testCase.when },
        then: { text: testCase.then }
      }
    };

    const reviewPrompt = `Hai di fronte il test Cypress completo che unisce GIVEN, WHEN e THEN. Il tuo compito è:
1. Verificare che non ci siano parentesi mancanti o duplicate (}, ), etc.).
2. Assicurarti che il codice sia ordinato in modo organico e che le fasi non si "sovrappongano".
3. Correggere automaticamente qualsiasi errore di merge (parantesi, ripetizioni, indentazioni), ma senza aggiungere új nuovo comportamento.
4. Rispondere SOLO con il blocco di codice corretto in formato Cypress (usa markdown con \`\`\`javascript per evidenziare il codice).

Codice da rivedere:
${mergedCode}
`;

    try {
      const aiResult = await api.chatWithAI(reviewPrompt, actionPart, contextForReview, []);
      const aiResponse = aiResult?.response || aiResult;
      const cleanedCode = extractCodeFromAIResponse(aiResponse);
      if (cleanedCode && cleanedCode.length > 0) {
        onLogEvent?.('info', 'L\'AI ha rivisto il codice completo prima dell\'esecuzione.');
        return cleanedCode;
      }
    } catch (error) {
      console.warn('Revisione AI fallita, uso codice originale:', error);
      onLogEvent?.('warning', 'Revisione AI fallita, viene usato il codice originale.');
    }

    return mergedCode;
  };

  const handleOpenRunner = async () => {
    if (!targetFilePath?.trim()) {
      onLogEvent?.('error', 'Specifica un file Cypress di destinazione prima di eseguire il test completo.');
      return;
    }
    const completeCode = buildCompleteTestCode();
    if (completeCode) {
      const reviewedCode = await reviewMergedCodeWithAI(completeCode);
      setRunnerCode(reviewedCode);
      setShowRunner(true);
    } else {
      onLogEvent?.('warning', 'Nessun codice disponibile. Genera codice per almeno una fase prima di testare.');
    }
  };

  const handleSaveFile = async () => {
    const completeCode = buildCompleteTestCode();
    if (!completeCode) {
      onLogEvent?.('warning', 'Nessun codice disponibile. Genera codice per almeno una fase prima di salvare.');
      return;
    }

    // Usa percorso sessione se disponibile (genera percorso leggibile se non c'è targetFilePath)
    let defaultPath;
    if (currentSession) {
      const defaultFileName = `test_case${testCase.id}.cy.js`;
      const readablePath = getReadableSessionPath(currentSession, defaultFileName);
      defaultPath = readablePath || `C:\\Users\\Antonio Nuzzi\\g2a\\test\\${defaultFileName}`;
    } else {
      defaultPath = `C:\\Users\\Antonio Nuzzi\\g2a\\test\\test_case${testCase.id}.cy.js`;
    }
    const filePathToUse = targetFilePath || defaultPath;
    
    if (!filePathToUse.trim()) {
      onLogEvent?.('error', 'Specifica un file Cypress di destinazione prima di salvare.');
      return;
    }

    try {
      onLogEvent?.('info', `Salvataggio file: ${filePathToUse}`);
      const result = await api.saveCypressFile(completeCode, filePathToUse);
      
      if (result.success) {
        onLogEvent?.('success', `File salvato con successo: ${result.filePath}`);
        // Aggiorna il percorso se non era già impostato
        if (!targetFilePath) {
          persistTargetFilePath(result.filePath);
        }
        // Segna che è stato fatto Save aggiornando lo stato salvato
        if (testStateStorageKey) {
          try {
            const saved = localStorage.getItem(testStateStorageKey);
            if (saved) {
              const parsed = JSON.parse(saved);
              parsed.saved = true;
              parsed.lastSaved = new Date().toISOString();
              localStorage.setItem(testStateStorageKey, JSON.stringify(parsed));
            }
          } catch (error) {
            console.error('Errore aggiornamento flag saved:', error);
          }
        }
      } else {
        onLogEvent?.('error', `Errore salvataggio: ${result.error}`);
      }
    } catch (error) {
      onLogEvent?.('error', `Errore salvataggio file: ${error.message}`);
    }
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

  // Trova blocchi GWT simili già codificati
  const findSimilarGWTBlocks = async (targetText, phase, codedTestCases) => {
    if (!semanticModel) {
      // Fallback: usa similarità testuale semplice
      return findSimilarBlocksSimple(targetText, phase, codedTestCases);
    }
    
    try {
      // Genera embedding per il testo target
      const targetEmbedding = await semanticModel.embed([targetText]);
      const targetVector = await targetEmbedding.array();
      
      const similarities = [];
      
      for (const tc of codedTestCases) {
        const phaseText = tc[phase];
        const phaseCode = tc.blockStates?.[phase]?.code?.trim();
        
        if (!phaseText || !phaseCode) continue;
        
        // Genera embedding per il testo del test case codificato
        const tcEmbedding = await semanticModel.embed([phaseText]);
        const tcVector = await tcEmbedding.array();
        
        // Calcola similarità coseno
        const similarity = cosineSimilarity(targetVector[0], tcVector[0]);
        
        if (similarity > 0.5) { // Soglia di similarità
          similarities.push({
            testCaseId: tc.id,
            text: phaseText,
            code: phaseCode,
            messages: tc.blockStates?.[phase]?.messages || [],
            similarity
          });
        }
      }
      
      // Ordina per similarità e prendi i top 3
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 3);
        
    } catch (error) {
      console.error('Errore semantic similarity:', error);
      return findSimilarBlocksSimple(targetText, phase, codedTestCases);
    }
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
              // Rileva se è una correzione (l'AI deve capirlo automaticamente)
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
    
    // Aggiorna il codice
    blockStates[phase].code = code;
    
    // Aggiungi messaggio nella chat con la spiegazione
    blockStates[phase].messages.push({
      role: 'assistant',
      content: `✨ Codice generato automaticamente tramite Global Autocomplete:\n\n${explanation}\n\nIl codice è stato generato basandosi su test cases simili già codificati.`
    });
    
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
        onLogEvent?.('info', `Nessun enunciato simile trovato per ${phase.toUpperCase()} del Test Case #${testCase.id}`);
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
        
        onLogEvent?.('success', `✅ Completato ${phase.toUpperCase()} per Test Case #${testCase.id}`);
      }
    }
    
    return completed;
  };

  // ========== END GLOBAL AUTOCOMPLETE FUNCTIONS ==========
  // Nota: handleGlobalAutocomplete è stata spostata in App.jsx

  // ========== GLOBAL COMPLETE PER SINGOLO BOX GWT ==========

  // Trova box GWT simili per Global Complete (cerca tra TUTTI i test cases, non solo codificati)
  const findSimilarGWTBlocksForGlobalComplete = async (targetText, phase, allTestCases) => {
    if (!semanticModel) {
      return findSimilarBlocksSimpleForGlobalComplete(targetText, phase, allTestCases);
    }
    
    try {
      // Genera embedding per il testo target
      const targetEmbedding = await semanticModel.embed([targetText]);
      const targetVector = await targetEmbedding.array();
      
      const similarities = [];
      
      for (const tc of allTestCases) {
        const phaseText = tc[phase];
        
        if (!phaseText) continue;
        
        // Genera embedding per il testo del test case
        const tcEmbedding = await semanticModel.embed([phaseText]);
        const tcVector = await tcEmbedding.array();
        
        // Calcola similarità coseno
        const similarity = cosineSimilarity(targetVector[0], tcVector[0]);
        
        if (similarity > 0.5) { // Soglia di similarità
          similarities.push({
            testCaseId: tc.id,
            text: phaseText,
            code: tc.blockStates?.[phase]?.code?.trim() || '',
            messages: tc.blockStates?.[phase]?.messages || [],
            similarity
          });
        }
      }
      
      // Ordina per similarità e prendi i top 5
      return similarities
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, 5);
        
    } catch (error) {
      console.error('Errore semantic similarity:', error);
      return findSimilarBlocksSimpleForGlobalComplete(targetText, phase, allTestCases);
    }
  };

  // Fallback: similarità testuale semplice per Global Complete
  const findSimilarBlocksSimpleForGlobalComplete = (targetText, phase, allTestCases) => {
    const targetLower = targetText.toLowerCase();
    const similarities = [];
    
    for (const tc of allTestCases) {
      const phaseText = tc[phase];
      
      if (!phaseText) continue;
      
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
          code: tc.blockStates?.[phase]?.code?.trim() || '',
          messages: tc.blockStates?.[phase]?.messages || [],
          similarity
        });
      }
    }
    
    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  // Funzione Global Complete per un singolo box GWT
  const handleGlobalComplete = async (blockType) => {
    if (!currentSession) {
      onLogEvent?.('error', 'Nessuna sessione disponibile');
      return;
    }

    const currentState = blockStates[blockType];
    
    // Verifica che ci sia una conversazione
    if (!currentState.messages || currentState.messages.length === 0) {
      onLogEvent?.('warning', 'Nessuna conversazione disponibile per Global Complete. Inizia una conversazione prima.');
      return;
    }

    const blockText = testCase[blockType];
    
    try {
      onLogEvent?.('info', `🚀 Avvio Global Complete per ${blockType.toUpperCase()}...`);
      
      // 1. Carica tutti i test cases della sessione
      const allTestCasesWithState = await loadAllTestCasesWithState(currentSession.id);
      
      // 2. Trova box GWT simili (stesso tipo: given/when/then) con enunciati simili
      // Cerca tra TUTTI i test cases, non solo quelli codificati
      const otherTestCases = allTestCasesWithState.filter(tc => tc.id !== testCase.id);
      const similarBlocks = await findSimilarGWTBlocksForGlobalComplete(
        blockText, 
        blockType, 
        otherTestCases
      );
      
      if (similarBlocks.length === 0) {
        onLogEvent?.('info', `Nessun box ${blockType.toUpperCase()} simile trovato negli altri test cases.`);
        return;
      }
      
      onLogEvent?.('info', `Trovati ${similarBlocks.length} box ${blockType.toUpperCase()} simili`);
      
      // 3. Per ogni box simile, applica il codice/correzione basandosi sulla conversazione corrente
      let appliedCount = 0;
      
      for (const similarBlock of similarBlocks) {
        const targetTestCaseId = similarBlock.testCaseId;
        
        // Verifica se il box target ha già codice (potremmo voler aggiornarlo)
        const targetStateKey = `session-${currentSession.id}_test_state_${targetTestCaseId}`;
        const targetSaved = localStorage.getItem(targetStateKey);
        
        onLogEvent?.('info', `Applicando correzione a Test Case #${targetTestCaseId}...`);
        
        // Genera codice basandosi sulla conversazione corrente
        const generatedCode = await generateCodeFromChat(
          blockText,
          blockType,
          currentState.messages,
          currentState.code,
          similarBlock,
          testCase
        );
        
        if (generatedCode && generatedCode.code) {
          // Salva il codice nel box target
          await saveGeneratedCodeFromGlobalComplete(
            targetTestCaseId,
            blockType,
            generatedCode.code,
            generatedCode.explanation,
            currentSession.id,
            testCase.id // ID del test case sorgente
          );
          
          appliedCount++;
          onLogEvent?.('success', `✅ Applicato a Test Case #${targetTestCaseId}`);
        }
      }
      
      if (appliedCount > 0) {
        onLogEvent?.('success', `✅ Global Complete completato! Applicato a ${appliedCount} box ${blockType.toUpperCase()} simili.`);
        
        // Notifica per aggiornare la lista
        window.dispatchEvent(new CustomEvent('global-complete-completed', { 
          detail: { sessionId: currentSession.id, blockType, appliedCount } 
        }));
      } else {
        onLogEvent?.('warning', 'Nessun codice applicato. Verifica i log per dettagli.');
      }
      
    } catch (error) {
      console.error('Errore Global Complete:', error);
      onLogEvent?.('error', `Errore Global Complete: ${error.message}`);
    }
  };

  // Genera codice basandosi sulla conversazione della chat corrente
  const generateCodeFromChat = async (
    sourceBlockText,
    blockType,
    chatMessages,
    currentCode,
    targetSimilarBlock,
    sourceTestCase
  ) => {
    // Costruisci il prompt includendo la conversazione corrente
    let prompt = `Devo applicare una correzione/codice generato in una conversazione AI ad un altro box ${blockType.toUpperCase()} simile.\n\n`;
    
    prompt += `--- BOX SORGENTE ---\n`;
    prompt += `Test Case #${sourceTestCase.id}\n`;
    prompt += `Enunciato: "${sourceBlockText}"\n\n`;
    
    prompt += `Conversazione AI completa:\n`;
    chatMessages.forEach((msg, idx) => {
      prompt += `${msg.role === 'user' ? '👤 Utente' : '🤖 AI'}: ${msg.content}\n\n`;
    });
    
    if (currentCode && currentCode.trim()) {
      prompt += `Codice generato dalla conversazione:\n\`\`\`javascript\n${currentCode}\n\`\`\`\n\n`;
    }
    
    prompt += `--- BOX TARGET (dove applicare) ---\n`;
    prompt += `Test Case #${targetSimilarBlock.testCaseId}\n`;
    prompt += `Enunciato simile: "${targetSimilarBlock.text}"\n`;
    prompt += `Codice attuale: ${targetSimilarBlock.code ? `\n\`\`\`javascript\n${targetSimilarBlock.code}\n\`\`\`` : '(vuoto)'}\n\n`;
    
    prompt += `IMPORTANTE: Adatta il codice della conversazione sorgente all'enunciato target. `;
    prompt += `Mantieni la logica e le soluzioni discusse nella conversazione, ma adattale al contesto specifico dell'enunciato target.\n\n`;
    prompt += `Genera il codice Cypress adattato. Alla fine, aggiungi una sezione "SPIEGAZIONE:" che spiega perché hai adattato così il codice.`;
    
    try {
      const response = await api.chatWithAI(
        prompt,
        {
          type: blockType,
          description: targetSimilarBlock.text,
          target: '',
          value: ''
        },
        context || {},
        [], // Non usare conversazione precedente
        false, // Non wide reasoning, usiamo la conversazione esplicita nel prompt
        []
      );
      
      const { code, explanation } = parseAIResponse(response.response);
      return { code, explanation };
      
    } catch (error) {
      console.error('Errore generazione codice da chat:', error);
      return null;
    }
  };

  // Salva il codice generato da Global Complete
  const saveGeneratedCodeFromGlobalComplete = async (
    testCaseId,
    phase,
    code,
    explanation,
    sessionId,
    sourceTestCaseId
  ) => {
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
    
    // Aggiorna il codice
    blockStates[phase].code = code;
    
    // Aggiungi messaggio nella chat con la spiegazione
    blockStates[phase].messages.push({
      role: 'assistant',
      content: `✨ Codice applicato tramite Global Complete dal Test Case #${sourceTestCaseId}:\n\n${explanation}\n\nIl codice è stato generato basandosi su una conversazione AI in un box ${phase.toUpperCase()} simile.`
    });
    
    // Salva lo stato aggiornato
    const stateToSave = {
      blockStates,
      expandedBlocks: saved ? JSON.parse(saved).expandedBlocks : {},
      lastGlobalComplete: new Date().toISOString(),
      globalCompleteFields: {
        ...(saved ? JSON.parse(saved).globalCompleteFields : {}),
        [phase]: {
          sourceTestCaseId,
          appliedAt: new Date().toISOString()
        }
      }
    };
    
    localStorage.setItem(stateKey, JSON.stringify(stateToSave));
  };

  // ========== END GLOBAL COMPLETE PER SINGOLO BOX GWT ==========

  const handleUploadTest = async () => {
    try {
      onLogEvent?.('info', 'Seleziona il file Cypress da caricare');
      const result = await api.selectFile(
        'Seleziona file Cypress da caricare',
        'Cypress Spec|*.cy.js;*.cy.ts;*.js;*.ts;*.tsx|Tutti i file|*.*'
      );
      
      if (!result?.path) {
        if (result?.canceled) {
          onLogEvent?.('info', 'Caricamento annullato');
        } else {
          onLogEvent?.('error', 'Nessun file selezionato');
        }
        return;
      }

      onLogEvent?.('info', `Parsing file: ${result.path}`);
      
      // Chiama l'API per parsare il file
      const parseResult = await api.parseTestFile(result.path);
      
      if (parseResult.success) {
        // Aggiorna lo stato dei blocchi con il codice estratto
        setBlockStates(prev => ({
          given: {
            ...prev.given,
            code: parseResult.phases.given || prev.given.code
          },
          when: {
            ...prev.when,
            code: parseResult.phases.when || prev.when.code
          },
          then: {
            ...prev.then,
            code: parseResult.phases.then || prev.then.code
          }
        }));
        
        const foundPhases = [];
        if (parseResult.phases.given) foundPhases.push('Given');
        if (parseResult.phases.when) foundPhases.push('When');
        if (parseResult.phases.then) foundPhases.push('Then');
        
        onLogEvent?.('success', `File caricato e parsato con successo!`);
        onLogEvent?.('info', `Fasi trovate: ${foundPhases.length > 0 ? foundPhases.join(', ') : 'nessuna'}`);
      } else {
        onLogEvent?.('error', `Errore parsing: ${parseResult.error}`);
      }
    } catch (error) {
      console.error('Errore upload test:', error);
      onLogEvent?.('error', `Errore caricamento file: ${error.message}`);
    }
  };

  // Se una pagina di visualizzazione è aperta, mostra solo quella
  if (showECObjectsView && currentSession?.id) {
    return (
      <ECObjectsView
        sessionId={currentSession.id}
        onBack={() => setShowECObjectsView(false)}
        onLogEvent={onLogEvent}
      />
    );
  }

  if (showBinomiView && currentSession?.id) {
    return (
      <BinomiView
        sessionId={currentSession.id}
        onBack={() => setShowBinomiView(false)}
        onLogEvent={onLogEvent}
      />
    );
  }

  if (!testCase) {
    return <div className="test-case-builder">Nessun test case selezionato</div>;
  }

  return (
    <div className="test-case-builder">
      <div className="builder-header">
        <div className="builder-header-left">
          <button onClick={onBack} className="builder-header-button back-button">
            ← Torna alla lista
          </button>
          {currentSession?.id && (
            <>
              <button 
                onClick={() => setShowECObjectsView(true)} 
                className="builder-header-button view-button-ec"
              >
                📊 Visualizza Oggetti EC
              </button>
              <button 
                onClick={() => setShowBinomiView(true)} 
                className="builder-header-button view-button-binomi"
              >
                🔗 Visualizza Binomi Fondamentali
              </button>
            </>
          )}
        </div>
        <div className="builder-header-center">
          <h2>Costruzione Test Case #{testCase.id}</h2>
        </div>
        <div className="builder-header-right">
          <button
            className="builder-header-button upload-test-button"
            onClick={handleUploadTest}
            title="Carica un file Cypress e estrai le fasi Given/When/Then"
          >
            📤 Upload Test
          </button>
          {buildCompleteTestCode() && (
            <button
              className="builder-header-button save-button"
              onClick={handleSaveFile}
              title="Salva il test completo nel file Cypress"
            >
              💾 Salva File
            </button>
          )}
          {buildCompleteTestCode() && (
            <button
              className="builder-header-button test-complete-button"
              onClick={handleOpenRunner}
              disabled={!targetFilePath?.trim()}
              title={
                targetFilePath?.trim()
                  ? 'Esegui il test completo e sovrascrivi il file selezionato'
                  : 'Specifica prima un file Cypress di destinazione'
              }
            >
              🧪 Testa Test Completo
            </button>
          )}
        </div>
      </div>

      <div className="test-file-path-section">
        <label>File Cypress di destinazione</label>
        <div className="test-file-input-group">
          <input
            type="text"
            value={targetFilePath}
            onChange={handleTargetFileInput}
            placeholder="C:\path\to\project\cypress\e2e\example.cy.js"
          />
          <button
            type="button"
            onClick={handleBrowseTestFile}
            className="browse-button"
          >
            📂 Sfoglia
          </button>
        </div>
        <p className="test-file-hint">
          Il file verrà sovrascritto ogni volta che esegui "Testa Test Completo".
        </p>
      </div>

      {!context && (
        <div style={{ 
          margin: '15px 0', 
          padding: '12px 15px', 
          backgroundColor: '#fff3cd', 
          border: '1px solid #ffc107', 
          borderRadius: '5px',
          fontSize: '14px'
        }}>
          <strong>💡 Nota:</strong> Stai lavorando senza contesto preliminare. Puoi comunque procedere con la costruzione del test case utilizzando il Wide Reasoning per trovare codice simile in altri test esistenti.
        </div>
      )}

      <GherkinBlock
        type="given"
        label="Given"
        text={testCase.given}
        isExpanded={expandedBlocks.given}
        onToggle={() => toggleBlock('given')}
        state={blockStates.given}
        onPromptChange={(value) => handlePromptChange('given', value)}
        onSendPrompt={(text, wideReasoning) => handleSendPrompt('given', text, wideReasoning)}
        onCodeChange={(value) => handleCodeChange('given', value)}
        onObjectsChange={handleGivenObjectsChange}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('given')}
        testCaseId={testCase.id}
        sessionId={currentSession?.id}
        generateECObjectId={generateECObjectId}
        getNextBoxNumber={getNextBoxNumber}
        generateBinomioId={generateBinomioId}
        onLogEvent={onLogEvent}
        onBinomioSaved={handleBinomioSaved}
        onECObjectSaved={handleECObjectSaved}
        initialObjects={getObjectsForBoxType('given')}
        initialBinomi={loadedBinomi.filter(b => b.testCaseId === String(testCase.id))}
      />

      <GherkinBlock
        type="when"
        label="When"
        text={testCase.when}
        isExpanded={expandedBlocks.when}
        onToggle={() => toggleBlock('when')}
        state={blockStates.when}
        onPromptChange={(value) => handlePromptChange('when', value)}
        onSendPrompt={(text, wideReasoning) => handleSendPrompt('when', text, wideReasoning)}
        onCodeChange={(value) => handleCodeChange('when', value)}
        onObjectsChange={handleWhenObjectsChange}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('when')}
        testCaseId={testCase.id}
        sessionId={currentSession?.id}
        generateECObjectId={generateECObjectId}
        getNextBoxNumber={getNextBoxNumber}
        generateBinomioId={generateBinomioId}
        onLogEvent={onLogEvent}
        onBinomioSaved={handleBinomioSaved}
        onECObjectSaved={handleECObjectSaved}
        initialObjects={getObjectsForBoxType('when')}
        initialBinomi={loadedBinomi.filter(b => b.testCaseId === String(testCase.id))}
      />

      <GherkinBlock
        type="then"
        label="Then"
        text={testCase.then}
        isExpanded={expandedBlocks.then}
        onToggle={() => toggleBlock('then')}
        state={blockStates.then}
        onPromptChange={(value) => handlePromptChange('then', value)}
        onSendPrompt={(text, wideReasoning) => handleSendPrompt('then', text, wideReasoning)}
        onCodeChange={(value) => handleCodeChange('then', value)}
        onObjectsChange={handleThenObjectsChange}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('then')}
        testCaseId={testCase.id}
        sessionId={currentSession?.id}
        generateECObjectId={generateECObjectId}
        getNextBoxNumber={getNextBoxNumber}
        generateBinomioId={generateBinomioId}
        onLogEvent={onLogEvent}
        onBinomioSaved={handleBinomioSaved}
        onECObjectSaved={handleECObjectSaved}
        initialObjects={getObjectsForBoxType('then')}
        initialBinomi={loadedBinomi.filter(b => b.testCaseId === String(testCase.id))}
      />

      {showRunner && (
        <CypressRunner
          code={runnerCode}
          outputFilePath={targetFilePath}
          onClose={() => {
            setShowRunner(false);
            setRunnerCode('');
          }}
          onLogEvent={onLogEvent}
        />
      )}
    </div>
  );
}

/**
 * Blocco Gherkin espandibile (Given/When/Then)
 */
function GherkinBlock({ type, label, text, isExpanded, onToggle, state, onPromptChange, onSendPrompt, onCodeChange, onObjectsChange, context, onOpenRunner, onGlobalComplete, testCaseId, sessionId, generateECObjectId, getNextBoxNumber, generateBinomioId, onLogEvent, onBinomioSaved, onBinomioDeleted, onECObjectSaved, initialObjects = [], initialBinomi = [] }) {
  const [showWideReasoningMenu, setShowWideReasoningMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [objects, setObjects] = useState([]); // Array di oggetti: { text: string, startIndex: number, endIndex: number, location: 'header' | 'content' }
  
  // Usa useRef per tracciare gli ID degli oggetti già inizializzati (evita loop infiniti)
  const initializedIdsRef = useRef(new Set());
  const lastNotifiedIdsRef = useRef(''); // Traccia gli ID per cui abbiamo già notificato il padre
  const lastTestCaseIdRef = useRef(testCaseId);
  const lastTypeRef = useRef(type);
  const connectionsInitializedRef = useRef(false); // Traccia se le connessioni sono state inizializzate
  const lastLoadedBinomiIdsRef = useRef(''); // Traccia gli ID dei binomi già caricati per evitare ricariche inutili
  const lastObjectIdsRef = useRef(''); // Traccia gli ID degli oggetti già caricati
  
  // Reset quando cambia il testCaseId o il type
  useEffect(() => {
    if (lastTestCaseIdRef.current !== testCaseId || lastTypeRef.current !== type) {
      initializedIdsRef.current.clear();
      lastNotifiedIdsRef.current = '';
      setObjects([]);
      setConnections([]);
      connectionsInitializedRef.current = false;
      lastLoadedBinomiIdsRef.current = '';
      lastObjectIdsRef.current = '';
      lastTestCaseIdRef.current = testCaseId;
      lastTypeRef.current = type;
    }
  }, [testCaseId, type]);
  
  // Crea una stringa stabile degli ID per confrontare senza dipendere dall'array
  const initialObjectsIds = useMemo(() => {
    if (!initialObjects || initialObjects.length === 0) return '';
    return initialObjects
      .map(obj => obj.id || obj.ecObjectId)
      .filter(Boolean)
      .sort()
      .join(',');
  }, [initialObjects]);
  
  // Inizializza oggetti e connessioni dagli oggetti caricati dal database
  useEffect(() => {
    // Se non ci sono oggetti iniziali, resetta solo se avevamo oggetti prima
    if (!initialObjects || initialObjects.length === 0) {
      if (initializedIdsRef.current.size > 0) {
        initializedIdsRef.current.clear();
        lastNotifiedIdsRef.current = '';
        setObjects([]);
        setConnections([]);
        connectionsInitializedRef.current = false;
        lastLoadedBinomiIdsRef.current = '';
        lastObjectIdsRef.current = '';
      }
      return;
    }
    
    // Converti oggetti dal database nel formato locale
    const localObjects = initialObjects.map(obj => ({
      text: obj.text,
      startIndex: obj.startIndex,
      endIndex: obj.endIndex,
      location: obj.location,
      id: obj.id,
      ecObjectId: obj.id // Salva l'ID EC per riferimento
    }));
    
    // Crea un set degli ID nuovi
    const newIds = new Set(localObjects.map(obj => obj.ecObjectId || obj.id).filter(Boolean));
    const newIdsString = Array.from(newIds).sort().join(',');
    
    // Controlla se gli ID sono cambiati confrontando la stringa
    const currentIdsString = Array.from(initializedIdsRef.current).sort().join(',');
    
    // Se gli ID sono diversi, aggiorna
    if (newIdsString !== currentIdsString) {
      console.log(`[${type}] ${initializedIdsRef.current.size > 0 ? 'Aggiornati' : 'Inizializzati'} ${localObjects.length} oggetti dal database`);
      
      // Aggiorna il ref con i nuovi ID
      initializedIdsRef.current = newIds;
      
      // Aggiorna lo stato
      setObjects(localObjects);
      
      // Notifica il componente padre SOLO se non abbiamo già notificato per questi ID
      if (newIdsString !== lastNotifiedIdsRef.current) {
        lastNotifiedIdsRef.current = newIdsString;
        // Usa requestAnimationFrame per evitare loop durante il render
        requestAnimationFrame(() => {
          onObjectsChange?.(localObjects);
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialObjectsIds, type]);

  // Inizializza connessioni dai binomi caricati
  useEffect(() => {
    // Reset connessioni se testCaseId o type sono cambiati
    if (lastTestCaseIdRef.current !== testCaseId || lastTypeRef.current !== type) {
      setConnections([]);
      connectionsInitializedRef.current = false;
      lastLoadedBinomiIdsRef.current = '';
      lastObjectIdsRef.current = '';
      return;
    }
    
    // Verifica se ci sono binomi da caricare e se gli oggetti sono pronti
    if (!initialBinomi || initialBinomi.length === 0 || objects.length === 0 || initializedIdsRef.current.size === 0) {
      // Se non ci sono binomi ma gli oggetti sono pronti, resetta le connessioni
      if (objects.length > 0 && initializedIdsRef.current.size > 0 && (!initialBinomi || initialBinomi.length === 0)) {
        if (connections.length > 0) {
          console.log(`[${type}] Nessun binomio disponibile, reset connessioni`);
          setConnections([]);
        }
      }
      return;
    }
    
    // Crea una stringa stabile degli ID dei binomi per verificare se sono cambiati
    const currentBinomiIds = initialBinomi
      .map(b => b.id)
      .filter(Boolean)
      .sort()
      .join(',');
    
    // Crea anche una stringa stabile degli ID degli oggetti per verificare se sono cambiati
    const currentObjectIds = Array.from(initializedIdsRef.current).sort().join(',');
    
    // Se i binomi E gli oggetti sono gli stessi già caricati, non ricaricare
    // Ma solo se abbiamo già caricato qualcosa e non siamo in fase di inizializzazione
    if (connectionsInitializedRef.current && 
        currentBinomiIds === lastLoadedBinomiIdsRef.current &&
        currentObjectIds === lastObjectIdsRef.current &&
        currentBinomiIds.length > 0) {
      console.log(`[${type}] Binomi e oggetti invariati, salto ricaricamento (binomi: ${currentBinomiIds.split(',').length})`);
      return;
    }
    
    // Ricarica se:
    // 1. Non sono ancora state inizializzate le connessioni
    // 2. Gli ID dei binomi sono cambiati
    // 3. Gli ID degli oggetti sono cambiati
    console.log(`[${type}] Preparazione al ricaricamento connessioni:`, {
      initialized: connectionsInitializedRef.current,
      binomiChanged: currentBinomiIds !== lastLoadedBinomiIdsRef.current,
      objectsChanged: currentObjectIds !== lastObjectIdsRef.current,
      currentBinomiCount: currentBinomiIds.split(',').filter(Boolean).length,
      previousBinomiCount: lastLoadedBinomiIdsRef.current.split(',').filter(Boolean).length
    });
    
    // Trova le connessioni che coinvolgono oggetti di questo box
    const objectIds = new Set(objects.map(obj => obj.ecObjectId || obj.id));
    const relevantBinomi = initialBinomi.filter(b => 
      objectIds.has(b.fromObjectId) && objectIds.has(b.toObjectId)
    );
    
    console.log(`[${type}] Caricando connessioni: ${relevantBinomi.length} binomi rilevanti su ${initialBinomi.length} totali per ${objects.length} oggetti`, {
      relevantBinomiIds: relevantBinomi.map(b => b.id),
      allBinomiIds: initialBinomi.map(b => b.id),
      objectIds: Array.from(objectIds)
    });
    
    if (relevantBinomi.length > 0) {
      // Converti binomi in connessioni locali
      const localConnections = relevantBinomi.map(binomio => {
        // Trova gli ID locali degli oggetti
        const fromObj = objects.find(obj => (obj.ecObjectId || obj.id) === binomio.fromObjectId);
        const toObj = objects.find(obj => (obj.ecObjectId || obj.id) === binomio.toObjectId);
        
        if (fromObj && toObj) {
          const headerObjects = objects.filter(o => o.location === 'header');
          const contentObjects = objects.filter(o => o.location === 'content');
          
          const fromLocalId = fromObj.location === 'header'
            ? `header-obj-${headerObjects.indexOf(fromObj)}`
            : `content-obj-${contentObjects.indexOf(fromObj)}`;
          
          const toLocalId = toObj.location === 'header'
            ? `header-obj-${headerObjects.indexOf(toObj)}`
            : `content-obj-${contentObjects.indexOf(toObj)}`;
          
          return {
            id: binomio.id,
            from: fromLocalId,
            to: toLocalId,
            fromPoint: binomio.fromPoint || { x: 0.5, y: 1.0 },
            toPoint: binomio.toPoint || { x: 0.5, y: 1.0 }
          };
        }
        console.warn(`[${type}] Binomio ${binomio.id}: oggetti non trovati`, {
          fromObjectId: binomio.fromObjectId,
          toObjectId: binomio.toObjectId,
          availableIds: Array.from(objectIds),
          allObjects: objects.map(o => ({ id: o.id, ecObjectId: o.ecObjectId }))
        });
        return null;
      }).filter(Boolean);
      
      if (localConnections.length > 0) {
        // IMPORTANTE: Sostituisci sempre tutte le connessioni con quelle caricate dal database
        // per garantire che tutti i binomi siano presenti
        setConnections(localConnections);
        connectionsInitializedRef.current = true;
        lastLoadedBinomiIdsRef.current = currentBinomiIds;
        lastObjectIdsRef.current = currentObjectIds;
        console.log(`[${type}] ✅ Inizializzate ${localConnections.length} connessioni dal database (IDs: ${localConnections.map(c => c.id).join(', ')})`);
      } else if (relevantBinomi.length > 0) {
        console.warn(`[${type}] ⚠️ Nessuna connessione valida generata da ${relevantBinomi.length} binomi rilevanti`);
        // Anche se non riusciamo a generare connessioni, marca come inizializzato per evitare loop
        connectionsInitializedRef.current = true;
        lastLoadedBinomiIdsRef.current = currentBinomiIds;
        lastObjectIdsRef.current = currentObjectIds;
      }
    } else if (initialBinomi.length > 0) {
      console.log(`[${type}] Nessun binomio rilevante per gli oggetti di questo box`, {
        allBinomi: initialBinomi.map(b => ({ id: b.id, from: b.fromObjectId, to: b.toObjectId })),
        objectIds: Array.from(objectIds)
      });
      // Marca come inizializzato anche se non ci sono binomi, per evitare controlli continui
      if (!connectionsInitializedRef.current) {
        connectionsInitializedRef.current = true;
        lastLoadedBinomiIdsRef.current = currentBinomiIds;
        lastObjectIdsRef.current = currentObjectIds;
      }
    }
  }, [initialBinomi, objects, type, testCaseId]);

  const [headerObjectPositions, setHeaderObjectPositions] = useState([]); // Posizioni bordi oggetti nell'header del Layer EC
  const [contentObjectPositions, setContentObjectPositions] = useState([]); // Posizioni bordi oggetti nel contenuto del Layer EC
  const [codeSelection, setCodeSelection] = useState({ start: null, end: null, text: '', editorId: null }); // Selezione codice
  const [objectContextMenu, setObjectContextMenu] = useState(null); // Menu contestuale per oggetti
  const [connections, setConnections] = useState([]); // Array di connessioni: { from: objectId, to: objectId, fromPoint: {x, y}, toPoint: {x, y} }
  const [codeEditors, setCodeEditors] = useState([{ id: 'editor-0', code: state.code || '', type: 'normal' }]);
  const codeEditorRefs = useRef({});
  const lastSyncedCodeRef = useRef(state.code || '');
  const updatingEditorsRef = useRef(false);
  const editorsInitializedRef = useRef(false);
  const editorLocalSelectionRef = useRef({}); // { editorId: { start, end } }
  const [caretMap, setCaretMap] = useState({}); // { editorId: { line, col } }
  const [caretPixelMap, setCaretPixelMap] = useState({}); // { editorId: { top, left } }
  const [activeEditorId, setActiveEditorId] = useState(null); // ID dell'EN con focus attivo (un solo pallino per fase GWT)
  const charWidthCacheRef = useRef({});
  const [connectingFrom, setConnectingFrom] = useState(null); // ID oggetto da cui si sta creando la connessione
  const [connectingFromPoint, setConnectingFromPoint] = useState(null); // Punto relativo (0-1) sul perimetro di partenza
  const [connectingMousePos, setConnectingMousePos] = useState(null); // Posizione mouse durante connessione: { x, y }
  const [connectionHoverTarget, setConnectionHoverTarget] = useState(null); // ID oggetto sotto il mouse durante la connessione
  const [draggingConnectionPoint, setDraggingConnectionPoint] = useState(null); // { connectionId, pointType: 'from' | 'to' }
  const [connectionContextMenu, setConnectionContextMenu] = useState(null); // { connectionId, x, y }
  
  // Smart Text - Editing oggetti To
  const [editingToObject, setEditingToObject] = useState(null); // { objectId, originalText, obj } - oggetto To in fase di editing
  const [showPropagationModal, setShowPropagationModal] = useState(null); // { objectId, newText, originalText, ecObjectId } - modale propagazione
  const editingToObjectRef = useRef(null); // Ref per gestire click-outside
  const [pendingToObjectEdit, setPendingToObjectEdit] = useState(null); // Testo modificato in attesa di conferma

  const prevCodeRef = useRef(state.code);
  const isManualCodeChange = useRef(false);
  const isIsolationEnforcing = useRef(false);
  const deletedObjectRef = useRef(null); // Per ripristinare blocchi cancellati con undo
  const desiredCursorPosition = useRef(null); // Per ripristinare il cursore dopo normalizzazioni asincrone

  // Effetto per gestire le modifiche del codice da parte dell'AI durante l'editing di un oggetto
  useEffect(() => {
    const prevCode = prevCodeRef.current || '';
    const newCode = state.code || '';
    
    // Se il codice è cambiato
    if (prevCode !== newCode) {
      prevCodeRef.current = newCode;
      
      // Se è una modifica manuale, resettiamo il flag e non facciamo nulla (gestita in handleProtectedCodeChange)
      if (isManualCodeChange.current) {
        isManualCodeChange.current = false;
        return;
      }

      // Se stiamo editando un oggetto e il cambio NON è manuale (quindi AI)
      if (editingToObject) {
        const obj = editingToObject.obj;
        
        // Calcola la differenza di lunghezza
        const lengthDiff = newCode.length - prevCode.length;
        
        if (lengthDiff !== 0) {
          console.log('Rilevato cambio codice AI durante editing oggetto. Diff:', lengthDiff);
          
          // Aggiorna l'oggetto in editing
          const newEndIndex = obj.endIndex + lengthDiff;
          
          // Aggiorna stato editing
          setEditingToObject(prev => ({
            ...prev,
            obj: {
              ...prev.obj,
              endIndex: newEndIndex
            }
          }));
          
          // Aggiorna tutti gli oggetti
          setObjects(prevObjects => {
            return prevObjects.map(o => {
              // Oggetto corrente (usa ID o ecObjectId per match sicuro)
              if (o.id === obj.id || (o.ecObjectId && o.ecObjectId === obj.ecObjectId)) {
                return { ...o, endIndex: newEndIndex };
              }
              // Oggetti successivi -> shift
              if (o.location === 'content' && o.startIndex > obj.startIndex) {
                return {
                  ...o,
                  startIndex: o.startIndex + lengthDiff,
                  endIndex: o.endIndex + lengthDiff
                };
              }
              return o;
            });
          });
        }
      }
    }
    
    // GARANZIA DI SPAZIO LIBERO:
    // Se l'ultimo oggetto To finisce esattamente alla fine del file (o molto vicino),
    // aggiungi automaticamente delle righe vuote per permettere all'utente di cliccare "sotto"
    // e continuare a scrivere.
    // MA NON FARLO DURANTE L'EDITING: altrimenti ogni Enter che estende l'oggetto verso il fondo
    // triggera l'aggiunta di righe e sposta il cursore.
    // FIX AGGIUNTIVO: Se 'editingToObject' è appena stato settato a null (uscita da editing),
    // potrebbe volerci un ciclo. Ma qui controlliamo semplicemente se c'è editing ATTIVO.
    // Se premi Enter, 'editingToObject' è ancora attivo.
    // Il problema potrebbe essere che 'state.code' cambia PRIMA che 'editingToObject' sia aggiornato?
    // No, 'editingToObject' è nello stato.
    
    // FIX DEFINITIVO: Disabilita completamente questa logica di aggiunta automatica se c'è QUALSIASI attività recente.
    // Ma soprattutto, se l'utente preme enter alla fine del file DENTRO un blocco, NON DOBBIAMO AGGIUNGERE SPAZIO.
    
    if (state.code && objects.length > 0 && !editingToObject) {
      // Verifica ulteriore: siamo sicuri che non stiamo editando?
      // A volte lo stato potrebbe non essere sincronizzato perfettamente.
      // Ma se !editingToObject è true, allora siamo fuori.
      
      const contentObjects = objects.filter(o => o.location === 'content');
      if (contentObjects.length > 0) {
        // Trova l'oggetto che finisce più in basso
        const lastObject = contentObjects.reduce((prev, current) => 
          (prev.endIndex > current.endIndex) ? prev : current
        );
        
        // Se l'ultimo oggetto finisce alla fine del codice (o quasi, considerando whitespace)
        const codeLength = state.code.length;
        const trailingSpace = state.code.substring(lastObject.endIndex);
        
          // Se c'è meno di 2 "\n" dopo l'ultimo oggetto, aggiungine
        // FIX CRITICO: Disabilitiamo TOTALMENTE questa logica per ora se c'è un oggetto alla fine.
        // Questo perché crea conflitti infiniti con l'editing.
        // Se l'utente vuole spazio, lo aggiungerà manualmente.
        /* 
        if (!trailingSpace.includes('\n\n')) {
           console.log('Aggiunta automatica spaziatura finale per editabilità');
           // ... logic disabled ...
           if (lastObject.endIndex >= codeLength - 1) { // Se siamo proprio alla fine
             setTimeout(() => {
               const padding = '\n\n';
               onCodeChange(state.code + padding);
             }, 0);
           }
        }
        */
      }
    }
  }, [state.code, editingToObject]);

  // Garantisce che ogni oggetto To sia separato da almeno una newline prima e dopo,
  // evitando che altro codice "entri" nel blocco arancione.
  const enforceToObjectIsolation = useCallback((code, objs) => {
    let newCode = code;
    let changed = false;
    const newObjects = objs.map(o => ({ ...o }));

    const contentObjects = newObjects
      .filter(o => o.location === 'content')
      .sort((a, b) => a.startIndex - b.startIndex);

    let shift = 0;
    for (const o of contentObjects) {
      const isEditingThis =
        editingToObject &&
        (o.id === editingToObject.obj.id ||
          (o.ecObjectId && o.ecObjectId === editingToObject.obj.ecObjectId));

      // Se stiamo editando questo oggetto, non tocchiamo padding prima/dopo
      if (isEditingThis) {
        continue;
      }

      let start = o.startIndex + shift;
      let end = o.endIndex + shift;

      // Assicura una newline prima (se non siamo a inizio file)
      if (start > 0 && newCode[start - 1] !== '\n') {
        newCode = newCode.slice(0, start) + '\n' + newCode.slice(start);
        shift += 1;
        start += 1;
        end += 1;
        changed = true;
      }

      // Assicura una newline dopo (se non siamo a fine file)
      if (end < newCode.length && newCode[end] !== '\n') {
        newCode = newCode.slice(0, end) + '\n' + newCode.slice(end);
        shift += 1;
        changed = true;
      }

      // Aggiorna indici oggetto
      o.startIndex = start;
      o.endIndex = end;
    }

    // Aggiorna eventuale editingToObject (se presente)
    let updatedEditing = null;
    if (editingToObject) {
      const found = newObjects.find(
        (o) =>
          o.id === editingToObject.obj.id ||
          o.ecObjectId === editingToObject.obj.ecObjectId
      );
      if (found) {
        updatedEditing = {
          ...editingToObject,
          obj: { ...found },
          objectId: editingToObject.objectId,
          originalText: editingToObject.originalText
        };
      }
    }

    return { code: newCode, objects: newObjects, changed, updatedEditing };
  }, [editingToObject]);

  const dropdownRef = useRef(null);
  const connectionContextMenuRef = useRef(null);
  const gherkinTextRef = useRef(null);
  const contextMenuRef = useRef(null);
  const layerECRef = useRef(null);
  const gherkinLabelRef = useRef(null);
  const gherkinBlockContainerRef = useRef(null);
  const gherkinBlockHeaderRef = useRef(null);
  const gherkinBlockContentRef = useRef(null);
  const layerECHeaderRef = useRef(null);
  const layerECContentRef = useRef(null);
  const codeEditorRef = useRef(null);
  const codeDisplayRef = useRef(null);
  const lineNumbersRef = useRef(null);

  // Costruisce la lista di "editor neri" a partire dal codice e dagli oggetti di contenuto
  const buildCodeEditorsFromCode = useCallback((code, objList = []) => {
    const safeCode = code || '';
    const contentObjects = (objList || [])
      .filter(o => o.location === 'content')
      .sort((a, b) => a.startIndex - b.startIndex);

    if (!contentObjects.length) {
      return [{ id: 'editor-0', code: safeCode, type: 'normal' }];
    }

    const segments = [];
    let cursor = 0;

    contentObjects.forEach((obj, idx) => {
      if (obj.startIndex > cursor) {
        segments.push({
          id: `seg-${segments.length}`,
          code: safeCode.substring(cursor, obj.startIndex),
          type: 'normal'
        });
      }

      segments.push({
        id: `obj-${obj.ecObjectId || obj.id || idx}`,
        code: safeCode.substring(obj.startIndex, obj.endIndex),
        type: 'object',
        objectId: obj.ecObjectId || obj.id
      });

      cursor = obj.endIndex;
    });

    if (cursor < safeCode.length) {
      segments.push({
        id: `seg-${segments.length}`,
        code: safeCode.substring(cursor),
        type: 'normal'
      });
    }

    // Mantieni almeno un editor per permettere l'editing anche se vuoto
    return segments.length ? segments : [{ id: 'editor-0', code: safeCode, type: 'normal' }];
  }, []);

  // Inizializza gli editor una sola volta in base al codice corrente e agli oggetti
  useEffect(() => {
    if (editorsInitializedRef.current) return;
    const currentCode = state.code || '';
    const built = buildCodeEditorsFromCode(currentCode, objects);
    setCodeEditors(built);
    lastSyncedCodeRef.current = currentCode;
    editorsInitializedRef.current = true;
  }, [state.code, objects, buildCodeEditorsFromCode]);

  // Pulisce i ref degli editor non più presenti
  useEffect(() => {
    const ids = new Set(codeEditors.map(ed => ed.id));
    Object.keys(codeEditorRefs.current).forEach(id => {
      if (!ids.has(id)) {
        delete codeEditorRefs.current[id];
      }
    });
  }, [codeEditors]);

  // Calcola l'offset iniziale (startIndex globale) di un editor specifico
  const getEditorPrefix = useCallback((editorId) => {
    let total = 0;
    for (const seg of codeEditors) {
      if (seg.id === editorId) break;
      total += seg.code.length;
    }
    return total;
  }, [codeEditors]);

  // Posiziona il cursore in base agli indici globali del codice complessivo
  const focusRangeInEditors = useCallback((start, end) => {
    let offset = 0;
    for (const seg of codeEditors) {
      const segStart = offset;
      const segEnd = offset + seg.code.length;
      if (start >= segStart && start <= segEnd) {
        const container = codeEditorRefs.current[seg.id];
        const textarea = container?.querySelector('textarea');
        if (textarea) {
          const localStart = Math.max(0, start - segStart);
          const localEnd = Math.max(localStart, Math.min(seg.code.length, end - segStart));
          textarea.focus();
          textarea.setSelectionRange(localStart, localEnd);
        }
        break;
      }
      offset = segEnd;
    }
  }, [codeEditors]);

  const joinEditorsCode = useCallback((segments) => {
    return segments.map(seg => seg.code).join('');
  }, []);

  const getLineCol = useCallback((text, pos) => {
    const safePos = Math.max(0, Math.min(pos ?? 0, text.length));
    const untilPos = text.substring(0, safePos);
    const lines = untilPos.split('\n');
    const line = lines.length; // 1-based
    const col = (lines[lines.length - 1] || '').length + 1; // 1-based
    return { line, col };
  }, []);

  const getCharWidth = useCallback((fontSizePx = 13, fontFamily = 'monospace') => {
    const key = `${fontSizePx}-${fontFamily}`;
    if (charWidthCacheRef.current[key]) return charWidthCacheRef.current[key];
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return 8;
    ctx.font = `${fontSizePx}px ${fontFamily}`;
    const metrics = ctx.measureText('m');
    const width = metrics.width || 8;
    charWidthCacheRef.current[key] = width;
    return width;
  }, []);

  // NOTA: onObjectsChange viene chiamato solo durante l'inizializzazione (linea 2461)
  // e durante le azioni utente (transform, delete, etc.), NON qui per evitare loop infiniti

  const connectionHoverTargetRef = useRef(null);
  useEffect(() => {
    connectionHoverTargetRef.current = connectionHoverTarget;
  }, [connectionHoverTarget]);

  // Aggiorna ref per editingToObject
  useEffect(() => {
    editingToObjectRef.current = editingToObject;
  }, [editingToObject]);

  // Click-outside handler per terminare editing oggetti To - RIMOSSO come da richiesta
  // L'editing ora termina solo cliccando nuovamente sulla matita
  /*
  useEffect(() => {
    if (!editingToObject) return;

    const handleClickOutside = (e) => {
      // ... logic removed ...
    };

    // ... listener removed ...
  }, [editingToObject, objects, state.code]);
  */

  // Funzione per terminare l'editing (chiamata dal toggle della matita)
  const finishEditing = useCallback(() => {
    if (!editingToObject) return;

    // Ottieni il testo corrente dell'oggetto
    const contentObjects = objects.filter(o => o.location === 'content');
    const objIndex = parseInt(editingToObject.objectId.replace('content-obj-', ''));
    const obj = contentObjects[objIndex];
    
    if (obj && state.code) {
      const currentText = state.code.substring(obj.startIndex, obj.endIndex);
      
      // Se il testo è cambiato, mostra il modale di propagazione
      if (currentText !== editingToObject.originalText) {
        setShowPropagationModal({
          objectId: editingToObject.objectId,
          newText: currentText,
          originalText: editingToObject.originalText,
          ecObjectId: obj.ecObjectId || obj.id
        });
      }
    }
    
    setEditingToObject(null);
  }, [editingToObject, objects, state.code]);

  // Smart Text: Double-click/Click per toggle modalità editing sull'oggetto To
  // Nota: la funzione finishEditing è definita sopra ed usata qui
  const toggleToObjectEdit = (objectId, e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Solo per oggetti content (To)
    if (!objectId.startsWith('content-obj-')) return;

    // Se stiamo già editando QUESTO oggetto, finiamo l'editing (toggle off)
    if (editingToObject && editingToObject.objectId === objectId) {
      finishEditing();
      return;
    }

    // Se stiamo editando UN ALTRO oggetto, prima chiudiamo quello
    if (editingToObject) {
      finishEditing();
    }
    
    const contentObjects = objects.filter(o => o.location === 'content');
    const objIndex = parseInt(objectId.replace('content-obj-', ''));
    const obj = contentObjects[objIndex];
    
    if (!obj) return;
    
    // Ottieni il testo originale
    const originalText = state.code ? state.code.substring(obj.startIndex, obj.endIndex) : '';
    
    setEditingToObject({
      objectId,
      originalText,
      obj
    });
    
    // Focus sull'editor nella posizione dell'oggetto
    focusRangeInEditors(obj.startIndex, obj.endIndex);
    
    console.log('Editing To object started:', objectId, 'testo originale:', originalText);
  };

  // Gestione connessione drag (Alt + click destro)
  useEffect(() => {
    if (!connectingFrom || !connectingMousePos) return;

    const handleMouseMove = (e) => {
      const layerEC = layerECRef.current;
      if (!layerEC) return;
      
      const layerRect = layerEC.getBoundingClientRect();
      const mouseX = e.clientX - layerRect.left;
      const mouseY = e.clientY - layerRect.top;
      
      setConnectingMousePos({ x: mouseX, y: mouseY });

      const allPositions = [...headerObjectPositions, ...contentObjectPositions];
      let hoveredId = null;
      for (const pos of allPositions) {
        // CORREZIONE: Per gli oggetti contenuto, aggiungi l'offset dell'header alle coordinate Y
        // per il rilevamento dell'hover, poiché mouseY è relativo all'intero layer
        let posTop = pos.top;
        if (pos.id.startsWith('content-obj-') && gherkinBlockHeaderRef.current) {
          posTop += gherkinBlockHeaderRef.current.offsetHeight;
        }

        if (
          mouseX >= pos.left && mouseX <= pos.left + pos.width &&
          mouseY >= posTop && mouseY <= posTop + pos.height &&
          pos.id !== connectingFrom
        ) {
          hoveredId = pos.id;
          break;
        }
      }
      setConnectionHoverTarget(hoveredId);
    };

    const handleMouseUp = (e) => {
      if (e.button !== 2) return;
      const targetId = connectionHoverTargetRef.current;
      if (targetId && targetId !== connectingFrom) {
        handleObjectClickForConnection(targetId, e);
      } else {
        setConnectingFrom(null);
        setConnectingFromPoint(null);
        setConnectingMousePos(null);
        setConnectionHoverTarget(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [connectingFrom, connectingMousePos, headerObjectPositions, contentObjectPositions]);

  // Funzione per calcolare il punto più vicino sul perimetro del rettangolo
  const getPointOnPerimeter = useCallback((mouseX, mouseY, objPos) => {
    // Calcola il punto più vicino sul perimetro del rettangolo
    const rectLeft = objPos.left;
    let rectTop = objPos.top;
    
    // CORREZIONE: Se è un oggetto contenuto, aggiungi l'offset dell'header
    if (objPos.id && objPos.id.startsWith('content-obj-') && gherkinBlockHeaderRef.current) {
      rectTop += gherkinBlockHeaderRef.current.offsetHeight;
    }
    
    const rectRight = rectLeft + objPos.width;
    const rectBottom = rectTop + objPos.height;
    
    // Clamp il punto all'interno del rettangolo
    const clampedX = Math.max(rectLeft, Math.min(rectRight, mouseX));
    const clampedY = Math.max(rectTop, Math.min(rectBottom, mouseY));
    
    // Calcola le distanze dai bordi
    const distToLeft = Math.abs(clampedX - rectLeft);
    const distToRight = Math.abs(clampedX - rectRight);
    const distToTop = Math.abs(clampedY - rectTop);
    const distToBottom = Math.abs(clampedY - rectBottom);
    
    // Trova il bordo più vicino
    const minDist = Math.min(distToLeft, distToRight, distToTop, distToBottom);
    
    let perimeterX, perimeterY;
    
    if (minDist === distToLeft) {
      // Bordo sinistro
      perimeterX = rectLeft;
      perimeterY = clampedY;
    } else if (minDist === distToRight) {
      // Bordo destro
      perimeterX = rectRight;
      perimeterY = clampedY;
    } else if (minDist === distToTop) {
      // Bordo superiore
      perimeterX = clampedX;
      perimeterY = rectTop;
    } else {
      // Bordo inferiore
      perimeterX = clampedX;
      perimeterY = rectBottom;
    }
    
    // Converti in coordinate relative (0-1)
    const relX = (perimeterX - rectLeft) / objPos.width;
    const relY = (perimeterY - rectTop) / objPos.height;
    
    return { x: relX, y: relY };
  }, []);

  // Gestione drag dei punti di connessione
  useEffect(() => {
    if (!draggingConnectionPoint) return;

    const handleMouseMove = (e) => {
      const layerEC = layerECRef.current;
      if (!layerEC) return;
      
      const layerRect = layerEC.getBoundingClientRect();
      const mouseX = e.clientX - layerRect.left;
      const mouseY = e.clientY - layerRect.top;

      setConnections(prev => prev.map(conn => {
        if (conn.id !== draggingConnectionPoint.connectionId) return conn;
        
        const objId = draggingConnectionPoint.pointType === 'from' ? conn.from : conn.to;
        const allPositions = [...headerObjectPositions, ...contentObjectPositions];
        const objPos = allPositions.find(p => p.id === objId);
        
        if (!objPos) return conn;

        // Calcola punto sul perimetro del rettangolo
        const perimeterPoint = getPointOnPerimeter(mouseX, mouseY, objPos);

        if (draggingConnectionPoint.pointType === 'from') {
          return { ...conn, fromPoint: perimeterPoint };
        } else {
          return { ...conn, toPoint: perimeterPoint };
        }
      }));
    };

    const handleMouseUp = () => {
      setDraggingConnectionPoint(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingConnectionPoint, headerObjectPositions, contentObjectPositions, getPointOnPerimeter]);

  // Chiudi il menu quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowWideReasoningMenu(false);
      }
      const clickedInsideText = gherkinTextRef.current?.contains(event.target);
      const clickedInsideCode = codeEditorRef.current?.contains(event.target);
      const clickedInsideContextMenu = contextMenuRef.current?.contains(event.target);
      const clickedInsideObjectMenu = document.querySelector('.object-context-menu')?.contains(event.target);
      const clickedInsideConnectionMenu = connectionContextMenuRef.current?.contains(event.target);
      const isInsideTarget = contextMenu?.target === 'code' ? clickedInsideCode : clickedInsideText;
      
      if (contextMenu && !isInsideTarget && !clickedInsideContextMenu) {
        setContextMenu(null);
      }
      
      if (objectContextMenu && !clickedInsideObjectMenu) {
        setObjectContextMenu(null);
      }
      
      if (connectionContextMenu && !clickedInsideConnectionMenu) {
        setConnectionContextMenu(null);
      }

      // Gestione drag dei punti di connessione
      if (draggingConnectionPoint) {
        if (event.type === 'mousemove') {
          const layerEC = layerECRef.current;
          if (!layerEC) return;
          
          const layerRect = layerEC.getBoundingClientRect();
          const mouseX = event.clientX - layerRect.left;
          const mouseY = event.clientY - layerRect.top;

          setConnections(prev => prev.map(conn => {
            if (conn.id !== draggingConnectionPoint.connectionId) return conn;
            
            const objId = draggingConnectionPoint.pointType === 'from' ? conn.from : conn.to;
            const allPositions = [...headerObjectPositions, ...contentObjectPositions];
            const objPos = allPositions.find(p => p.id === objId);
            
            if (!objPos) return conn;

            // Calcola punto relativo (0-1) rispetto all'oggetto
            const relX = Math.max(0, Math.min(1, (mouseX - objPos.left) / objPos.width));
            const relY = Math.max(0, Math.min(1, (mouseY - objPos.top) / objPos.height));

            if (draggingConnectionPoint.pointType === 'from') {
              return { ...conn, fromPoint: { x: relX, y: relY } };
            } else {
              return { ...conn, toPoint: { x: relX, y: relY } };
            }
          }));
        } else if (event.type === 'mouseup') {
          setDraggingConnectionPoint(null);
        }
      }
    };

    if (showWideReasoningMenu || contextMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showWideReasoningMenu, contextMenu]);

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      onSendPrompt(state.prompt, false);
    }
  };

  const handleSendNormal = () => {
    setShowWideReasoningMenu(false);
    
    let textToSend = state.prompt;
    
    // Se siamo in modalità editing oggetto, aggiungi contesto specifico
    if (editingToObject && state.code) {
      // Recupera il testo corrente dell'oggetto (potrebbe essere stato modificato manualmente)
      const contentObjects = objects.filter(o => o.location === 'content');
      const objIndex = parseInt(editingToObject.objectId.replace('content-obj-', ''));
      const obj = contentObjects[objIndex];
      
      if (obj) {
        const objText = state.code.substring(obj.startIndex, obj.endIndex);
        textToSend = `[FOCUS: EDITING OGGETTO]
Sto modificando specificamente questo oggetto nel codice (indicato nel visualizzatore dal box arancione):
\`\`\`
${objText}
\`\`\`

La mia richiesta di modifica per questo oggetto è:
${state.prompt}

Per favore, fornisci il codice aggiornato applicando queste modifiche all'oggetto specificato.`;
      }
    }
    
    onSendPrompt(textToSend, false);
  };

  const handleSendWideReasoning = () => {
    setShowWideReasoningMenu(false);
    onSendPrompt(state.prompt, true);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim()) {
      setSelectedText(selection.toString().trim());
    } else {
      setSelectedText('');
    }
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    const selection = window.getSelection();
    const selected = selection && selection.toString().trim();
    
    if (selected) {
      setSelectedText(selected);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: 'gherkin'
      });
    } else {
      setContextMenu(null);
    }
  };

  const handleCodeSelection = (editorId) => {
    // Aggiorna la posizione in modo asincrono per non interferire con la scrittura
    setTimeout(() => {
      const container = codeEditorRefs.current[editorId];
      const textarea = container?.querySelector('textarea');
      if (!textarea) {
        setCodeSelection({ start: null, end: null, text: '', editorId: null });
        return;
      }

      const { selectionStart, selectionEnd } = textarea;
      const value = textarea.value || '';

      if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionEnd > selectionStart) {
        const prefix = getEditorPrefix(editorId);
        setCodeSelection({
          start: prefix + selectionStart,
          end: prefix + selectionEnd,
          text: value.substring(selectionStart, selectionEnd),
          editorId
        });
        editorLocalSelectionRef.current[editorId] = { start: selectionStart, end: selectionEnd };
        setCaretMap(prev => ({
          ...prev,
          [editorId]: getLineCol(value, selectionStart)
        }));
      } else {
        setCodeSelection({ start: null, end: null, text: '', editorId: null });
        editorLocalSelectionRef.current[editorId] = { start: textarea.selectionStart, end: textarea.selectionEnd };
        setCaretMap(prev => ({
          ...prev,
          [editorId]: getLineCol(value, textarea.selectionStart)
        }));
      }
    }, 0);
  };

  const handleCodeContextMenu = (e, editorId) => {
    const container = codeEditorRefs.current[editorId];
    if (!container?.contains(e.target)) {
      return;
    }

    const textarea = container.querySelector('textarea');
    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd, value } = textarea;
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionEnd > selectionStart) {
      const prefix = getEditorPrefix(editorId);
      setCodeSelection({
        start: prefix + selectionStart,
        end: prefix + selectionEnd,
        text: value.substring(selectionStart, selectionEnd),
        editorId
      });
      editorLocalSelectionRef.current[editorId] = { start: selectionStart, end: selectionEnd };
      setCaretMap(prev => ({
        ...prev,
        [editorId]: getLineCol(value, selectionStart)
      }));
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: 'code'
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleEditorFocus = (editorId) => {
    // Quando un EN riceve il focus, diventa l'EN attivo (un solo pallino per fase GWT)
    setActiveEditorId(editorId);
    
    // Aggiorna la posizione del cursore in modo asincrono per non interferire con la scrittura
    setTimeout(() => {
      const container = codeEditorRefs.current[editorId];
      const textarea = container?.querySelector('textarea');
      if (!textarea || document.activeElement !== textarea) return;
      const value = textarea.value || '';
      const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
      const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
      editorLocalSelectionRef.current[editorId] = { start, end };
      setCaretMap(prev => ({
        ...prev,
        [editorId]: getLineCol(value, start)
      }));
    }, 0);
  };
      // Log granulari per ogni tasto
      const keydownHandler = (e) => {
        console.debug('[EN DEBUG] keydown', {
          editorId: editor.id,
          key: e.key,
          code: e.code,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          valueLength: (textarea.value || '').length,
          activeEditorId,
          caret: caretMap[editor.id]
        });
      };
      const keyupHandler = (e) => {
        console.debug('[EN DEBUG] keyup', {
          editorId: editor.id,
          key: e.key,
          code: e.code,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          valueLength: (textarea.value || '').length,
          activeEditorId,
          caret: caretMap[editor.id]
        });
      };

  const handleEditorBlur = (editorId, e) => {
    const container = codeEditorRefs.current[editorId];
    const textarea = container?.querySelector('textarea');
    if (!textarea) return;
    const value = textarea.value || '';
    const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
    const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
    editorLocalSelectionRef.current[editorId] = { start, end };
    setCaretMap(prev => ({
      ...prev,
      [editorId]: getLineCol(value, start)
    }));
    
    // Controlla se un altro EN della stessa fase ha ricevuto il focus
    // Usa un timeout per permettere al nuovo focus di essere registrato
    setTimeout(() => {
      const anyEditorFocused = codeEditors.some(editor => {
        const editorContainer = codeEditorRefs.current[editor.id];
        const editorTextarea = editorContainer?.querySelector('textarea');
        return editorTextarea && document.activeElement === editorTextarea;
      });
      
      // Se nessun EN ha il focus, mantieni il pallino sull'ultimo EN attivo
      // Se un altro EN ha il focus, activeEditorId sarà già stato aggiornato da handleEditorFocus
      if (!anyEditorFocused && activeEditorId === editorId) {
        // Nessun altro EN ha il focus, mantieni il pallino su questo EN
        // activeEditorId rimane invariato
      }
    }, 0);
  };

  // Disabilitato: i listener diretti sui textarea vengono rimossi per evitare interferenze con la digitazione
  // useEffect(() => {
  //   const focusHandlers = {};
  //   const blurHandlers = {};
  //   const inputHandlers = {};
  //
  //   codeEditors.forEach((editor) => {
  //     const container = codeEditorRefs.current[editor.id];
  //     if (!container) return;
  //     const textarea = container.querySelector('textarea');
  //     if (!textarea) return;
  //
  //     const focusHandler = () => handleEditorFocus(editor.id);
  //     const blurHandler = (e) => handleEditorBlur(editor.id, e);
  //     const inputHandler = () => {
  //       if (document.activeElement === textarea) {
  //         setTimeout(() => {
  //           const value = textarea.value || '';
  //           const start = typeof textarea.selectionStart === 'number' ? textarea.selectionStart : value.length;
  //           const end = typeof textarea.selectionEnd === 'number' ? textarea.selectionEnd : start;
  //           editorLocalSelectionRef.current[editor.id] = { start, end };
  //           setCaretMap(prev => ({
  //             ...prev,
  //             [editor.id]: getLineCol(value, start)
  //           }));
  //         }, 0);
  //       }
  //     };
  //
  //     focusHandlers[editor.id] = focusHandler;
  //     blurHandlers[editor.id] = blurHandler;
  //     inputHandlers[editor.id] = inputHandler;
  //
  //     textarea.addEventListener('focus', focusHandler);
  //     textarea.addEventListener('blur', blurHandler);
  //     textarea.addEventListener('input', inputHandler);
  //   });
  //
  //   return () => {
  //     codeEditors.forEach((editor) => {
  //       const container = codeEditorRefs.current[editor.id];
  //       if (!container) return;
  //       const textarea = container.querySelector('textarea');
  //       if (!textarea) return;
  //
  //       if (focusHandlers[editor.id]) {
  //         textarea.removeEventListener('focus', focusHandlers[editor.id]);
  //       }
  //       if (blurHandlers[editor.id]) {
  //         textarea.removeEventListener('blur', blurHandlers[editor.id]);
  //       }
  //       if (inputHandlers[editor.id]) {
  //         textarea.removeEventListener('input', inputHandlers[editor.id]);
  //       }
  //     });
  //   };
  // }, [codeEditors]);

  // Calcola la posizione pixel del caret per mostrare il pallino fuori fuoco
  useLayoutEffect(() => {
    const nextPixels = {};
    codeEditors.forEach((seg) => {
      const pos = caretMap[seg.id];
      if (!pos) return;
      const container = codeEditorRefs.current[seg.id];
      if (!container) return;
      const textarea = container.querySelector('textarea');
      if (!textarea) return;

      const localSel = editorLocalSelectionRef.current[seg.id];
      if (!localSel) return;
      const caretPos = localSel.start;

      const styles = window.getComputedStyle(textarea);
      const paddingTop = parseFloat(styles.paddingTop) || 8;
      const paddingLeft = parseFloat(styles.paddingLeft) || 12;
      const lineHeightPx = parseFloat(styles.lineHeight) || 18;
      const fontSizePx = parseFloat(styles.fontSize) || 13;
      const fontFamily = styles.fontFamily || 'monospace';

      const value = textarea.value || '';
      
      // Usa direttamente pos.line da caretMap (già calcolato correttamente)
      const lineNumber = pos.line; // 1-based
      
      // Calcola la posizione esatta usando il testo fino al cursore per la colonna
      const textBeforeCaret = value.substring(0, caretPos);
      const lines = textBeforeCaret.split('\n');
      const currentLine = lines[lines.length - 1] || '';
      
      // Crea un elemento temporaneo per misurare la larghezza esatta del testo sulla riga corrente
      const measureEl = document.createElement('span');
      measureEl.style.position = 'absolute';
      measureEl.style.visibility = 'hidden';
      measureEl.style.whiteSpace = 'pre';
      measureEl.style.fontFamily = fontFamily;
      measureEl.style.fontSize = `${fontSizePx}px`;
      measureEl.style.padding = '0';
      measureEl.style.margin = '0';
      measureEl.style.border = 'none';
      measureEl.textContent = currentLine;
      document.body.appendChild(measureEl);
      
      const textWidth = measureEl.offsetWidth;
      document.body.removeChild(measureEl);

      // Ottieni la posizione del textarea rispetto al wrapper
      const textareaRect = textarea.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const textareaOffsetTop = textareaRect.top - containerRect.top;
      const textareaOffsetLeft = textareaRect.left - containerRect.left;
      
      // Calcola top: posizione della riga corrente (lineNumber è 1-based, quindi -1 per l'indice)
      // Il baricentro del cursore è al centro verticale della linea (metà lineHeight)
      // Aggiungi l'offset del textarea rispetto al wrapper
      const lineTop = textareaOffsetTop + paddingTop + (lineNumber - 1) * lineHeightPx - (textarea.scrollTop || 0);
      const top = lineTop + (lineHeightPx / 2); // Baricentro verticale del cursore
      
      // Calcola left: padding + larghezza del testo sulla riga corrente meno lo scroll
      // Aggiungi l'offset del textarea rispetto al wrapper
      const left = textareaOffsetLeft + paddingLeft + textWidth - (textarea.scrollLeft || 0);

      nextPixels[seg.id] = { top, left };
    });
    setCaretPixelMap(nextPixels);

    // Aggiungi listener per aggiornare la posizione quando il cursore si muove o lo scroll cambia
    const updatePositions = () => {
      const updatedPixels = {};
      codeEditors.forEach((seg) => {
        const pos = caretMap[seg.id];
        if (!pos) return;
        const container = codeEditorRefs.current[seg.id];
        if (!container) return;
        const textarea = container.querySelector('textarea');
        if (!textarea) return;

        const localSel = editorLocalSelectionRef.current[seg.id];
        if (!localSel) return;
        const caretPos = localSel.start;

        const styles = window.getComputedStyle(textarea);
        const paddingTop = parseFloat(styles.paddingTop) || 8;
        const paddingLeft = parseFloat(styles.paddingLeft) || 12;
        const lineHeightPx = parseFloat(styles.lineHeight) || 18;
        const fontSizePx = parseFloat(styles.fontSize) || 13;
        const fontFamily = styles.fontFamily || 'monospace';

        const value = textarea.value || '';
        
        // Usa direttamente pos.line da caretMap (già calcolato correttamente)
        const lineNumber = pos.line; // 1-based
        
        // Calcola la posizione esatta usando il testo fino al cursore per la colonna
        const textBeforeCaret = value.substring(0, caretPos);
        const lines = textBeforeCaret.split('\n');
        const currentLine = lines[lines.length - 1] || '';

        const measureEl = document.createElement('span');
        measureEl.style.position = 'absolute';
        measureEl.style.visibility = 'hidden';
        measureEl.style.whiteSpace = 'pre';
        measureEl.style.fontFamily = fontFamily;
        measureEl.style.fontSize = `${fontSizePx}px`;
        measureEl.style.padding = '0';
        measureEl.style.margin = '0';
        measureEl.style.border = 'none';
        measureEl.textContent = currentLine;
        document.body.appendChild(measureEl);
        const textWidth = measureEl.offsetWidth;
        document.body.removeChild(measureEl);

        // Ottieni la posizione del textarea rispetto al wrapper
        const textareaRect = textarea.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const textareaOffsetTop = textareaRect.top - containerRect.top;
        const textareaOffsetLeft = textareaRect.left - containerRect.left;

        // Calcola top: posizione della riga corrente (lineNumber è 1-based, quindi -1 per l'indice)
        // Il baricentro del cursore è al centro verticale della linea (metà lineHeight)
        // Aggiungi l'offset del textarea rispetto al wrapper
        const lineTop = textareaOffsetTop + paddingTop + (lineNumber - 1) * lineHeightPx - (textarea.scrollTop || 0);
        const top = lineTop + (lineHeightPx / 2); // Baricentro verticale del cursore
        const left = textareaOffsetLeft + paddingLeft + textWidth - (textarea.scrollLeft || 0);
        updatedPixels[seg.id] = { top, left };
      });
      setCaretPixelMap(updatedPixels);
    };

    // Listener per scroll e movimento cursore
    const textareas = codeEditors.map(seg => {
      const container = codeEditorRefs.current[seg.id];
      return container?.querySelector('textarea');
    }).filter(Boolean);

    textareas.forEach(textarea => {
      textarea.addEventListener('scroll', updatePositions);
      textarea.addEventListener('input', updatePositions);
      textarea.addEventListener('keyup', updatePositions);
      textarea.addEventListener('mouseup', updatePositions);
    });

    return () => {
      textareas.forEach(textarea => {
        textarea.removeEventListener('scroll', updatePositions);
        textarea.removeEventListener('input', updatePositions);
        textarea.removeEventListener('keyup', updatePositions);
        textarea.removeEventListener('mouseup', updatePositions);
      });
    };
  }, [caretMap, codeEditors]);

  const handleSegmentChange = (editorId, newValue) => {
    console.debug('[EN DEBUG] onValueChange', { editorId, newValueLength: newValue?.length });
    setCodeEditors(prevSegments => {
      const idx = prevSegments.findIndex(seg => seg.id === editorId);
      if (idx === -1) return prevSegments;

      const editedSegment = prevSegments[idx];
      const oldCode = editedSegment.code;
      if (oldCode === newValue) return prevSegments;

      const updatedSegments = prevSegments.map((seg, i) =>
        i === idx ? { ...seg, code: newValue } : seg
      );
      const joinedCode = joinEditorsCode(updatedSegments);

      updatingEditorsRef.current = true;
      isManualCodeChange.current = true;
      onCodeChange?.(joinedCode);
      lastSyncedCodeRef.current = joinedCode;

      setObjects(prevObjects => {
        const updatedObjects = prevObjects.map(obj => {
          if (obj.location !== 'content') return obj;

          const isEditedObj =
            editedSegment.type === 'object' &&
            (obj.ecObjectId === editedSegment.objectId || obj.id === editedSegment.objectId);

          if (isEditedObj) {
            return {
              ...obj,
              text: newValue,
              endIndex: obj.startIndex + newValue.length
            };
          }
          return obj;
        });
        return updatedObjects;
      });

      setTimeout(() => {
        updatingEditorsRef.current = false;
      }, 0);

      return updatedSegments;
    });
  };

  // Gestisce frecce e Backspace/Delete saltando o cancellando i blocchi arancioni
  const handleCodeKeyDown = (e) => {
    // Se siamo in editing del blocco arancione, non interferire
    if (editingToObject) return;

    // Undo blocchi cancellati
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      if (deletedObjectRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const { obj: deletedObj, originalCode } = deletedObjectRef.current;

        // Ripristina codice e oggetto
        isManualCodeChange.current = true;
        onCodeChange?.(originalCode);

        setObjects(prev => {
          const withoutDup = prev.filter(o =>
            o.id !== deletedObj.id &&
            (o.ecObjectId !== deletedObj.ecObjectId || !deletedObj.ecObjectId)
          );
          return [...withoutDup, { ...deletedObj }];
        });

        // Posiziona cursore alla riga sotto il blocco ripristinato
        setTimeout(() => {
          const ta = codeEditorRef.current?.querySelector('textarea');
          if (ta && originalCode) {
            const nextNl = originalCode.indexOf('\n', deletedObj.endIndex);
            const target = nextNl !== -1 ? nextNl + 1 : originalCode.length;
            ta.setSelectionRange(target, target);
            ta.focus();
          }
        }, 10);

        // Pulisci il ref
        setTimeout(() => {
          deletedObjectRef.current = null;
        }, 100);
      }
      return;
    }

    const allowed = ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Backspace', 'Delete'];
    if (!allowed.includes(e.key)) return;

    const textarea = codeEditorRef.current?.querySelector('textarea');
    if (!textarea || !state.code) return;

    const { selectionStart } = textarea;
    const contentObjects = objects.filter(o => o.location === 'content');

    for (const obj of contentObjects) {
      // ArrowDown: se sta per entrare o è dentro, salta sotto
      if (e.key === 'ArrowDown') {
        if (selectionStart < obj.startIndex && selectionStart + 1 >= obj.startIndex) {
          e.preventDefault();
          const nextNl = state.code.indexOf('\n', obj.endIndex);
          const target = nextNl === -1 ? state.code.length : nextNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
        if (selectionStart >= obj.startIndex && selectionStart < obj.endIndex) {
          e.preventDefault();
          const nextNl = state.code.indexOf('\n', obj.endIndex);
          const target = nextNl === -1 ? state.code.length : nextNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
      }

      // ArrowUp: se sta per entrare o è dentro, salta sopra
      if (e.key === 'ArrowUp') {
        if (selectionStart > obj.endIndex && selectionStart - 1 <= obj.endIndex) {
          e.preventDefault();
          const prevNl = state.code.lastIndexOf('\n', obj.startIndex - 1);
          const prevPrevNl = prevNl === -1 ? -1 : state.code.lastIndexOf('\n', prevNl - 1);
          const target = prevPrevNl === -1 ? 0 : prevPrevNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
        if (selectionStart >= obj.startIndex && selectionStart <= obj.endIndex) {
          e.preventDefault();
          const prevNl = state.code.lastIndexOf('\n', obj.startIndex - 1);
          const prevPrevNl = prevNl === -1 ? -1 : state.code.lastIndexOf('\n', prevNl - 1);
          const target = prevPrevNl === -1 ? 0 : prevPrevNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
      }

      // ArrowRight: se sta per entrare o è dentro, salta sotto il blocco
      if (e.key === 'ArrowRight') {
        if (
          (selectionStart >= obj.startIndex - 1 && selectionStart < obj.endIndex) ||
          (selectionStart >= obj.startIndex && selectionStart < obj.endIndex)
        ) {
          e.preventDefault();
          const nextNl = state.code.indexOf('\n', obj.endIndex);
          const target = nextNl === -1 ? state.code.length : nextNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
      }

      // ArrowLeft: se sta per entrare o è dentro, salta sopra il blocco
      if (e.key === 'ArrowLeft') {
        if (selectionStart > obj.endIndex && selectionStart - 1 <= obj.endIndex) {
          e.preventDefault();
          const prevNl = state.code.lastIndexOf('\n', obj.startIndex - 1);
          const prevPrevNl = prevNl === -1 ? -1 : state.code.lastIndexOf('\n', prevNl - 1);
          const target = prevPrevNl === -1 ? 0 : prevPrevNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
        if (selectionStart > obj.startIndex && selectionStart <= obj.endIndex) {
          e.preventDefault();
          const prevNl = state.code.lastIndexOf('\n', obj.startIndex - 1);
          const prevPrevNl = prevNl === -1 ? -1 : state.code.lastIndexOf('\n', prevNl - 1);
          const target = prevPrevNl === -1 ? 0 : prevPrevNl + 1;
          textarea.setSelectionRange(target, target);
          return;
        }
      }

      // Backspace: se subito dopo o dentro, cancella tutto il blocco
      if (e.key === 'Backspace') {
        if (selectionStart === obj.endIndex || selectionStart === obj.endIndex + 1 || (selectionStart > obj.startIndex && selectionStart <= obj.endIndex)) {
          e.preventDefault();
          const before = state.code.substring(0, obj.startIndex);
          const after = state.code.substring(obj.endIndex);
          const newCode = before + after;
          const newCursorPos = obj.startIndex;

          deletedObjectRef.current = { obj: { ...obj }, originalCode: state.code };

          isManualCodeChange.current = true;
          onCodeChange?.(newCode);

          setObjects(prevObjects => {
            const updated = prevObjects.filter(o => o !== obj);
            const lengthDiff = obj.startIndex - obj.endIndex; // negativo
            const shifted = updated.map(o => {
              if (o.location === 'content' && o.startIndex > obj.startIndex) {
                return { ...o, startIndex: o.startIndex + lengthDiff, endIndex: o.endIndex + lengthDiff };
              }
              return o;
            });
            return shifted;
          });

          setTimeout(() => {
            const ta = codeEditorRef.current?.querySelector('textarea');
            if (ta) ta.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
          return;
        }
      }

      // Delete: se subito prima o dentro, cancella tutto il blocco
      if (e.key === 'Delete') {
        if (selectionStart === obj.startIndex || selectionStart === obj.startIndex - 1 || (selectionStart >= obj.startIndex && selectionStart < obj.endIndex)) {
          e.preventDefault();
          const before = state.code.substring(0, obj.startIndex);
          const after = state.code.substring(obj.endIndex);
          const newCode = before + after;
          const newCursorPos = obj.startIndex;

          deletedObjectRef.current = { obj: { ...obj }, originalCode: state.code };

          isManualCodeChange.current = true;
          onCodeChange?.(newCode);

          setObjects(prevObjects => {
            const updated = prevObjects.filter(o => o !== obj);
            const lengthDiff = obj.startIndex - obj.endIndex; // negativo
            const shifted = updated.map(o => {
              if (o.location === 'content' && o.startIndex > obj.startIndex) {
                return { ...o, startIndex: o.startIndex + lengthDiff, endIndex: o.endIndex + lengthDiff };
              }
              return o;
            });
            return shifted;
          });

          setTimeout(() => {
            const ta = codeEditorRef.current?.querySelector('textarea');
            if (ta) ta.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);
          return;
        }
      }
    }
  };

  const handleTransformToObject = () => {
    if (contextMenu?.target === 'code') {
      handleTransformCodeToObject();
    } else {
      handleTransformGherkinToObject();
    }
  };

  const handleTransformGherkinToObject = async () => {
    console.log('handleTransformGherkinToObject chiamato', { selectedText, text });
    
    if (!selectedText) {
      console.warn('Nessun testo selezionato');
      return;
    }
    
    const selectedTextTrimmed = selectedText.trim();
    const fullText = text;
    
    // Cerca il testo selezionato nel testo originale
    const startIndex = fullText.indexOf(selectedTextTrimmed);
    
    if (startIndex === -1) {
      console.warn('Testo selezionato non trovato nel testo originale:', selectedTextTrimmed);
      alert(`Impossibile trovare "${selectedTextTrimmed}" nel testo originale.`);
      setContextMenu(null);
      setSelectedText('');
      return;
    }
    
    const endIndex = startIndex + selectedTextTrimmed.length;
    
    // Verifica che l'oggetto non sia già stato creato per questa posizione
    const isDuplicate = objects.some(obj => {
      if (obj.location !== 'header') return false;
      return (startIndex >= obj.startIndex && startIndex < obj.endIndex) ||
             (endIndex > obj.startIndex && endIndex <= obj.endIndex) ||
             (startIndex <= obj.startIndex && endIndex >= obj.endIndex);
    });
    
    if (isDuplicate) {
      console.log('Oggetto duplicato, ignorato');
      alert('Questa parte del testo è già stata trasformata in oggetto.');
      setContextMenu(null);
      setSelectedText('');
      return;
    }
    
    // Genera ID e numero progressivo
    if (!sessionId || !testCaseId || !generateECObjectId || !getNextBoxNumber) {
      console.error('Parametri mancanti per salvare oggetto EC');
      alert('Impossibile salvare oggetto EC: parametri mancanti');
      return;
    }
    
    const boxNumber = await getNextBoxNumber(type);
    const objectId = generateECObjectId(type, boxNumber);
    
    if (!objectId) {
      console.error('Impossibile generare ID oggetto EC');
      alert('Impossibile generare ID oggetto EC');
      return;
    }
    
    const newObject = {
      text: selectedTextTrimmed,
      startIndex: startIndex,
      endIndex: endIndex,
      location: 'header'
    };
    
    // Salva nel database
    try {
      const ecObject = {
        id: objectId,
        sessionId: sessionId,
        testCaseId: String(testCaseId),
        boxType: type,
        boxNumber: boxNumber,
        text: selectedTextTrimmed,
        location: 'header',
        startIndex: startIndex,
        endIndex: endIndex,
        createdAt: new Date().toISOString()
      };
      
      await api.saveECObject(sessionId, ecObject);
      onLogEvent?.('success', `Oggetto EC creato: ${objectId}`);
      
      // Notifica il componente padre per aggiornare loadedECObjects
      if (onECObjectSaved) {
        onECObjectSaved(ecObject);
      }
      
      // Aggiungi ID all'oggetto locale
      newObject.id = objectId;
      newObject.ecObjectId = objectId;
    } catch (error) {
      console.error('Errore salvataggio oggetto EC:', error);
      onLogEvent?.('error', `Errore salvataggio oggetto EC: ${error.message}`);
    }
    
    setObjects(prev => {
      const updated = [...prev, newObject].sort((a, b) => a.startIndex - b.startIndex);
      console.log('Oggetti aggiornati:', updated);
      onObjectsChange?.(updated);
      return updated;
    });
    
    console.log('Oggetto header creato con successo:', newObject);
    
    setContextMenu(null);
    setSelectedText('');
    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
    }
  };

  const handleTransformCodeToObject = async () => {
    if (!codeSelection.text || codeSelection.start === null || codeSelection.end === null) {
      alert('Seleziona una porzione di codice prima di trasformarla in oggetto.');
      setContextMenu(null);
      return;
    }

    const start = codeSelection.start;
    const end = codeSelection.end;
    const targetEditorId = codeSelection.editorId;
    const targetEditor = codeEditors.find(e => e.id === targetEditorId);

    if (!targetEditor) {
      alert('Editor non trovato per la selezione.');
      setContextMenu(null);
      setCodeSelection({ start: null, end: null, text: '', editorId: null });
      return;
    }

    const prefix = getEditorPrefix(targetEditorId);
    const localStart = start - prefix;
    const localEnd = end - prefix;

    // Verifica che l'oggetto non sia già stato creato per questa posizione
    const isDuplicate = objects.some(obj => {
      if (obj.location !== 'content') return false;
      return (start >= obj.startIndex && start < obj.endIndex) ||
             (end > obj.startIndex && end <= obj.endIndex) ||
             (start <= obj.startIndex && end >= obj.endIndex);
    });
    
    if (isDuplicate) {
      alert('Questa porzione di codice è già stata trasformata in oggetto.');
      setContextMenu(null);
      setCodeSelection({ start: null, end: null, text: '', editorId: null });
      return;
    }
    
    // Genera ID e numero progressivo
    if (!sessionId || !testCaseId || !generateECObjectId || !getNextBoxNumber) {
      console.error('Parametri mancanti per salvare oggetto EC');
      alert('Impossibile salvare oggetto EC: parametri mancanti');
      return;
    }

    const boxNumber = await getNextBoxNumber(type);
    const objectId = generateECObjectId(type, boxNumber);
    
    if (!objectId) {
      console.error('Impossibile generare ID oggetto EC');
      alert('Impossibile generare ID oggetto EC');
      return;
    }
    
    const newObject = {
      text: codeSelection.text,
      startIndex: start,
      endIndex: end,
      location: 'content'
    };
    
    // Costruisci i nuovi editor: before / extracted / after
    const newSegments = [];
    codeEditors.forEach(seg => {
      if (seg.id !== targetEditorId) {
        newSegments.push(seg);
        return;
      }

      const beforeText = seg.code.substring(0, localStart);
      const extractedText = seg.code.substring(localStart, localEnd);
      const afterText = seg.code.substring(localEnd);

      if (beforeText.trim().length > 0) {
        newSegments.push({ id: `${seg.id}-before-${Date.now()}`, code: beforeText, type: 'normal' });
      }

      newSegments.push({
        id: `${seg.id}-obj-${Date.now()}`,
        code: extractedText,
        type: 'object',
        objectId
      });

      if (afterText.trim().length > 0) {
        newSegments.push({ id: `${seg.id}-after-${Date.now()}`, code: afterText, type: 'normal' });
      }
    });

    // Salva nel database
    try {
      const ecObject = {
        id: objectId,
        sessionId: sessionId,
        testCaseId: String(testCaseId),
        boxType: type,
        boxNumber: boxNumber,
        text: codeSelection.text,
        location: 'content',
        startIndex: start,
        endIndex: end,
        createdAt: new Date().toISOString()
      };
      
      await api.saveECObject(sessionId, ecObject);
      onLogEvent?.('success', `Oggetto EC creato: ${objectId}`);
      
      // Notifica il componente padre per aggiornare loadedECObjects
      if (onECObjectSaved) {
        onECObjectSaved(ecObject);
      }
      
      // Aggiungi ID all'oggetto locale
      newObject.id = objectId;
      newObject.ecObjectId = objectId;
    } catch (error) {
      console.error('Errore salvataggio oggetto EC:', error);
      onLogEvent?.('error', `Errore salvataggio oggetto EC: ${error.message}`);
    }
    
    setObjects(prev => {
      const updated = [...prev, newObject].sort((a, b) => a.startIndex - b.startIndex);
      console.log('Oggetti aggiornati:', updated);
      onObjectsChange?.(updated);
      return updated;
    });

    // Aggiorna editor e codice unito
    setCodeEditors(newSegments);
    const joined = joinEditorsCode(newSegments);
    isManualCodeChange.current = true;
    onCodeChange?.(joined);
    lastSyncedCodeRef.current = joined;
    
    console.log('Oggetto codice creato con successo:', newObject);
    
    setContextMenu(null);
    setCodeSelection({ start: null, end: null, text: '', editorId: null });
  };

  // Funzione per cancellare un binomio/connessione
  const handleDeleteConnection = async (connectionId) => {
    if (!sessionId || !connectionId) {
      console.error('Parametri mancanti per cancellare binomio');
      return;
    }
    
    try {
      console.log('🗑️ Cancellando binomio:', connectionId);
      
      // Elimina dal database
      await api.deleteBinomio(sessionId, connectionId);
      console.log('✅ Binomio cancellato dal database:', connectionId);
      
      // Rimuovi dalla lista locale delle connessioni
      setConnections(prev => prev.filter(conn => conn.id !== connectionId));
      
      // Notifica il componente padre per aggiornare loadedBinomi
      if (onBinomioDeleted) {
        onBinomioDeleted(connectionId);
      }
      
      // Reset del contatore se necessario
      connectionsInitializedRef.current = false;
      lastLoadedBinomiIdsRef.current = '';
      
      onLogEvent?.('success', `Binomio Fondamentale eliminato: ${connectionId}`);
    } catch (error) {
      console.error('Errore cancellazione binomio:', error);
      const errorMessage = error?.message || error?.toString() || 'Errore sconosciuto durante la cancellazione del binomio';
      onLogEvent?.('error', `Errore cancellazione binomio: ${errorMessage}`);
    }
    
    // Chiudi il menu contestuale
    setConnectionContextMenu(null);
  };
  
  // Handler per click destro su linea o pallino di connessione
  const handleConnectionContextMenu = (e, connectionId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const layerEC = layerECRef.current;
    if (!layerEC) return;
    
    const layerRect = layerEC.getBoundingClientRect();
    setConnectionContextMenu({
      connectionId,
      x: e.clientX - layerRect.left,
      y: e.clientY - layerRect.top
    });
  };
  
  const handleDeleteObject = async (objectId) => {
    // Trova l'oggetto da eliminare per ottenere l'ID EC
    let ecObjectId = null;
    const objToDelete = objects.find(obj => {
      const headerObjects = objects.filter(o => o.location === 'header');
      const contentObjects = objects.filter(o => o.location === 'content');
      const objId = obj.location === 'header' 
        ? `header-obj-${headerObjects.indexOf(obj)}`
        : `content-obj-${contentObjects.indexOf(obj)}`;
      return objId === objectId;
    });
    
    if (objToDelete?.ecObjectId) {
      ecObjectId = objToDelete.ecObjectId;
    }
    
    setObjects(prev => {
      const updated = prev.filter(obj => {
        // Rimuovi l'oggetto in base all'indice o all'ID
        if (objectId.includes('header-obj-')) {
          const idx = parseInt(objectId.replace('header-obj-', ''));
          const headerObjects = prev.filter(o => o.location === 'header');
          return obj !== headerObjects[idx];
        } else if (objectId.includes('content-obj-')) {
          const idx = parseInt(objectId.replace('content-obj-', ''));
          const contentObjects = prev.filter(o => o.location === 'content');
          return obj !== contentObjects[idx];
        }
        return true;
      });
      onObjectsChange?.(updated);
      return updated;
    });
    
    // Rimuovi anche le connessioni associate
    setConnections(prev => prev.filter(conn => 
      conn.from !== objectId && conn.to !== objectId
    ));
    
    // Elimina dal database se abbiamo l'ID EC
    if (ecObjectId && sessionId) {
      try {
        await api.deleteECObject(sessionId, ecObjectId);
        onLogEvent?.('success', `Oggetto EC eliminato: ${ecObjectId}`);
      } catch (error) {
        console.error('Errore eliminazione oggetto EC:', error);
        onLogEvent?.('error', `Errore eliminazione oggetto EC: ${error.message}`);
      }
    }
    
    setObjectContextMenu(null);
    console.log('Oggetto eliminato:', objectId);
  };

  // Smart Text: Double-click per entrare in modalità editing sull'oggetto To
  const handleToObjectDoubleClick = (objectId, e) => {
    e.stopPropagation();
    e.preventDefault();
    
    // Solo per oggetti content (To)
    if (!objectId.startsWith('content-obj-')) return;
    
    const contentObjects = objects.filter(o => o.location === 'content');
    const objIndex = parseInt(objectId.replace('content-obj-', ''));
    const obj = contentObjects[objIndex];
    
    if (!obj) return;
    
    // Ottieni il testo originale
    const originalText = state.code ? state.code.substring(obj.startIndex, obj.endIndex) : '';
    
    setEditingToObject({
      objectId,
      originalText,
      obj
    });
    
    // Focus sull'editor nella posizione dell'oggetto
    if (codeEditorRef.current) {
      const textarea = codeEditorRef.current.querySelector('textarea');
      if (textarea) {
        textarea.focus();
        textarea.setSelectionRange(obj.startIndex, obj.endIndex);
      }
    }
    
    console.log('Editing To object:', objectId, 'testo originale:', originalText);
  };

  // Funzione di logging diagnostico (salva in una variabile globale per copia/incolla)
  const logDiagnostic = (action, details) => {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const msg = `[DIAGNOSTICA ${timestamp}] ${action}`;
    console.log(msg, details);
    
    // Salva in window per copia facile
    if (!window._diagnosticLogs) window._diagnosticLogs = [];
    window._diagnosticLogs.push({ timestamp, action, details });
    // Mantieni ultimi 100
    if (window._diagnosticLogs.length > 100) window._diagnosticLogs.shift();
  };

  // Espone funzione globale per copiare i log
  useEffect(() => {
    window.copyDiagnostics = () => {
      const logs = JSON.stringify(window._diagnosticLogs, null, 2);
      navigator.clipboard.writeText(logs).then(() => alert('Log copiati!'));
      return "Log copiati nella clipboard";
    };
    return () => { delete window.copyDiagnostics; };
  }, []);

  // Ripristina il cursore se abbiamo una posizione salvata (evita salti dopo enforceIsolation)
  useEffect(() => {
    if (desiredCursorPosition.current === null) return;
    const target = Math.max(0, Math.min(desiredCursorPosition.current, (state.code || '').length));
    focusRangeInEditors(target, target);
    desiredCursorPosition.current = null;
  }, [state.code, focusRangeInEditors]);

  // Smart Text: Gestisce le modifiche al codice proteggendo gli oggetti TO
  const handleProtectedCodeChange = (newCode) => {
    const contentObjects = objects.filter(o => o.location === 'content');
    
    // Se non ci sono oggetti TO, permetti sempre la modifica
    if (contentObjects.length === 0) {
      onCodeChange?.(newCode);
      return;
    }
    
    // Se siamo in modalità editing su un oggetto TO specifico
    if (editingToObject) {
      const obj = editingToObject.obj;
      const oldCode = state.code || '';
      
      // Trova dove è avvenuta la modifica
      let changeStart = 0;
      for (let i = 0; i < Math.min(oldCode.length, newCode.length); i++) {
        if (oldCode[i] !== newCode[i]) {
          changeStart = i;
          break;
        }
        changeStart = i + 1;
      }

      // Calcola la differenza di lunghezza
      const lengthDiff = newCode.length - oldCode.length;
      const insertedText = lengthDiff > 0 ? newCode.substring(changeStart, changeStart + lengthDiff) : '';

      logDiagnostic('EDIT_ATTEMPT', {
        objectId: obj.id,
        currentIndices: { start: obj.startIndex, end: obj.endIndex },
        changeStart,
        lengthDiff,
        insertedText: insertedText === '\n' ? '\\n (ENTER)' : insertedText,
        newCodeLength: newCode.length
      });

      // Se la modifica è avvenuta FUORI dall'oggetto in editing (o ai suoi bordi critici), bloccala
      // Consideriamo un margine di sicurezza per evitare di cancellare per errore i bordi dell'oggetto
      // FIX CRITICO: changeStart è basato su oldCode.
      // Se stiamo appendendo alla fine, changeStart == obj.endIndex.
      // Se stiamo aggiungendo un newline che viene interpretato dopo la fine, dobbiamo permetterlo se siamo in editing.
      
      // Calcola se la modifica è un'estensione legittima (es. newline alla fine)
      const isAppending = changeStart === obj.endIndex;
      const isNewlineExtension = insertedText === '\n' || insertedText.trim() === ''; // Permetti spazi/newline
      
      // Permetti se siamo dentro, se stiamo appendendo, o se è un newline "vicino"
      const isAllowed = (changeStart >= obj.startIndex && changeStart <= obj.endIndex) || 
                       (isAppending) || 
                       (changeStart > obj.endIndex && changeStart <= obj.endIndex + 1 && isNewlineExtension);

      if (!isAllowed) {
        logDiagnostic('EDIT_BLOCKED_OUTSIDE', {
           changeStart,
           objStart: obj.startIndex,
           objEnd: obj.endIndex,
           insertedText
        });
        console.log('Modifica bloccata: puoi modificare solo l\'oggetto attivo.');
        // Non aggiorniamo il codice, quindi la modifica viene annullata
        return;
      }

      // Verifica se la modifica è avvenuta nell'area dell'oggetto in editing
      // Trova l'oggetto aggiornato con i nuovi indici
      const newEndIndex = obj.endIndex + lengthDiff;
      
      // Aggiorna il codice (prima) e poi normalizza isolamento
      isManualCodeChange.current = true;
      onCodeChange?.(newCode);
      
      // Aggiorna gli indici dell'oggetto in editing
      setEditingToObject(prev => {
        if (!prev) return null;
        return {
          ...prev,
          obj: {
            ...prev.obj,
            endIndex: newEndIndex
          }
        };
      });
      
      // Aggiorna anche l'oggetto nella lista objects
      setObjects(prevObjects => {
        return prevObjects.map(o => {
          if (o === obj || o.id === obj.id || o.ecObjectId === obj.ecObjectId) {
            return { ...o, endIndex: newEndIndex };
          }
          // Sposta gli oggetti successivi
          if (o.location === 'content' && o.startIndex > obj.startIndex) {
            return {
              ...o,
              startIndex: o.startIndex + lengthDiff,
              endIndex: o.endIndex + lengthDiff
            };
          }
          return o;
        });
      });
      
      // FIX: Enforce isolamento IMMEDIATO, altrimenti il cursore scappa.
      // La normalizzazione asincrona (setTimeout) creava un breve momento di inconsistenza.
      // Ora, se abbiamo aggiunto un newline, dobbiamo essere sicuri che non sia considerato "fuori".
      
      // Nota: `enforceToObjectIsolation` non tocca l'oggetto in editing (grazie al fix precedente),
      // ma dobbiamo assicurarci che `objects` sia aggiornato PRIMA che il render avvenga.
      
      // Il problema "fuoriuscita" può dipendere anche da come `handleProtectedCodeChange` interpreta il cursore.
      // Se `changeStart` è esattamente `endIndex` (append), deve essere permesso.
      
      return;
    }
    
    // Se NON siamo in modalità editing, blocca modifiche alle zone protette
    const oldCode = state.code || '';
    
    // Trova dove è avvenuta la modifica
    let changeStart = 0;
    // ... (rest of logic to find changeStart)
    
    // Trova il primo carattere diverso
    for (let i = 0; i < Math.min(oldCode.length, newCode.length); i++) {
      if (oldCode[i] !== newCode[i]) {
        changeStart = i;
        break;
      }
      changeStart = i + 1;
    }

    // Testo inserito (se positivo) per capire se è un semplice "Enter" sopra il blocco
    const lengthDiff = newCode.length - oldCode.length;
    const insertedText = lengthDiff > 0 ? newCode.substring(changeStart, changeStart + lengthDiff) : '';
    
    // MODIFICA RICHIESTA: Se stiamo editando un oggetto, NON permettere modifiche fuori da esso
    if (editingToObject) {
      const obj = editingToObject.obj;
      // Se la modifica è fuori dal range dell'oggetto in editing
      // Nota: newEndIndex è calcolato sopra nel blocco 'if (editingToObject)'
      // Qui dobbiamo ricalcolare se siamo fuori dal blocco originale esteso
      
      // Semplicemente: la logica sopra 'if (editingToObject)' gestisce GIA' le modifiche *dentro* l'oggetto
      // Se siamo arrivati qui (che non dovrebbe succedere se la logica sopra è corretta e completa), 
      // significa che qualcosa non va.
      
      // Aspetta, la logica sopra 'if (editingToObject)' ha un return;
      // Quindi se siamo qui, significa che NON siamo nel blocco 'if (editingToObject)'?
      // NO. La funzione handleProtectedCodeChange ha due rami principali.
      
      // Ramo 1: if (editingToObject) { ... return; }
      // Ramo 2: (nessun editing attivo) -> controlla se tocchiamo zone protette
      
      // Quindi dobbiamo modificare il Ramo 1 per controllare se la modifica è *dentro* l'oggetto.
      // Se è fuori, la blocchiamo.
    }
    
    // Verifica se la modifica tocca un oggetto TO protetto
    for (const obj of contentObjects) {
      const isInsideObject = changeStart > obj.startIndex && changeStart < obj.endIndex;

      // Consenti un singolo Enter subito prima del blocco per spingerlo in basso
      const isEnterBeforeObject =
        lengthDiff > 0 &&
        insertedText === '\n' &&
        changeStart <= obj.startIndex + 1;

      if (isInsideObject && !isEnterBeforeObject) {
        console.log('Modifica bloccata: tentativo di editare oggetto TO protetto. Fai doppio click per editare.');
        return;
      }
    }
    
    // La modifica è fuori dalle zone protette, permetti
    const textarea = codeEditorRef.current?.querySelector('textarea');
    const savedCursorPosition = textarea ? textarea.selectionStart : null;
    // Applica subito lo shift agli oggetti in base alla modifica (prima dell'isolamento)
    const shiftedObjects = lengthDiff === 0 ? objects : objects.map(o => {
      if (o.location === 'content' && o.startIndex > changeStart) {
        return {
          ...o,
          startIndex: o.startIndex + lengthDiff,
          endIndex: o.endIndex + lengthDiff
        };
      }
      return o;
    });

    // Enforce isolamento (newline prima/dopo i blocchi) preservando il cursore,
    // usando gli oggetti già shiftati per evitare doppi spostamenti/race
    const isolationResult = enforceToObjectIsolation(newCode, shiftedObjects);
    if (isolationResult.changed) {
      if (savedCursorPosition !== null) {
        desiredCursorPosition.current = savedCursorPosition;
      }
    }
    const finalCode = isolationResult.changed ? isolationResult.code : newCode;
    const finalObjects = isolationResult.changed ? isolationResult.objects : shiftedObjects;

    isManualCodeChange.current = true;
    onCodeChange?.(finalCode);
    setObjects(finalObjects);
    if (isolationResult.updatedEditing) setEditingToObject(isolationResult.updatedEditing);
  };

  // Smart Text: Annulla l'operazione di modifica (Abort)
  const handlePropagationAbort = () => {
    if (!showPropagationModal) return;
    const { objectId, originalText } = showPropagationModal;
    
    // Trova l'oggetto modificato
    const contentObjects = objects.filter(o => o.location === 'content');
    const objIndex = parseInt(objectId.replace('content-obj-', ''));
    const obj = contentObjects[objIndex];
    
    if (obj && state.code) {
      // Ripristina il testo nel codice
      const currentCode = state.code;
      const currentText = currentCode.substring(obj.startIndex, obj.endIndex);
      
      // Se il testo è diverso dall'originale, ripristinalo
      if (currentText !== originalText) {
        const before = currentCode.substring(0, obj.startIndex);
        const after = currentCode.substring(obj.endIndex);
        const restoredCode = before + originalText + after;
        
        // Aggiorna il codice nell'editor
        onCodeChange(restoredCode);
        
        // Aggiorna gli indici degli oggetti (poiché la lunghezza potrebbe cambiare)
        const lengthDiff = originalText.length - currentText.length;
        
        setObjects(prev => {
          return prev.map(o => {
            // Aggiorna l'oggetto corrente
            if (o === obj || o.id === obj.id || o.ecObjectId === obj.ecObjectId) {
              return { ...o, endIndex: o.startIndex + originalText.length };
            }
            // Sposta gli oggetti successivi
            if (o.location === 'content' && o.startIndex > obj.startIndex) {
              return {
                ...o,
                startIndex: o.startIndex + lengthDiff,
                endIndex: o.endIndex + lengthDiff
              };
            }
            return o;
          });
        });
        
        onLogEvent?.('info', 'Modifica annullata: ripristinato testo originale.');
      }
    }
    
    setShowPropagationModal(null);
    setEditingToObject(null);
  };

  // Smart Text: Conferma propagazione modifiche
  const handlePropagationConfirm = async (propagate) => {
    if (!showPropagationModal) return;
    
    const { objectId, newText, originalText, ecObjectId } = showPropagationModal;
    
    if (propagate) {
      // Propaga la modifica a tutti gli oggetti To con lo stesso testo originale
      console.log('Propagando modifica a tutti gli oggetti To con testo:', originalText);
      
      // Trova tutti gli oggetti To con lo stesso testo originale
      const contentObjects = objects.filter(o => o.location === 'content');
      const objectsToUpdate = contentObjects.filter(obj => {
        const objText = state.code ? state.code.substring(obj.startIndex, obj.endIndex) : '';
        return objText === originalText && (obj.ecObjectId || obj.id) !== ecObjectId;
      });
      
      // Aggiorna tutti gli oggetti trovati
      let newCode = state.code;
      let shiftAmount = newText.length - originalText.length;
      
      // Ordina per startIndex decrescente per non invalidare gli indici
      const sortedObjects = [...objectsToUpdate].sort((a, b) => b.startIndex - a.startIndex);
      
      for (const obj of sortedObjects) {
        const before = newCode.substring(0, obj.startIndex);
        const after = newCode.substring(obj.endIndex);
        newCode = before + newText + after;
      }
      
      // Aggiorna il codice
      if (objectsToUpdate.length > 0) {
        onCodeChange(newCode);
        
        // Aggiorna gli indici degli oggetti
        setObjects(prev => {
          const updated = prev.map(obj => {
            if (obj.location !== 'content') return obj;
            
            const objText = state.code ? state.code.substring(obj.startIndex, obj.endIndex) : '';
            if (objText === originalText) {
              // Aggiorna il testo dell'oggetto nel database
              if (obj.ecObjectId) {
                api.updateECObject(sessionId, obj.ecObjectId, { text: newText }).catch(console.error);
              }
              return { ...obj, text: newText };
            }
            return obj;
          });
          onObjectsChange?.(updated);
          return updated;
        });
        
        onLogEvent?.('success', `Propagata modifica a ${objectsToUpdate.length} oggetti To`);
      }
    } else {
      // Non propagare: rimuovi lo status dell'oggetto (elimina cornice e freccia)
      console.log('Rimuovendo status oggetto To:', objectId);
      
      // Usa handleDeleteObject per rimuovere oggetto e binomi associati
      // Questo mantiene il testo modificato nell'editor ma rimuove l'oggetto EC
      await handleDeleteObject(objectId);
      
      onLogEvent?.('info', 'Oggetto To convertito in testo semplice (modifica mantenuta).');
    }
    
    setShowPropagationModal(null);
    setEditingToObject(null);
  };

  const startConnectionFrom = (fromObjectId, event) => {
    if (connectingFrom) return;
    const layerEC = layerECRef.current;
    if (!layerEC) return;
    
    const layerRect = layerEC.getBoundingClientRect();
    const mouseX = event.clientX - layerRect.left;
    const mouseY = event.clientY - layerRect.top;

    const allPositions = [...headerObjectPositions, ...contentObjectPositions];
    const objPos = allPositions.find(p => p.id === fromObjectId);
    if (!objPos) return;

    const perimeterPoint = getPointOnPerimeter(mouseX, mouseY, objPos);
    
    setConnectingFrom(fromObjectId);
    setConnectingFromPoint(perimeterPoint);
    setConnectingMousePos({ x: mouseX, y: mouseY });
    setConnectionHoverTarget(null);
    setObjectContextMenu(null);
    console.log('Modalità connessione drag attivata da:', fromObjectId, 'punto', perimeterPoint);
  };

  const handleObjectClickForConnection = async (targetObjectId, e) => {
    if (connectingFrom && connectingFrom !== targetObjectId) {
      // Completa la connessione rilasciando su un oggetto
      const headerObjects = objects.filter(o => o.location === 'header');
      const contentObjects = objects.filter(o => o.location === 'content');
      
      const fromObj = objects.find((obj) => {
        const objId = obj.location === 'header' 
          ? `header-obj-${headerObjects.indexOf(obj)}`
          : `content-obj-${contentObjects.indexOf(obj)}`;
        return objId === connectingFrom;
      });
      
      const toObj = objects.find((obj) => {
        const objId = obj.location === 'header' 
          ? `header-obj-${headerObjects.indexOf(obj)}`
          : `content-obj-${contentObjects.indexOf(obj)}`;
        return objId === targetObjectId;
      });

      console.log('handleObjectClickForConnection:', { 
        connectingFrom, 
        targetObjectId, 
        fromObj: fromObj ? { id: fromObj.id, ecObjectId: fromObj.ecObjectId, text: fromObj.text } : null,
        toObj: toObj ? { id: toObj.id, ecObjectId: toObj.ecObjectId, text: toObj.text } : null,
        objectsCount: objects.length
      });

      if (fromObj && toObj) {
        // Calcola punto di connessione FROM (default o punto scelto dall'utente)
        const fromPointDefault = fromObj.location === 'header' 
          ? { x: 0.5, y: 1.0 } // Bordo inferiore (centro)
          : { x: 0.0, y: 0.0 }; // Angolo superiore sinistro
        const fromPoint = connectingFromPoint || fromPointDefault;
        
        // Calcola punto di connessione TO basato su dove si è rilasciato
        const allPositions = [...headerObjectPositions, ...contentObjectPositions];
        const toPos = allPositions.find(p => p.id === targetObjectId);
        
        let toPoint = toObj.location === 'header'
          ? { x: 0.5, y: 1.0 } // Default: bordo inferiore (centro)
          : { x: 0.0, y: 0.0 }; // Default: angolo superiore sinistro
        
        if (toPos && e && connectingMousePos) {
          // Usa la posizione del mouse al momento del rilascio
          const layerEC = layerECRef.current;
          if (layerEC) {
            const layerRect = layerEC.getBoundingClientRect();
            const mouseX = e.clientX - layerRect.left;
            const mouseY = e.clientY - layerRect.top;

            toPoint = getPointOnPerimeter(mouseX, mouseY, toPos);
          }
        }

        const newConnection = {
          id: `conn-${Date.now()}`,
          from: connectingFrom,
          to: targetObjectId,
          fromPoint: fromPoint,
          toPoint: toPoint
        };

        console.log('Creando connessione:', newConnection);
        setConnections(prev => {
          const updated = [...prev, newConnection];
          console.log('Connessioni aggiornate:', updated);
          return updated;
        });

        // Salva Binomio Fondamentale nel database ISTANTANEAMENTE
        if (sessionId && testCaseId && generateBinomioId && fromObj && toObj) {
          try {
            // Usa gli oggetti già trovati (fromObj e toObj)
            // Verifica che abbiano l'ecObjectId (ID EC dal database) o usa l'id come fallback
            const fromECId = fromObj.ecObjectId || fromObj.id;
            const toECId = toObj.ecObjectId || toObj.id;
            
            console.log('🔗 Creando Binomio Fondamentale:', { 
              fromObj: { id: fromObj.id, ecObjectId: fromObj.ecObjectId, text: fromObj.text?.substring(0, 50) },
              toObj: { id: toObj.id, ecObjectId: toObj.ecObjectId, text: toObj.text?.substring(0, 50) },
              fromECId,
              toECId,
              sessionId,
              testCaseId
            });
            
            if (fromECId && toECId && fromECId !== toECId) {
              const binomioId = generateBinomioId();
              if (binomioId) {
                const binomio = {
                  id: binomioId,
                  sessionId: sessionId,
                  testCaseId: String(testCaseId),
                  fromObjectId: fromECId,
                  toObjectId: toECId,
                  fromPoint: fromPoint,
                  toPoint: toPoint,
                  createdAt: new Date().toISOString()
                };
                
                console.log('💾 Salvando binomio nel database:', binomio);
                try {
                  const result = await api.saveBinomio(sessionId, binomio);
                  console.log('✅ Binomio salvato con successo:', result);
                  
                  // IMPORTANTE: Notifica il componente padre del nuovo binomio salvato
                  // Questo aggiorna loadedBinomi e garantisce che il prossimo ID generato sia univoco
                  if (onBinomioSaved) {
                    onBinomioSaved(binomio);
                    console.log('✅ Binomio notificato al componente padre:', binomio.id);
                  } else {
                    console.warn('⚠️ onBinomioSaved non disponibile, il contatore potrebbe non essere aggiornato');
                  }
                  
                  onLogEvent?.('success', `Binomio Fondamentale creato: ${binomioId}`);
                } catch (saveError) {
                  console.error('Errore salvataggio binomio:', saveError);
                  const errorMessage = saveError?.message || saveError?.toString() || 'Errore sconosciuto durante il salvataggio del binomio';
                  console.error('Dettagli errore binomio:', {
                    error: saveError,
                    message: errorMessage,
                    binomio: binomio,
                    sessionId,
                    testCaseId
                  });
                  onLogEvent?.('error', `Errore salvataggio binomio: ${errorMessage}`);
                }
              } else {
                console.error('❌ Impossibile generare ID binomio');
                onLogEvent?.('error', 'Impossibile generare ID binomio');
              }
            } else {
              console.warn('⚠️ Impossibile creare binomio - ID non validi:', {
                fromECId,
                toECId,
                fromObj: { id: fromObj.id, ecObjectId: fromObj.ecObjectId },
                toObj: { id: toObj.id, ecObjectId: toObj.ecObjectId },
                sameObject: fromECId === toECId
              });
              onLogEvent?.('warning', 'Impossibile creare binomio: ID oggetti EC non validi');
            }
          } catch (error) {
            console.error('Errore generale nella creazione del binomio:', error);
            const errorMessage = error?.message || error?.toString() || 'Errore sconosciuto durante la creazione del binomio';
            console.error('Dettagli errore generale:', {
              error,
              message: errorMessage,
              sessionId,
              testCaseId,
              fromObj: fromObj ? { id: fromObj.id, ecObjectId: fromObj.ecObjectId } : null,
              toObj: toObj ? { id: toObj.id, ecObjectId: toObj.ecObjectId } : null
            });
            onLogEvent?.('error', `Errore creazione binomio: ${errorMessage}`);
          }
        } else {
          console.warn('Parametri mancanti per creare binomio:', {
            sessionId: !!sessionId,
            testCaseId: !!testCaseId,
            generateBinomioId: !!generateBinomioId,
            fromObj: !!fromObj,
            toObj: !!toObj
          });
        }
      } else {
        console.warn('Oggetti non trovati per la connessione');
      }
    }
    setConnectingFrom(null);
    setConnectingFromPoint(null);
    setConnectingMousePos(null);
    setConnectionHoverTarget(null);
  };

  const [showForceMatchModal, setShowForceMatchModal] = useState(false);
  const [forceMatchTargetObject, setForceMatchTargetObject] = useState(null);
  const [availableBinomiForMatch, setAvailableBinomiForMatch] = useState([]);
  const [allECObjectsForMatch, setAllECObjectsForMatch] = useState([]);
  const [sortOrder, setSortOrder] = useState(null); // null | 'asc' | 'desc'

  // Handler per aprire il menu "Forza Match"
  const handleOpenForceMatch = async (objectId) => {
    setObjectContextMenu(null);
    setForceMatchTargetObject(objectId);
    setShowForceMatchModal(true);
    setSortOrder(null); // Reset ordinamento quando si apre la modale
    
    try {
      const [binomiRes, objectsRes] = await Promise.all([
        api.getBinomi(sessionId),
        api.getECObjects(sessionId)
      ]);
      setAvailableBinomiForMatch(binomiRes.binomi || []);
      setAllECObjectsForMatch(objectsRes.objects || []);
    } catch (error) {
      console.error("Errore caricamento dati per Force Match:", error);
      alert("Errore nel caricamento dei dati.");
    }
  };

  // Handler per toggle ordinamento
  const handleToggleSort = () => {
    if (sortOrder === null) {
      setSortOrder('asc');
    } else if (sortOrder === 'asc') {
      setSortOrder('desc');
    } else {
      setSortOrder(null);
    }
  };

  // Funzione per ordinare i binomi
  const getSortedBinomi = () => {
    if (sortOrder === null) {
      return availableBinomiForMatch;
    }
    
    const sorted = [...availableBinomiForMatch].sort((a, b) => {
      const tcA = parseInt(a.testCaseId) || 0;
      const tcB = parseInt(b.testCaseId) || 0;
      return sortOrder === 'asc' ? tcA - tcB : tcB - tcA;
    });
    
    return sorted;
  };

  // Handler per applicare il match forzato
  const handleApplyForceMatch = async (selectedBinomio) => {
    setShowForceMatchModal(false);
    
    if (!forceMatchTargetObject || !selectedBinomio) return;

    try {
      // 1. Identifica l'oggetto From target
      const targetObjId = forceMatchTargetObject;
      let actualTargetObj = objects.find(o => o.id === targetObjId || o.ecObjectId === targetObjId);
      
      if (!actualTargetObj && targetObjId.startsWith('header-obj-')) {
         const idx = parseInt(targetObjId.replace('header-obj-', ''));
         const headerObjects = objects.filter(o => o.location === 'header');
         actualTargetObj = headerObjects[idx];
      }

      if (!actualTargetObj) {
        alert("Oggetto target non trovato.");
        return;
      }

      // 2. Trova il codice "To" dal binomio selezionato
      const sourceToObject = allECObjectsForMatch.find(o => o.id === selectedBinomio.toObjectId);
      if (!sourceToObject) {
        alert("Oggetto sorgente 'To' non trovato.");
        return;
      }
      const newCodeBlock = sourceToObject.text;

      // 3. Calcola posizione inserimento (Ordinamento)
      const headerObjects = objects.filter(o => o.location === 'header')
                                   .sort((a, b) => a.startIndex - b.startIndex);
      
      const targetIndex = headerObjects.indexOf(actualTargetObj);
      let insertionIndex = 0;
      
      if (targetIndex > 0) {
        const precedingObjects = headerObjects.slice(0, targetIndex);
        const precedingConnections = connections.filter(c => {
           // Trova se c.from corrisponde a un oggetto precedente
           return precedingObjects.some(po => 
             c.from === po.id || 
             c.from === po.ecObjectId || 
             (c.from.startsWith('header-obj-') && parseInt(c.from.replace('header-obj-', '')) === headerObjects.indexOf(po))
           );
        });

        const contentObjects = objects.filter(o => o.location === 'content');
        const connectedToObjects = precedingConnections.map(c => {
           if (c.to.startsWith('content-obj-')) {
             const idx = parseInt(c.to.replace('content-obj-', ''));
             return contentObjects[idx];
           }
           return contentObjects.find(co => co.id === c.to || co.ecObjectId === c.to);
        }).filter(Boolean);

        if (connectedToObjects.length > 0) {
          insertionIndex = Math.max(...connectedToObjects.map(o => o.endIndex));
        }
      }

      // Prepara il testo da inserire
      const currentCode = state.code || '';
      let prefix = "";
      let suffix = "";
      
      if (insertionIndex > 0 && !currentCode.substring(0, insertionIndex).endsWith('\n\n')) prefix = "\n\n";
      if (insertionIndex < currentCode.length && !currentCode.substring(insertionIndex).startsWith('\n\n')) suffix = "\n\n";
      if (insertionIndex === 0 && currentCode.length > 0) suffix = "\n\n";

      const textToInsert = prefix + newCodeBlock + suffix;
      const finalCode = currentCode.slice(0, insertionIndex) + textToInsert + currentCode.slice(insertionIndex);
      
      // 4. Aggiorna il codice
      onCodeChange(finalCode);

      // 5. Shift oggetti successivi
      const shiftAmount = textToInsert.length;
      const newStartIndex = insertionIndex + prefix.length;
      const newEndIndex = newStartIndex + newCodeBlock.length;

      const updatedObjects = await Promise.all(objects.map(async (obj) => {
        if (obj.location === 'content' && obj.startIndex >= insertionIndex) {
          const updatedObj = { ...obj, startIndex: obj.startIndex + shiftAmount, endIndex: obj.endIndex + shiftAmount };
          if (obj.ecObjectId) {
             try {
               await api.updateECObject(sessionId, obj.ecObjectId, { startIndex: updatedObj.startIndex, endIndex: updatedObj.endIndex });
             } catch (e) { console.error("Errore shift:", e); }
          }
          return updatedObj;
        }
        return obj;
      }));

      // 6. Crea nuovo oggetto To
      const boxNumber = await getNextBoxNumber(type);
      const toObjectId = generateECObjectId(type, boxNumber);
      
      const ecObject = {
        id: toObjectId, sessionId: sessionId, testCaseId: String(testCaseId), boxType: type, boxNumber: boxNumber,
        text: newCodeBlock, location: 'content', startIndex: newStartIndex, endIndex: newEndIndex, createdAt: new Date().toISOString()
      };
      await api.saveECObject(sessionId, ecObject);
      
      const newToObject = { ...ecObject, ecObjectId: toObjectId };
      updatedObjects.push(newToObject);
      updatedObjects.sort((a, b) => a.startIndex - b.startIndex);
      setObjects(updatedObjects);

      // 7. Crea Binomio
      const existingBinomiTC = availableBinomiForMatch.filter(b => b.testCaseId === String(testCaseId));
      let currentMax = 0;
      existingBinomiTC.forEach(b => {
         const parts = b.id.split('-');
         const lastPart = parts[parts.length - 1];
         const num = parseInt(lastPart, 10);
         if (!isNaN(num) && num > currentMax) currentMax = num;
      });
      
      const binomioId = generateBinomioId(sessionId, testCaseId, currentMax);
      
      if (binomioId) {
        const binomio = {
          id: binomioId, sessionId: sessionId, testCaseId: String(testCaseId),
          fromObjectId: actualTargetObj.ecObjectId || actualTargetObj.id, toObjectId: toObjectId,
          fromPoint: { x: 0.5, y: 1 }, toPoint: { x: 0.5, y: 0 }, createdAt: new Date().toISOString()
        };
        
        await api.saveBinomio(sessionId, binomio);
        if (onBinomioSaved) onBinomioSaved(binomio);
        alert("Match forzato applicato con successo!");
      }

    } catch (error) {
      console.error("Errore applicazione Force Match:", error);
      alert("Errore durante l'applicazione del match: " + error.message);
    }
  };

  const getConnectionPointPosition = useCallback((objectId, point) => {
    const allPositions = [...headerObjectPositions, ...contentObjectPositions];
    const objPos = allPositions.find(pos => pos.id === objectId);
    if (!objPos) return { x: 0, y: 0 };

    // point è relativo (0-1) rispetto alle dimensioni dell'oggetto
    const x = objPos.left + (point.x * objPos.width);
    let y = objPos.top + (point.y * objPos.height);
    
    // CORREZIONE: Se è un oggetto contenuto, aggiungi l'offset dell'header
    // perché le coordinate in contentObjectPositions sono relative al contenuto,
    // ma l'SVG delle connessioni è relativo all'intero blocco (header + contenuto)
    if (objectId.startsWith('content-obj-') && gherkinBlockHeaderRef.current) {
      y += gherkinBlockHeaderRef.current.offsetHeight;
    }
    
    return { x, y };
  }, [headerObjectPositions, contentObjectPositions]);

  const handleObjectContextMenu = (e, objectId) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Se Alt è premuto, inizia connessione drag
    if (e.altKey) {
      if (!connectingFrom) {
        startConnectionFrom(objectId, e);
      }
      return;
    }
    
    setObjectContextMenu({
      x: e.clientX,
      y: e.clientY,
      objectId: objectId
    });
  };

  // Calcola le posizioni dei bordi degli oggetti nell'header del Layer EC
  useEffect(() => {
    const headerObjects = objects.filter(obj => obj.location === 'header');
    
    if (headerObjects.length === 0 || !gherkinTextRef.current || !gherkinLabelRef.current) {
      setHeaderObjectPositions([]);
      return;
    }

    const calculateHeaderObjectPositions = () => {
      const textElement = gherkinTextRef.current;
      const labelElement = gherkinLabelRef.current;
      if (!textElement || !labelElement) return;

      const sortedObjects = [...headerObjects].sort((a, b) => a.startIndex - b.startIndex);
      
      const positions = sortedObjects.map((obj, idx) => {
        try {
          const range = document.createRange();
          const walker = document.createTreeWalker(
            textElement,
            NodeFilter.SHOW_TEXT,
            null
          );
          
          let charCount = 0;
          let startNode = null;
          let startOffset = 0;
          let endNode = null;
          let endOffset = 0;
          
          let node;
          while ((node = walker.nextNode())) {
            const nodeText = node.textContent || '';
            const nodeLength = nodeText.length;
            const nodeStart = charCount;
            const nodeEnd = charCount + nodeLength;
            
            if (startNode === null && nodeEnd >= obj.startIndex) {
              startNode = node;
              startOffset = Math.max(0, obj.startIndex - nodeStart);
            }
            
            if (nodeEnd >= obj.endIndex) {
              endNode = node;
              endOffset = Math.min(nodeLength, obj.endIndex - nodeStart);
              break;
            }
            
            charCount += nodeLength;
          }
          
          if (startNode && endNode) {
            range.setStart(startNode, startOffset);
            range.setEnd(endNode, endOffset);
            
            const rangeRect = range.getBoundingClientRect();
            const labelRect = labelElement.getBoundingClientRect();
            
            const left = rangeRect.left - labelRect.left;
            const top = rangeRect.top - labelRect.top;
            
            return {
              id: `header-obj-${idx}`,
              left: left,
              top: top,
              width: Math.max(rangeRect.width, 10),
              height: Math.max(rangeRect.height, 16),
              text: obj.text
            };
          }
        } catch (error) {
          console.warn('Errore calcolo posizione oggetto header:', error, obj);
        }
        
        return null;
      }).filter(pos => pos !== null);

      setHeaderObjectPositions(positions);
    };

    const timeoutId = setTimeout(calculateHeaderObjectPositions, 50);
    
    const resizeObserver = new ResizeObserver(() => {
      calculateHeaderObjectPositions();
    });
    
    if (gherkinLabelRef.current) {
      resizeObserver.observe(gherkinLabelRef.current);
    }
    if (gherkinTextRef.current) {
      resizeObserver.observe(gherkinTextRef.current);
    }
    
    const mutationObserver = new MutationObserver(() => {
      calculateHeaderObjectPositions();
    });
    
    if (gherkinTextRef.current) {
      mutationObserver.observe(gherkinTextRef.current, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    
    const handleUpdate = () => calculateHeaderObjectPositions();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [objects, text, isExpanded]);

  // Calcola le posizioni dei bordi degli oggetti nel contenuto del Layer EC
  useEffect(() => {
    const contentObjects = objects.filter(obj => obj.location === 'content');
    
    if (contentObjects.length === 0 || !isExpanded || !gherkinBlockContentRef.current) {
      setContentObjectPositions([]);
      return;
    }

    const calculateContentObjectPositions = () => {
      const containerRect = gherkinBlockContentRef.current.getBoundingClientRect();
      const sortedObjects = [...contentObjects].sort((a, b) => a.startIndex - b.startIndex);

      const positions = sortedObjects.map((obj, idx) => {
        const seg = codeEditors.find(
          s => s.type === 'object' && (s.objectId === obj.ecObjectId || s.objectId === obj.id)
        );
        const editorEl = seg ? codeEditorRefs.current[seg.id] : null;
        if (!editorEl) return null;

        const rect = editorEl.getBoundingClientRect();
        return {
          id: `content-obj-${idx}`,
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
          text: obj.text?.substring(0, 50) + (obj.text?.length > 50 ? '...' : '')
        };
      }).filter(Boolean);

      setContentObjectPositions(positions);
    };

    const timeoutId = setTimeout(calculateContentObjectPositions, 100);
    const handleUpdate = () => calculateContentObjectPositions();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [objects, isExpanded, codeEditors]);

  // Aggiorna i numeri di riga quando cambia il codice
  useEffect(() => {
    if (!lineNumbersRef.current || !codeEditorRef.current) return;
    
    const code = state.code || '';
    const lines = code.split('\n');
    const lineCount = Math.max(lines.length, 1); // Almeno una riga anche se vuoto
    
    // Genera i numeri di riga
    const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1)
      .map(num => `<div>${num}</div>`)
      .join('');
    
    if (lineNumbersRef.current) {
      lineNumbersRef.current.innerHTML = lineNumbers;
    }
    
    // Sincronizza lo scroll e l'altezza dei numeri di riga con il textarea
    const textarea = codeEditorRef.current.querySelector('textarea');
    const pre = codeEditorRef.current.querySelector('pre');
    
    if (textarea && lineNumbersRef.current) {
      // Sincronizza l'altezza
      const syncHeight = () => {
        const textareaHeight = textarea.scrollHeight;
        lineNumbersRef.current.style.height = `${textareaHeight}px`;
        lineNumbersRef.current.style.minHeight = textarea.style.minHeight || '400px';
      };
      
      // Sincronizza lo scroll
      const syncScroll = () => {
        lineNumbersRef.current.scrollTop = textarea.scrollTop;
      };
      
      syncHeight();
      
      textarea.addEventListener('scroll', syncScroll);
      if (pre) {
        pre.addEventListener('scroll', syncScroll);
      }
      
      // Osserva i cambiamenti di dimensione del textarea
      const resizeObserver = new ResizeObserver(() => {
        syncHeight();
      });
      resizeObserver.observe(textarea);
      
      return () => {
        textarea.removeEventListener('scroll', syncScroll);
        if (pre) {
          pre.removeEventListener('scroll', syncScroll);
        }
        resizeObserver.disconnect();
      };
    }
  }, [state.code]);

  // Aggiorna le dimensioni del Layer EC quando cambia lo stato collassato/espanso
  useEffect(() => {
    if (!layerECRef.current || !gherkinBlockContainerRef.current) return;

    const updateLayerECSize = () => {
      const header = gherkinBlockHeaderRef.current;
      const content = gherkinBlockContentRef.current;
      
      if (!header) return;

      // Aggiorna altezza header
      if (layerECHeaderRef.current) {
        layerECHeaderRef.current.style.height = header.offsetHeight + 'px';
      }

      // Aggiorna posizione e altezza contenuto
      if (isExpanded && content && layerECContentRef.current) {
        layerECContentRef.current.style.top = header.offsetHeight + 'px';
        layerECContentRef.current.style.height = content.offsetHeight + 'px';
      }
    };

    const timeoutId = setTimeout(updateLayerECSize, 50);
    
    const resizeObserver = new ResizeObserver(() => {
      updateLayerECSize();
    });
    
    if (gherkinBlockContainerRef.current) {
      resizeObserver.observe(gherkinBlockContainerRef.current);
    }
    if (gherkinBlockHeaderRef.current) {
      resizeObserver.observe(gherkinBlockHeaderRef.current);
    }
    if (gherkinBlockContentRef.current) {
      resizeObserver.observe(gherkinBlockContentRef.current);
    }

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, [isExpanded]);

  // Funzione per renderizzare il testo (senza evidenziazioni inline)
  const renderTextWithObjects = () => {
    // Il testo viene renderizzato normalmente, le evidenziazioni sono nel Layer EC
    return text;
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  return (
    <div 
      ref={gherkinBlockContainerRef}
      className={`gherkin-block-container ${type} ${isExpanded ? 'expanded' : ''}`}
      style={{ position: 'relative' }}
    >
      <div 
        ref={gherkinBlockHeaderRef}
        className="gherkin-block-header" 
        onClick={onToggle}
      >
        <div 
          ref={gherkinLabelRef}
          className="gherkin-label" 
          style={{ position: 'relative' }}
        >
          <span className="gherkin-type">{label}</span>
          <span 
            ref={gherkinTextRef}
            className="gherkin-text" 
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            onMouseUp={handleTextSelection}
            onContextMenu={handleContextMenu}
          >
            {renderTextWithObjects()}
          </span>
        </div>
        <button className="toggle-button">{isExpanded ? '▼' : '▶'}</button>
      </div>
      
      {/* Layer EC - Struttura semplificata: Header + Contenuto collassabile */}
      {gherkinBlockContainerRef.current && (
        <div 
          ref={layerECRef}
          className="layer-ec-block"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            pointerEvents: 'none',
            zIndex: 10,
            overflow: 'visible'
          }}
        >
          {/* SVG per le linee di connessione */}
          <svg
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              zIndex: 1
            }}
          >
            {/* Linee di connessione esistenti */}
            {isExpanded && connections.map((conn) => {
              const fromPoint = getConnectionPointPosition(conn.from, conn.fromPoint);
              const toPoint = getConnectionPointPosition(conn.to, conn.toPoint);
              
              // Verifica che i punti siano validi
              if (!fromPoint || !toPoint || (fromPoint.x === 0 && fromPoint.y === 0 && toPoint.x === 0 && toPoint.y === 0)) {
                return null;
              }

              return (
                <g key={conn.id}>
                  {/* Linea di connessione - clickabile con tasto destro */}
                  <line
                    x1={fromPoint.x}
                    y1={fromPoint.y}
                    x2={toPoint.x}
                    y2={toPoint.y}
                    stroke="#ff9800"
                    strokeWidth="8"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                    style={{ cursor: 'pointer', pointerEvents: 'auto' }}
                    onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  />
                  {/* Linea visiva sottile */}
                  <line
                    x1={fromPoint.x}
                    y1={fromPoint.y}
                    x2={toPoint.x}
                    y2={toPoint.y}
                    stroke="#ff9800"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
                    style={{ pointerEvents: 'none' }}
                  />
                  {/* Punto di connessione FROM */}
                  <circle
                    cx={fromPoint.x}
                    cy={fromPoint.y}
                    r="6"
                    fill="#ff9800"
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: 'move', pointerEvents: 'auto' }}
                    onMouseDown={(e) => {
                      if (e.button === 0) { // Solo tasto sinistro per drag
                        e.stopPropagation();
                        setDraggingConnectionPoint({ connectionId: conn.id, pointType: 'from' });
                      }
                    }}
                    onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  />
                  {/* Punto di connessione TO */}
                  <circle
                    cx={toPoint.x}
                    cy={toPoint.y}
                    r="6"
                    fill="#ff9800"
                    stroke="white"
                    strokeWidth="2"
                    style={{ cursor: 'move', pointerEvents: 'auto' }}
                    onMouseDown={(e) => {
                      if (e.button === 0) { // Solo tasto sinistro per drag
                        e.stopPropagation();
                        setDraggingConnectionPoint({ connectionId: conn.id, pointType: 'to' });
                      }
                    }}
                    onContextMenu={(e) => handleConnectionContextMenu(e, conn.id)}
                  />
                </g>
              );
            })}
            
            {/* Linea temporanea durante il drag (Alt + click destro) */}
            {isExpanded && connectingFrom && connectingMousePos && (() => {
              // Trova l'oggetto FROM per determinare il punto di partenza
              const fromObj = objects.find((obj) => {
                const headerObjects = objects.filter(o => o.location === 'header');
                const contentObjects = objects.filter(o => o.location === 'content');
                const objId = obj.location === 'header' 
                  ? `header-obj-${headerObjects.indexOf(obj)}`
                  : `content-obj-${contentObjects.indexOf(obj)}`;
                return objId === connectingFrom;
              });
              
              if (!fromObj) return null;
              
              // Punto di partenza default basato sulla location
              const defaultFromPoint = fromObj.location === 'header' 
                ? { x: 0.5, y: 1.0 } // Bordo inferiore (centro)
                : { x: 0.0, y: 0.0 }; // Angolo superiore sinistro
              
              const relFromPoint = connectingFromPoint || defaultFromPoint;
              const fromPoint = getConnectionPointPosition(connectingFrom, relFromPoint);
              
              return (
                <g>
                  <line
                    x1={fromPoint.x}
                    y1={fromPoint.y}
                    x2={connectingMousePos.x}
                    y2={connectingMousePos.y}
                    stroke="#ff9800"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead-temp)"
                  />
                  <circle
                    cx={connectingMousePos.x}
                    cy={connectingMousePos.y}
                    r="6"
                    fill="#ff9800"
                    stroke="white"
                    strokeWidth="2"
                  />
                </g>
              );
            })()}
            
            {/* Frecce per la fine della linea - ridotte di almeno la metà */}
            <defs>
              <marker
                id="arrowhead"
                markerWidth="5"
                markerHeight="5"
                refX="4.5"
                refY="1.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 5 1.5, 0 3"
                  fill="#ff9800"
                />
              </marker>
              <marker
                id="arrowhead-temp"
                markerWidth="5"
                markerHeight="5"
                refX="4.5"
                refY="1.5"
                orient="auto"
              >
                <polygon
                  points="0 0, 5 1.5, 0 3"
                  fill="#ff9800"
                />
              </marker>
            </defs>
          </svg>
          {/* Header specchio - spazio libero per future marcazioni */}
          {gherkinBlockHeaderRef.current && (
            <div 
              ref={layerECHeaderRef}
              className="layer-ec-header"
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: gherkinBlockHeaderRef.current.offsetHeight + 'px',
                pointerEvents: 'none',
                overflow: 'visible'
              }}
            >
              {/* Bordi degli oggetti creati nell'header - unici elementi visibili e cliccabili */}
              {headerObjectPositions.map((pos) => {
                if (!gherkinLabelRef.current) return null;
                const labelRect = gherkinLabelRef.current.getBoundingClientRect();
                const headerRect = gherkinBlockHeaderRef.current.getBoundingClientRect();
                const relativeTop = pos.top + (labelRect.top - headerRect.top);
                
                return (
                  <div
                    key={pos.id}
                    className="gherkin-object-border header-object-border"
                    style={{
                      position: 'absolute',
                      left: `${pos.left + (labelRect.left - headerRect.left)}px`,
                      top: `${relativeTop}px`,
                      width: `${pos.width}px`,
                      height: `${pos.height}px`,
                      border: connectingFrom && connectingFrom !== pos.id 
                        ? '4px dashed #ff9800' 
                        : '4px dashed #ff9800',
                      borderRadius: '4px',
                      pointerEvents: 'none',
                      boxSizing: 'border-box',
                      backgroundColor: connectingFrom && connectingFrom !== pos.id 
                        ? 'rgba(255, 152, 0, 0.1)' 
                        : 'transparent',
                      transition: 'background-color 0.2s'
                    }}
                    title={pos.text}
                  >
                    {/* Bordo cliccabile - solo il perimetro è interattivo */}
                    {/* Bordo superiore */}
                    <div
                      className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      left: '-4px',
                      right: '-4px',
                      height: '4px',
                      pointerEvents: 'auto',
                        cursor: connectingFrom ? 'crosshair' : 'pointer'
                    }}
                      onMouseDown={(e) => {
                        if (e.button === 2 && e.altKey) {
                          e.preventDefault();
                          startConnectionFrom(pos.id, e);
                        }
                      }}
                      onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto header cliccato:', pos.text);
                      }
                    }}
                    />
                    {/* Bordo inferiore */}
                    <div
                      className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                      style={{
                        position: 'absolute',
                        bottom: '-4px',
                        left: '-4px',
                        right: '-4px',
                        height: '4px',
                        pointerEvents: 'auto',
                        cursor: connectingFrom ? 'crosshair' : 'pointer'
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 2 && e.altKey) {
                          e.preventDefault();
                          startConnectionFrom(pos.id, e);
                        }
                      }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto header cliccato:', pos.text);
                      }
                    }}
                    />
                    {/* Bordo sinistro */}
                    <div
                      className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        left: '-4px',
                        bottom: '-4px',
                        width: '4px',
                        pointerEvents: 'auto',
                        cursor: connectingFrom ? 'crosshair' : 'pointer'
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 2 && e.altKey) {
                          e.preventDefault();
                          startConnectionFrom(pos.id, e);
                        }
                      }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto header cliccato:', pos.text);
                      }
                    }}
                    />
                    {/* Bordo destro */}
                    <div
                      className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                      style={{
                        position: 'absolute',
                        top: '-4px',
                        right: '-4px',
                        bottom: '-4px',
                        width: '4px',
                        pointerEvents: 'auto',
                        cursor: connectingFrom ? 'crosshair' : 'pointer'
                      }}
                      onMouseDown={(e) => {
                        if (e.button === 2 && e.altKey) {
                          e.preventDefault();
                          startConnectionFrom(pos.id, e);
                        }
                      }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto header cliccato:', pos.text);
                      }
                    }}
                    />
                  </div>
                );
              })}
            </div>
          )}
          
          {/* Contenuto collassabile specchio - spazio libero per future marcazioni */}
          {isExpanded && gherkinBlockContentRef.current && (
            <div 
              ref={layerECContentRef}
              className="layer-ec-content"
              style={{
                position: 'absolute',
                top: gherkinBlockHeaderRef.current?.offsetHeight || 0,
                left: 0,
                width: '100%',
                height: gherkinBlockContentRef.current.offsetHeight + 'px',
                pointerEvents: 'none',
                overflow: 'visible'
              }}
            >
              {/* Bordi degli oggetti creati nel contenuto - unici elementi visibili e cliccabili */}
              {contentObjectPositions.map((pos) => {
                const isEditing = editingToObject?.objectId === pos.id;
                
                return (
                <div
                  key={pos.id}
                  data-to-object-id={pos.id}
                  className={`gherkin-object-border code-object-border ${isEditing ? 'editing' : 'locked'}`}
                  style={{
                    position: 'absolute',
                    left: `${pos.left}px`,
                    top: `${pos.top}px`,
                    width: `${pos.width}px`,
                    height: `${pos.height}px`,
                    border: '4px dashed #ff9800',
                    borderRadius: '4px',
                    boxSizing: 'border-box',
                    backgroundColor: isEditing 
                      ? 'rgba(255, 152, 0, 0.25)' 
                      : (connectingFrom && connectingFrom !== pos.id 
                        ? 'rgba(255, 152, 0, 0.1)' 
                        : 'transparent'),
                    transition: 'background-color 0.2s',
                    boxShadow: isEditing ? '0 0 10px rgba(255, 152, 0, 0.5)' : 'none',
                    pointerEvents: 'none', // IMPORTANTE: Permette click alla textarea sottostante
                    zIndex: isEditing ? 10 : 5 // Z-index più alto per stare sopra l'overlay quando in editing
                  }}
                  title={isEditing ? 'In modifica - clicca fuori per terminare' : `Oggetto TO: ${pos.text}`}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    // Double click disabled in favor of flag
                  }}
                >
                  {/* EDIT ICON FOR EDITING - Deve avere pointerEvents auto */}
                  {/* Show icon if not editing OR if editing THIS object (to allow toggle off) */}
                  {(!isEditing || (editingToObject && editingToObject.objectId === pos.id)) && !connectingFrom && (
                    <div 
                      className="to-object-flag"
                      title={isEditing ? "Termina modifica" : "Modifica testo (AI Guided)"}
                      onClick={(e) => toggleToObjectEdit(pos.id, e)}
                      style={{
                        ...(isEditing ? { backgroundColor: '#e67e22', borderColor: '#e67e22' } : {}),
                        pointerEvents: 'auto' // Riabilita click sull'icona
                      }}
                    >
                      {isEditing ? (
                        /* Checkmark icon for finishing edit */
                        <svg viewBox="0 0 24 24">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      ) : (
                        /* Pencil icon for starting edit */
                        <svg viewBox="0 0 24 24">
                          <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                        </svg>
                      )}
                    </div>
                  )}

                  {/* Bordo cliccabile - solo il perimetro è interattivo */}
                  {/* Bordo superiore */}
                  <div
                    className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      left: '-4px',
                      right: '-4px',
                      height: '8px', // Aumentato per facilitare click
                      pointerEvents: 'auto', // Riabilita click
                      cursor: connectingFrom ? 'crosshair' : 'pointer',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 2 && e.altKey) {
                        e.preventDefault();
                        startConnectionFrom(pos.id, e);
                      }
                    }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto contenuto cliccato:', pos.text);
                      }
                    }}
                  />
                  {/* Bordo inferiore */}
                  <div
                    className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                    style={{
                      position: 'absolute',
                      bottom: '-4px',
                      left: '-4px',
                      right: '-4px',
                      height: '8px', // Aumentato
                      pointerEvents: 'auto',
                      cursor: connectingFrom ? 'crosshair' : 'pointer',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 2 && e.altKey) {
                        e.preventDefault();
                        startConnectionFrom(pos.id, e);
                      }
                    }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto contenuto cliccato:', pos.text);
                      }
                    }}
                  />
                  {/* Bordo sinistro */}
                  <div
                    className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      left: '-4px',
                      bottom: '-4px',
                      width: '8px', // Aumentato
                      pointerEvents: 'auto',
                      cursor: connectingFrom ? 'crosshair' : 'pointer',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 2 && e.altKey) {
                        e.preventDefault();
                        startConnectionFrom(pos.id, e);
                      }
                    }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto contenuto cliccato:', pos.text);
                      }
                    }}
                  />
                  {/* Bordo destro */}
                  <div
                    className={`object-border-edge ${connectionHoverTarget === pos.id ? 'connection-hover-candidate' : ''}`}
                    style={{
                      position: 'absolute',
                      top: '-4px',
                      right: '-4px',
                      bottom: '-4px',
                      width: '8px', // Aumentato
                      pointerEvents: 'auto',
                      cursor: connectingFrom ? 'crosshair' : 'pointer',
                      zIndex: 10
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 2 && e.altKey) {
                        e.preventDefault();
                        startConnectionFrom(pos.id, e);
                      }
                    }}
                    onContextMenu={(e) => handleObjectContextMenu(e, pos.id)}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (connectingFrom) {
                        handleObjectClickForConnection(pos.id, e);
                      } else {
                        console.log('Oggetto contenuto cliccato:', pos.text);
                      }
                    }}
                  />
                </div>
              );})}

              {/* Overlay per bloccare focus fuori dall'oggetto in editing */}
              {editingToObject && (
                <>
                  {/* Overlay scuro che copre tutto tranne l'oggetto */}
                  {/* Implementato come 4 rettangoli attorno all'oggetto per creare un 'buco' */}
                  {/* Nota: questo è necessario perché 'pointer-events' non supporta 'forare' un div */}
                  {(() => {
                    const activeObjPos = contentObjectPositions.find(p => p.id === editingToObject.objectId);
                    if (!activeObjPos) return null;

                    // Dimensioni totali (approssimate, dovrebbero coprire tutto l'editor visibile)
                    // Dato che siamo inside layer-ec-content che ha width 100% e height del contenuto
                    // Possiamo usare 100% width e height
                    
                    return (
                      <>
                        {/* Top Mask */}
                        <div style={{
                          position: 'absolute', top: 0, left: 0, right: 0, height: activeObjPos.top + 'px',
                          backgroundColor: 'rgba(0,0,0,0.05)', pointerEvents: 'auto', zIndex: 4
                        }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} />
                        
                        {/* Bottom Mask */}
                        <div style={{
                          position: 'absolute', top: (activeObjPos.top + activeObjPos.height) + 'px', left: 0, right: 0, bottom: 0,
                          backgroundColor: 'rgba(0,0,0,0.05)', pointerEvents: 'auto', zIndex: 4
                        }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} />
                        
                        {/* Left Mask */}
                        <div style={{
                          position: 'absolute', top: activeObjPos.top + 'px', left: 0, width: activeObjPos.left + 'px', height: activeObjPos.height + 'px',
                          backgroundColor: 'rgba(0,0,0,0.05)', pointerEvents: 'auto', zIndex: 4
                        }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} />
                        
                        {/* Right Mask */}
                        <div style={{
                          position: 'absolute', top: activeObjPos.top + 'px', left: (activeObjPos.left + activeObjPos.width) + 'px', right: 0, height: activeObjPos.height + 'px',
                          backgroundColor: 'rgba(0,0,0,0.05)', pointerEvents: 'auto', zIndex: 4
                        }} onClick={(e) => { e.stopPropagation(); e.preventDefault(); }} />
                      </>
                    );
                  })()}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {contextMenu && (
        <div 
          ref={contextMenuRef}
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.target === 'gherkin' && (
            <button 
              className="context-menu-item"
              onClick={handleTransformToObject}
            >
              🔷 Trasforma enunciato in oggetto
            </button>
          )}
          {contextMenu.target === 'code' && (
            <button 
              className="context-menu-item"
              onClick={handleTransformToObject}
            >
              🔷 Trasforma codice in oggetto
            </button>
          )}
        </div>
      )}

      {objectContextMenu && (
        <div 
          className="context-menu object-context-menu"
          style={{
            position: 'fixed',
            left: `${objectContextMenu.x}px`,
            top: `${objectContextMenu.y}px`,
            zIndex: 10001
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item delete-item"
            onClick={() => handleDeleteObject(objectContextMenu.objectId)}
          >
            🗑️ Elimina oggetto
          </button>
          
          {/* Opzione Forza Match solo per oggetti Header (From) */}
          {objectContextMenu.objectId.includes('header-obj-') && (
            <button 
              className="context-menu-item"
              onClick={() => handleOpenForceMatch(objectContextMenu.objectId)}
              style={{ borderTop: '1px solid #eee', marginTop: '4px', paddingTop: '4px' }}
            >
              🔗 Forza Match
            </button>
          )}
        </div>
      )}
      
      {/* Menu contestuale per connessioni/binomi */}
      {/* Modale per selezione Binomi Forza Match */}
      {showForceMatchModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 10002,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>
          <div className="modal-content" style={{
            backgroundColor: 'white', padding: '20px', borderRadius: '8px',
            maxWidth: '600px', width: '90%', maxHeight: '80vh', overflowY: 'auto',
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>🔗 Seleziona Binomio per Forza Match</h3>
              <button
                onClick={handleToggleSort}
                style={{
                  padding: '6px 12px', border: '1px solid #ddd', borderRadius: '4px',
                  backgroundColor: sortOrder ? '#3498db' : '#ecf0f1', color: sortOrder ? 'white' : '#2c3e50',
                  cursor: 'pointer', fontSize: '0.9em', display: 'flex', alignItems: 'center', gap: '5px'
                }}
                title={sortOrder === 'asc' ? 'Ordinato crescente' : sortOrder === 'desc' ? 'Ordinato decrescente' : 'Clicca per ordinare'}
              >
                {sortOrder === 'asc' ? '↑' : sortOrder === 'desc' ? '↓' : '⇅'} Ordina per Test Case
              </button>
            </div>
            <p style={{ marginTop: '0', color: '#666' }}>Scegli un binomio esistente da applicare a questo oggetto.</p>
            
            <div className="binomi-list" style={{ marginTop: '15px' }}>
              {availableBinomiForMatch.length === 0 ? (
                <p>Nessun binomio disponibile.</p>
              ) : (
                getSortedBinomi().map(binomio => {
                  const fromObj = allECObjectsForMatch.find(o => o.id === binomio.fromObjectId);
                  const toObj = allECObjectsForMatch.find(o => o.id === binomio.toObjectId);
                  
                  if (!fromObj || !toObj) return null;
                  
                  return (
                    <div 
                      key={binomio.id} 
                      onClick={() => handleApplyForceMatch(binomio)}
                      style={{
                        padding: '10px', border: '1px solid #ddd', borderRadius: '4px',
                        marginBottom: '8px', cursor: 'pointer', transition: 'background 0.2s',
                        display: 'flex', flexDirection: 'column', gap: '5px'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#f5f5f5'}
                      onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'white'}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                        <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>FROM: {fromObj.text}</div>
                        <div style={{ 
                          fontSize: '0.85em', color: '#7f8c8d', 
                          backgroundColor: '#ecf0f1', padding: '2px 8px', borderRadius: '3px',
                          fontWeight: '500'
                        }}>
                          Test Case #{binomio.testCaseId}
                        </div>
                      </div>
                      <div style={{ fontFamily: 'monospace', fontSize: '0.9em', color: '#666', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        TO: {toObj.text.substring(0, 100)}...
                      </div>
                    </div>
                  );
                })
              )}
            </div>
            
            <button 
              onClick={() => setShowForceMatchModal(false)}
              style={{
                marginTop: '15px', padding: '8px 16px', border: 'none',
                borderRadius: '4px', backgroundColor: '#e74c3c', color: 'white', cursor: 'pointer'
              }}
            >
              Annulla
            </button>
          </div>
        </div>
      )}

      {connectionContextMenu && (
        <div
          ref={connectionContextMenuRef}
          className="context-menu connection-context-menu"
          style={{
            position: 'absolute',
            left: `${connectionContextMenu.x}px`,
            top: `${connectionContextMenu.y}px`,
            zIndex: 10001
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button 
            className="context-menu-item delete-item"
            onClick={() => handleDeleteConnection(connectionContextMenu.connectionId)}
          >
            🗑️ Cancella binomio
          </button>
        </div>
      )}

      {isExpanded && (
        <div 
          ref={gherkinBlockContentRef}
          className="gherkin-block-content"
        >
          <div className="construction-panel">
            <div className="chat-section">
              <h4>💬 Dialoga con l'AI</h4>
              <p className="help-text">
                L'AI ha già analizzato il contesto. Chiedi come automatizzare questo step.
                <br />
                <small>Esempio: "Come posso automatizzare il click su Action/Copy?" o "Quale selettore usare per questo elemento?"</small>
              </p>
              
              <div className="messages-container">
                {state.messages.length === 0 ? (
                  <div className="empty-state">
                    <p>💡 Inizia a chiedere all'AI come automatizzare questo step</p>
                    <p className="suggestion-examples">
                      Suggerimenti:
                      <br />• "Come automatizzare questo step?"
                      <br />• "Quale selettore Cypress dovrei usare?"
                      <br />• "Genera il codice Cypress per {text.substring(0, 50)}..."
                    </p>
                  </div>
                ) : (
                  <div className="messages">
                    {state.messages.map((msg, i) => (
                      <div key={i} className={`message ${msg.role}`}>
                        <div className="message-header">
                          <strong>{msg.role === 'user' ? '👤 Tu' : msg.role === 'error' ? '❌ Errore' : '🤖 AI'}</strong>
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </div>
                    ))}
                    {state.loading && (
                      <div className="message assistant">
                        <div className="message-header">
                          <strong>🤖 AI</strong>
                        </div>
                        <div className="message-content">
                          <div className="loading-dots">Pensando</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className={`prompt-input-container ${editingToObject ? 'editing-mode' : ''}`}>
                {editingToObject && (
                  <div className="editing-mode-badge" style={{
                    position: 'absolute',
                    top: '-30px',
                    left: '0',
                    backgroundColor: '#ff9800',
                    color: 'white',
                    padding: '4px 12px',
                    borderRadius: '4px 4px 0 0',
                    fontSize: '12px',
                    fontWeight: 'bold',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <span>✏️ Modifica Oggetto</span>
                  </div>
                )}
                <textarea
                  className={`prompt-input ${editingToObject ? 'editing-active' : ''}`}
                  value={state.prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={editingToObject ? "Descrivi come modificare l'oggetto selezionato... (l'AI aggiornerà il codice)" : "Scrivi qui il tuo prompt per l'AI... (Ctrl+Enter per inviare)"}
                  disabled={state.loading}
                  rows="3"
                  style={editingToObject ? { borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.05)' } : {}}
                />
                <div className="send-buttons-group">
                  <button
                    className="send-button"
                    onClick={handleSendNormal}
                    disabled={state.loading || !state.prompt.trim()}
                  >
                    {state.loading ? '⏳ Invio...' : '📤 Invia'}
                  </button>
                  {onGlobalComplete && state.messages && state.messages.length > 0 && (
                    <button
                      className="global-complete-button"
                      onClick={onGlobalComplete}
                      disabled={state.loading}
                      style={{
                        padding: '15px 20px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: state.loading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        marginLeft: '8px',
                        transition: 'background 0.3s'
                      }}
                      title="Global Complete: Applica questa conversazione e codice ad altri box GWT simili"
                      onMouseEnter={(e) => {
                        if (!state.loading) e.target.style.backgroundColor = '#218838';
                      }}
                      onMouseLeave={(e) => {
                        if (!state.loading) e.target.style.backgroundColor = '#28a745';
                      }}
                    >
                      ✨ Global Complete
                    </button>
                  )}
                  <div className="wide-reasoning-dropdown-container" ref={dropdownRef}>
                    <button
                      className="wide-reasoning-arrow-button"
                      onClick={() => setShowWideReasoningMenu(!showWideReasoningMenu)}
                      disabled={state.loading || !state.prompt.trim()}
                      title="Opzioni di invio avanzate"
                    >
                      ▼
                    </button>
                    {showWideReasoningMenu && (
                      <div className="wide-reasoning-menu">
                        <button
                          className="wide-reasoning-menu-item"
                          onClick={handleSendWideReasoning}
                          disabled={state.loading}
                        >
                          🔍 Wide Reasoning to other Tests
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="code-section">
              <div className="code-section-header">
                <h4>📝 Codice Cypress Generato</h4>
              </div>
              <div 
                ref={codeDisplayRef}
                className="code-display"
                style={{ position: 'relative' }}
              >
                <div
                  ref={codeEditorRef}
                  className="code-editor-stack"
                  style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: '12px' }}
                >
                  {codeEditors.map((editor, idx) => {
                    const lineHeight = 18;
                    const paddingY = 8;
                    const codeText = editor.code || '';
                    const isEmpty = codeText.trim().length === 0;
                    
                    // a) Vuoto: esattamente 4 righe
                    // b) Con codice: esattamente le righe del codice estratto (trim righe vuote superiori e inferiori)
                    // c) Durante modifica: si adatta dinamicamente
                    let lineCount;
                    if (isEmpty) {
                      lineCount = 4; // Editor vuoto: 4 righe
                    } else {
                      const rawLines = codeText.split('\n');
                      // Rimuovi righe vuote finali (trim inferiore)
                      let trimmedLines = [...rawLines];
                      while (trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() === '') {
                        trimmedLines.pop();
                      }
                      // Rimuovi righe vuote iniziali (trim superiore)
                      while (trimmedLines.length > 0 && trimmedLines[0].trim() === '') {
                        trimmedLines.shift();
                      }
                      // Se il testo finisce con \n e l'ultima riga non è vuota, aggiungi una riga per il newline finale
                      const extraLine = codeText.endsWith('\n') && trimmedLines.length > 0 && trimmedLines[trimmedLines.length - 1].trim() !== '' ? 1 : 0;
                      const baseLines = Math.max(1, trimmedLines.length + extraLine);
                      // Correzione: aggiungi una riga vuota di margine dopo l'ultima linea per evitare troncamenti visivi
                      lineCount = baseLines + 1;
                    }
                    
                    const exactHeight = lineCount * lineHeight + paddingY * 2;

                    return (
                      <div
                        key={editor.id}
                        ref={(el) => {
                          if (el) {
                            codeEditorRefs.current[editor.id] = el;
                          } else {
                            delete codeEditorRefs.current[editor.id];
                          }
                        }}
                        className={`code-editor-wrapper ${editor.type === 'object' ? 'code-editor-object' : 'code-editor-normal'}`}
                        style={{ position: 'relative' }}
                        onContextMenu={(e) => handleCodeContextMenu(e, editor.id)}
                      >
                        <div className="code-editor-title" style={{ marginBottom: '6px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                          <span>Editor Nero {idx + 1}{editor.type === 'object' ? ' (oggetto)' : ''}</span>
                          {caretMap[editor.id] && (
                            <span style={{ fontSize: '12px', color: '#9aa0a6' }}>
                              Posizione: riga {caretMap[editor.id].line}, col {caretMap[editor.id].col}
                            </span>
                          )}
                        </div>
                        <Editor
                          value={editor.code}
                          onValueChange={(code) => handleSegmentChange(editor.id, code)}
                          highlight={(code) => highlight(code, languages.javascript, 'javascript')}
                          padding={0}
                          className="code-editor compact-editor"
                          placeholder="Scrivi o modifica il codice Cypress qui..."
                          style={{
                            height: `${exactHeight}px`,
                            minHeight: `${exactHeight}px`,
                            outline: 'none',
                            lineHeight: `${lineHeight}px`,
                            overflow: 'hidden'
                          }}
                          onFocus={() => handleEditorFocus(editor.id)}
                          onBlur={(e) => handleEditorBlur(editor.id, e)}
                          onMouseUp={() => handleCodeSelection(editor.id)}
                          onKeyUp={() => handleCodeSelection(editor.id)}
                        />
                        {activeEditorId === editor.id && caretMap[editor.id] && caretPixelMap[editor.id] && (
                          <div
                            className="caret-indicator"
                            style={{
                              position: 'absolute',
                              left: `${caretPixelMap[editor.id].left}px`,
                              top: `${caretPixelMap[editor.id].top}px`,
                              width: 8,
                              height: 8,
                              borderRadius: '50%',
                              backgroundColor: '#fff',
                              boxShadow: '0 0 4px rgba(0,0,0,0.35)',
                              opacity: 0.9,
                              pointerEvents: 'none',
                              transform: 'translate(-4px, -4px)',
                              zIndex: 10
                            }}
                            title={`Ultima posizione: riga ${caretMap[editor.id].line}, col ${caretMap[editor.id].col}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                {state.code && state.code.trim() && (
                  <div className="code-actions">
                    <button
                      className="copy-code-button"
                      onClick={() => {
                        navigator.clipboard.writeText(state.code);
                        alert('Codice copiato negli appunti!');
                      }}
                    >
                      📋 Copia Codice
                    </button>
                    {onOpenRunner && (
                      <button
                        className="test-runner-button-inline"
                        onClick={() => onOpenRunner()}
                        title="Apri Test Runner per testare il test completo (Given + When + Then)"
                      >
                        🧪 Testa Test Completo
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modale di propagazione modifiche oggetto TO */}
      {showPropagationModal && (
        <div 
          className="modal-overlay" 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 10003,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <div 
            className="modal-content propagation-modal" 
            style={{
              backgroundColor: 'white',
              padding: '25px',
              borderRadius: '12px',
              maxWidth: '500px',
              width: '90%',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 15px 0', color: '#333', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '24px' }}>🔄</span>
              Propagazione Modifica
            </h3>
            
            <p style={{ color: '#666', marginBottom: '20px', lineHeight: '1.6' }}>
              Hai modificato il testo dell'oggetto TO.
              <br /><br />
              <strong>Testo originale:</strong>
              <br />
              <code style={{ 
                display: 'block', 
                padding: '10px', 
                backgroundColor: '#f5f5f5', 
                borderRadius: '4px', 
                fontSize: '12px',
                marginTop: '5px',
                maxHeight: '80px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {showPropagationModal.originalText?.substring(0, 150)}
                {showPropagationModal.originalText?.length > 150 ? '...' : ''}
              </code>
              <br />
              <strong>Nuovo testo:</strong>
              <br />
              <code style={{ 
                display: 'block', 
                padding: '10px', 
                backgroundColor: '#e8f5e9', 
                borderRadius: '4px', 
                fontSize: '12px',
                marginTop: '5px',
                maxHeight: '80px',
                overflow: 'auto',
                whiteSpace: 'pre-wrap'
              }}>
                {showPropagationModal.newText?.substring(0, 150)}
                {showPropagationModal.newText?.length > 150 ? '...' : ''}
              </code>
            </p>
            
            <p style={{ color: '#555', marginBottom: '20px', fontWeight: '500' }}>
              Vuoi propagare questa modifica a tutti gli oggetti TO con lo stesso testo originale?
            </p>
            
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                onClick={handlePropagationAbort}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #6c757d',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#6c757d',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
                title="Annulla le modifiche e ripristina il testo originale"
              >
                🚫 Aborta operazione
              </button>
              <button
                onClick={() => handlePropagationConfirm(false)}
                style={{
                  padding: '10px 20px',
                  border: '1px solid #dc3545',
                  borderRadius: '6px',
                  backgroundColor: 'white',
                  color: '#dc3545',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
                title="L'oggetto TO perderà la sua cornice e la connessione con l'oggetto FROM"
              >
                ❌ No, Sciogli Oggetto
              </button>
              <button
                onClick={() => handlePropagationConfirm(true)}
                style={{
                  padding: '10px 20px',
                  border: 'none',
                  borderRadius: '6px',
                  backgroundColor: '#28a745',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '14px'
                }}
              >
                ✅ Sì, Propaga a Tutti
              </button>
            </div>
            
            <p style={{ 
              marginTop: '15px', 
              fontSize: '12px', 
              color: '#888',
              borderTop: '1px solid #eee',
              paddingTop: '15px'
            }}>
              <strong>Nota:</strong> Se scegli "No", questo oggetto TO perderà il suo status: 
              la cornice arancione e la freccia di connessione verranno rimosse.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

