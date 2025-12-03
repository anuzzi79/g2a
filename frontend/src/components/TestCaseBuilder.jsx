import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs';
import 'prismjs/components/prism-javascript';
import 'prismjs/themes/prism-tomorrow.css';
import { api } from '../services/api';
import { CypressRunner } from './CypressRunner';
import '../styles/TestCaseBuilder.css';
import '@tensorflow/tfjs';

/**
 * Componente per costruire un test case con AI
 */
export function TestCaseBuilder({ testCase, context, onBack, onLogEvent, onUpdateTestCase, currentSession }) {
  const [allObjects, setAllObjects] = useState([]); // Raccoglie tutti gli oggetti da tutti i blocchi GWT
  
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
  const [isGlobalAutocompleteRunning, setIsGlobalAutocompleteRunning] = useState(false);
  const [globalAutocompleteProgress, setGlobalAutocompleteProgress] = useState(null);
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

  // Salva lo stato in localStorage quando cambia (ma non durante il caricamento)
  useEffect(() => {
    if (!testCase?.id || !testStateStorageKey || isLoadingState || !hasLoadedState) {
      if (isLoadingState) {
        console.log('Salvataggio saltato: caricamento in corso');
      }
      if (!hasLoadedState) {
        console.log('Salvataggio saltato: stato non ancora caricato');
      }
      return;
    }

    // Verifica se c'è effettivamente qualcosa da salvare
    const hasContent = 
      blockStates.given.code || 
      blockStates.when.code || 
      blockStates.then.code ||
      blockStates.given.messages.length > 0 ||
      blockStates.when.messages.length > 0 ||
      blockStates.then.messages.length > 0;

    if (!hasContent) {
      console.log('Salvataggio saltato: nessun contenuto da salvare');
      return;
    }

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
  }, [blockStates.given.code, blockStates.given.messages, blockStates.given.prompt,
      blockStates.when.code, blockStates.when.messages, blockStates.when.prompt,
      blockStates.then.code, blockStates.then.messages, blockStates.then.prompt,
      expandedBlocks, testCase?.id, testStateStorageKey, isLoadingState, hasLoadedState]);

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
  };

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

  // Funzione principale Global Autocomplete
  const handleGlobalAutocomplete = async () => {
    if (!currentSession) {
      onLogEvent?.('error', 'Nessuna sessione disponibile');
      return;
    }

    setIsGlobalAutocompleteRunning(true);
    setGlobalAutocompleteProgress({ current: 0, total: 0, message: 'Inizializzazione...' });
    
    try {
      onLogEvent?.('info', '🚀 Avvio Global Autocomplete...');
      
      // 1. Carica tutti i test cases della sessione con i loro stati
      const allTestCasesWithState = await loadAllTestCasesWithState(currentSession.id);
      
      // 2. Separa test cases codificati da non codificati
      const { coded, uncoded } = categorizeTestCases(allTestCasesWithState);
      
      if (coded.length === 0) {
        onLogEvent?.('warning', 'Nessun test case già codificato trovato. Global Autocomplete richiede almeno un test case con codice.');
        return;
      }
      
      if (uncoded.length === 0) {
        onLogEvent?.('info', 'Tutti i test cases sono già codificati!');
        return;
      }
      
      onLogEvent?.('info', `Trovati ${coded.length} test cases codificati e ${uncoded.length} con box vuoti`);
      
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
      
      onLogEvent?.('success', `✅ Global Autocomplete completato! ${completedCount} test cases aggiornati.`);
      
      // 5. Forza refresh della lista (se siamo nella vista lista)
      if (onUpdateTestCase) {
        // Notifica il componente padre per aggiornare la lista
        window.dispatchEvent(new CustomEvent('global-autocomplete-completed', { 
          detail: { sessionId: currentSession.id, completedFields } 
        }));
      }
      
    } catch (error) {
      console.error('Errore Global Autocomplete:', error);
      onLogEvent?.('error', `Errore Global Autocomplete: ${error.message}`);
    } finally {
      setIsGlobalAutocompleteRunning(false);
      setGlobalAutocompleteProgress(null);
    }
  };

  // ========== END GLOBAL AUTOCOMPLETE FUNCTIONS ==========

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

  return (
    <div className="test-case-builder">
      <div className="builder-header">
        <button onClick={onBack} className="back-button">← Torna alla lista</button>
        <h2>Costruzione Test Case #{testCase.id}</h2>
        {/* Aggiungi pulsanti per salvare e testare il codice completo */}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Bottone Global Autocomplete */}
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
            className="upload-test-button"
            onClick={handleUploadTest}
            style={{ 
              padding: '10px 20px', 
              backgroundColor: '#ffc107', 
              color: '#212529', 
              border: 'none', 
              borderRadius: '5px', 
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: 'bold'
            }}
            title="Carica un file Cypress e estrai le fasi Given/When/Then"
          >
            📤 Upload Test
          </button>
          {buildCompleteTestCode() && (
            <button
              className="save-button"
              onClick={handleSaveFile}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#17a2b8', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
              title="Salva il test completo nel file Cypress"
            >
              💾 Salva File
            </button>
          )}
          {buildCompleteTestCode() && (
            <button
              className="test-complete-button"
              onClick={handleOpenRunner}
              style={{ 
                padding: '10px 20px', 
                backgroundColor: '#4CAF50', 
                color: 'white', 
                border: 'none', 
                borderRadius: '5px', 
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: 'bold'
              }}
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
        onObjectsChange={(objects) => {
          setAllObjects(prev => {
            const filtered = prev.filter(obj => !obj.id.startsWith('given-'));
            return [...filtered, ...objects.map(obj => ({ ...obj, id: `given-${obj.id || Date.now()}` }))];
          });
        }}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('given')}
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
        onObjectsChange={(objects) => {
          setAllObjects(prev => {
            const filtered = prev.filter(obj => !obj.id.startsWith('when-'));
            return [...filtered, ...objects.map(obj => ({ ...obj, id: `when-${obj.id || Date.now()}` }))];
          });
        }}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('when')}
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
        onObjectsChange={(objects) => {
          setAllObjects(prev => {
            const filtered = prev.filter(obj => !obj.id.startsWith('then-'));
            return [...filtered, ...objects.map(obj => ({ ...obj, id: `then-${obj.id || Date.now()}` }))];
          });
        }}
        context={effectiveContext}
        onOpenRunner={handleOpenRunner}
        onGlobalComplete={() => handleGlobalComplete('then')}
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
function GherkinBlock({ type, label, text, isExpanded, onToggle, state, onPromptChange, onSendPrompt, onCodeChange, onObjectsChange, context, onOpenRunner, onGlobalComplete }) {
  const [showWideReasoningMenu, setShowWideReasoningMenu] = useState(false);
  const [contextMenu, setContextMenu] = useState(null);
  const [selectedText, setSelectedText] = useState('');
  const [objects, setObjects] = useState([]); // Array di oggetti: { text: string, startIndex: number, endIndex: number, location: 'header' | 'content' }
  const [headerObjectPositions, setHeaderObjectPositions] = useState([]); // Posizioni bordi oggetti nell'header del Layer EC
  const [contentObjectPositions, setContentObjectPositions] = useState([]); // Posizioni bordi oggetti nel contenuto del Layer EC
  const [codeSelection, setCodeSelection] = useState({ start: null, end: null, text: '' }); // Selezione codice
  const [objectContextMenu, setObjectContextMenu] = useState(null); // Menu contestuale per oggetti
  const [connections, setConnections] = useState([]); // Array di connessioni: { from: objectId, to: objectId, fromPoint: {x, y}, toPoint: {x, y} }
  const [connectingFrom, setConnectingFrom] = useState(null); // ID oggetto da cui si sta creando la connessione
  const [connectingFromPoint, setConnectingFromPoint] = useState(null); // Punto relativo (0-1) sul perimetro di partenza
  const [connectingMousePos, setConnectingMousePos] = useState(null); // Posizione mouse durante connessione: { x, y }
  const [connectionHoverTarget, setConnectionHoverTarget] = useState(null); // ID oggetto sotto il mouse durante la connessione
  const [draggingConnectionPoint, setDraggingConnectionPoint] = useState(null); // { connectionId, pointType: 'from' | 'to' }
  const dropdownRef = useRef(null);
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

  // Notifica il componente padre quando gli oggetti cambiano
  useEffect(() => {
    onObjectsChange?.(objects);
  }, [objects, onObjectsChange]);

  const connectionHoverTargetRef = useRef(null);
  useEffect(() => {
    connectionHoverTargetRef.current = connectionHoverTarget;
  }, [connectionHoverTarget]);

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
        if (
          mouseX >= pos.left && mouseX <= pos.left + pos.width &&
          mouseY >= pos.top && mouseY <= pos.top + pos.height &&
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
    const rectTop = objPos.top;
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
      const isInsideTarget = contextMenu?.target === 'code' ? clickedInsideCode : clickedInsideText;
      
      if (contextMenu && !isInsideTarget && !clickedInsideContextMenu) {
        setContextMenu(null);
      }
      
      if (objectContextMenu && !clickedInsideObjectMenu) {
        setObjectContextMenu(null);
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
    onSendPrompt(state.prompt, false);
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

  const handleCodeSelection = () => {
    if (!codeEditorRef.current) {
      setCodeSelection({ start: null, end: null, text: '' });
      return;
    }

    const textarea = codeEditorRef.current.querySelector('textarea');
    if (!textarea) {
      setCodeSelection({ start: null, end: null, text: '' });
      return;
    }

    const { selectionStart, selectionEnd, value } = textarea;
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionEnd > selectionStart) {
      setCodeSelection({
        start: selectionStart,
        end: selectionEnd,
        text: value.substring(selectionStart, selectionEnd)
      });
    } else {
      setCodeSelection({ start: null, end: null, text: '' });
    }
  };

  const handleCodeContextMenu = (e) => {
    if (!codeEditorRef.current?.contains(e.target)) {
      return;
    }

    const textarea = codeEditorRef.current.querySelector('textarea');
    if (!textarea) {
      return;
    }

    const { selectionStart, selectionEnd, value } = textarea;
    if (typeof selectionStart === 'number' && typeof selectionEnd === 'number' && selectionEnd > selectionStart) {
      setCodeSelection({
        start: selectionStart,
        end: selectionEnd,
        text: value.substring(selectionStart, selectionEnd)
      });
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: 'code'
      });
      e.preventDefault();
      e.stopPropagation();
    }
  };

  const handleTransformToObject = () => {
    if (contextMenu?.target === 'code') {
      handleTransformCodeToObject();
    } else {
      handleTransformGherkinToObject();
    }
  };

  const handleTransformGherkinToObject = () => {
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
    
    const newObject = {
      text: selectedTextTrimmed,
      startIndex: startIndex,
      endIndex: endIndex,
      location: 'header'
    };
    
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

  const handleTransformCodeToObject = () => {
    if (!codeSelection.text || codeSelection.start === null || codeSelection.end === null) {
      alert('Seleziona una porzione di codice prima di trasformarla in oggetto.');
      setContextMenu(null);
      return;
    }

    const start = codeSelection.start;
    const end = codeSelection.end;
    
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
      setCodeSelection({ start: null, end: null, text: '' });
      return;
    }
    
    const newObject = {
      text: codeSelection.text,
      startIndex: start,
      endIndex: end,
      location: 'content'
    };
    
    setObjects(prev => {
      const updated = [...prev, newObject].sort((a, b) => a.startIndex - b.startIndex);
      console.log('Oggetti aggiornati:', updated);
      onObjectsChange?.(updated);
      return updated;
    });
    
    console.log('Oggetto codice creato con successo:', newObject);
    
    setContextMenu(null);
    setCodeSelection({ start: null, end: null, text: '' });
  };

  const handleDeleteObject = (objectId) => {
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
    setObjectContextMenu(null);
    console.log('Oggetto eliminato:', objectId);
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

  const handleObjectClickForConnection = (targetObjectId, e) => {
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

      console.log('handleObjectClickForConnection:', { connectingFrom, targetObjectId, fromObj, toObj });

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
      } else {
        console.warn('Oggetti non trovati per la connessione');
      }
    }
    setConnectingFrom(null);
    setConnectingFromPoint(null);
    setConnectingMousePos(null);
    setConnectionHoverTarget(null);
  };

  const getConnectionPointPosition = useCallback((objectId, point) => {
    const allPositions = [...headerObjectPositions, ...contentObjectPositions];
    const objPos = allPositions.find(pos => pos.id === objectId);
    if (!objPos) return { x: 0, y: 0 };

    // point è relativo (0-1) rispetto alle dimensioni dell'oggetto
    const x = objPos.left + (point.x * objPos.width);
    const y = objPos.top + (point.y * objPos.height);
    
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
    
    if (contentObjects.length === 0 || !isExpanded || !gherkinBlockContentRef.current || !codeEditorRef.current || !state.code) {
      setContentObjectPositions([]);
      return;
    }

    const calculateContentObjectPositions = () => {
      const textarea = codeEditorRef.current.querySelector('textarea');
      const codeDisplay = codeDisplayRef.current;
      if (!textarea || !codeDisplay) return;

      const codeText = state.code;
      const sortedObjects = [...contentObjects].sort((a, b) => a.startIndex - b.startIndex);
      
      const positions = sortedObjects.map((obj, idx) => {
        try {
          // Calcola le righe del codice selezionato in modo più preciso
          const beforeSelection = codeText.substring(0, obj.startIndex);
          const selection = codeText.substring(obj.startIndex, obj.endIndex);
          
          // Trova la prima riga: conta i newline prima della selezione
          const linesBefore = beforeSelection.split('\n');
          const startLine = Math.max(0, linesBefore.length - 1); // Indice della prima riga (0-indexed)
          
          // Trova l'ultima riga: rimuovi eventuali newline finali dalla selezione
          let cleanSelection = selection;
          if (cleanSelection.endsWith('\n')) {
            cleanSelection = cleanSelection.slice(0, -1);
          }
          const selectionLines = cleanSelection.split('\n');
          const numLinesInSelection = selectionLines.length;
          const endLine = startLine + numLinesInSelection - 1; // Indice dell'ultima riga
          
          // Calcola la posizione usando gli stili del textarea
          const textareaStyles = window.getComputedStyle(textarea);
          const fontSize = parseFloat(textareaStyles.fontSize) || 13;
          const lineHeight = parseFloat(textareaStyles.lineHeight) || (fontSize * 1.6);
          const padding = parseFloat(textareaStyles.paddingTop) || 20;
          
          // Top: allineato esattamente alla prima riga della selezione
          const top = padding + (startLine * lineHeight);
          
          // Height: da prima riga a ultima riga inclusa
          const height = numLinesInSelection * lineHeight;
          
          // Larghezza fissa con offset laterali: leggermente più corta del box del codice
          const codeDisplayRect = codeDisplay.getBoundingClientRect();
          const horizontalOffset = 10; // Offset di 10px da entrambi i lati
          const width = Math.max(codeDisplayRect.width - (horizontalOffset * 2), 100);
          const left = horizontalOffset;
          
          // Calcola posizione relativa al contenuto del Layer EC
          const contentRect = gherkinBlockContentRef.current.getBoundingClientRect();
          const codeSection = codeDisplay.closest('.code-section');
          if (!codeSection) return null;
          
          const codeSectionRect = codeSection.getBoundingClientRect();
          const textareaRect = textarea.getBoundingClientRect();
          
          // Posizione relativa al contenuto del Layer EC
          // Top: posizione del textarea + top calcolato - top del contenuto
          const relativeTop = (textareaRect.top - contentRect.top) + top;
          const relativeLeft = (textareaRect.left - contentRect.left) + left;
          
          console.log(`Oggetto ${idx}:`, {
            startIndex: obj.startIndex,
            endIndex: obj.endIndex,
            startLine,
            endLine,
            numLines: numLinesInSelection,
            top,
            height,
            relativeTop,
            relativeLeft
          });
          
          return {
            id: `content-obj-${idx}`,
            left: relativeLeft,
            top: relativeTop,
            width: width,
            height: height,
            text: obj.text.substring(0, 50) + (obj.text.length > 50 ? '...' : ''),
            startLine: startLine,
            endLine: endLine,
            numLines: numLinesInSelection
          };
        } catch (error) {
          console.warn('Errore calcolo posizione oggetto codice:', error, obj);
        }
        
        return null;
      }).filter(pos => pos !== null);

      setContentObjectPositions(positions);
    };

    const timeoutId = setTimeout(calculateContentObjectPositions, 100);
    
    const resizeObserver = new ResizeObserver(() => {
      calculateContentObjectPositions();
    });
    
    if (codeEditorRef.current) {
      resizeObserver.observe(codeEditorRef.current);
    }
    if (codeDisplayRef.current) {
      resizeObserver.observe(codeDisplayRef.current);
    }
    if (gherkinBlockContentRef.current) {
      resizeObserver.observe(gherkinBlockContentRef.current);
    }
    
    const mutationObserver = new MutationObserver(() => {
      calculateContentObjectPositions();
    });
    
    if (codeEditorRef.current) {
      mutationObserver.observe(codeEditorRef.current, {
        childList: true,
        subtree: true,
        characterData: true
      });
    }
    
    const handleUpdate = () => calculateContentObjectPositions();
    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);
    
    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
    };
  }, [objects, isExpanded, state.code]);

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
                  <line
                    x1={fromPoint.x}
                    y1={fromPoint.y}
                    x2={toPoint.x}
                    y2={toPoint.y}
                    stroke="#ff9800"
                    strokeWidth="3"
                    strokeDasharray="5,5"
                    markerEnd="url(#arrowhead)"
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
                      e.stopPropagation();
                      setDraggingConnectionPoint({ connectionId: conn.id, pointType: 'from' });
                    }}
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
                      e.stopPropagation();
                      setDraggingConnectionPoint({ connectionId: conn.id, pointType: 'to' });
                    }}
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
              {contentObjectPositions.map((pos) => (
                <div
                  key={pos.id}
                    className="gherkin-object-border code-object-border"
                    style={{
                      position: 'absolute',
                      left: `${pos.left}px`,
                      top: `${pos.top}px`,
                      width: `${pos.width}px`,
                      height: `${pos.height}px`,
                      border: '4px dashed #ff9800',
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
                        console.log('Oggetto contenuto cliccato:', pos.text);
                      }
                    }}
                  />
                </div>
              ))}
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

              <div className="prompt-input-container">
                <textarea
                  className="prompt-input"
                  value={state.prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Scrivi qui il tuo prompt per l'AI... (Ctrl+Enter per inviare)"
                  disabled={state.loading}
                  rows="3"
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
                {state.code && state.code.trim() && onOpenRunner && (
                  <button
                    className="test-runner-button"
                    onClick={() => onOpenRunner()}
                    title="Apri Test Runner per testare il test completo (Given + When + Then)"
                  >
                    🧪 Testa Test Completo
                  </button>
                )}
              </div>
              {state.code ? (
                <div 
                  ref={codeDisplayRef}
                  className="code-display"
                  style={{ position: 'relative' }}
                >
                  <div
                    ref={codeEditorRef}
                    onMouseUp={handleCodeSelection}
                    onKeyUp={handleCodeSelection}
                    onContextMenu={handleCodeContextMenu}
                    style={{ position: 'relative' }}
                  >
                    <Editor
                      value={state.code}
                      onValueChange={(code) => onCodeChange?.(code)}
                      highlight={(code) => highlight(code, languages.javascript, 'javascript')}
                      padding={20}
                      className="code-editor"
                      placeholder="Scrivi o modifica il codice Cypress qui..."
                      style={{
                        minHeight: '400px',
                        outline: 'none'
                      }}
                    />
                  </div>
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
                        ▶️ Testa Test Completo
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="no-code">
                  <p>Il codice Cypress apparirà qui dopo che l'AI lo genererà.</p>
                  <p className="hint">💡 Chiedi all'AI di generare il codice Cypress per questo step</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

