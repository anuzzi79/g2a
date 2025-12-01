import { useState, useEffect, useMemo, useRef } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../services/api';
import { CypressRunner } from './CypressRunner';
import '../styles/TestCaseBuilder.css';

/**
 * Componente per costruire un test case con AI
 */
export function TestCaseBuilder({ testCase, context, onBack, onLogEvent, onUpdateTestCase }) {
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

  const [showRunner, setShowRunner] = useState(false);
  const [runnerCode, setRunnerCode] = useState('');
  const [targetFilePath, setTargetFilePath] = useState('');
  const [isLoadingState, setIsLoadingState] = useState(false);
  const [hasLoadedState, setHasLoadedState] = useState(false);
  const testFileStorageKey = useMemo(
    () => (testCase ? `g2a_test_file_${testCase.id}` : null),
    [testCase?.id]
  );

  const testStateStorageKey = useMemo(
    () => (testCase ? `g2a_test_state_${testCase.id}` : null),
    [testCase?.id]
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
    
    // Se non c'è un percorso salvato, usa il default
    if (!storedPath && !testCase.automation) {
      const defaultDir = 'C:\\Users\\Antonio Nuzzi\\g2a\\test';
      const defaultFileName = `test_case${testCase.id}.cy.js`;
      const defaultPath = `${defaultDir}\\${defaultFileName}`;
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
  }, [testCase, testFileStorageKey]);

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

    // Costruisci il test completo
    const testName = `Test Case #${testCase.id}`;
    const testDescription = `${testCase.given} | ${testCase.when} | ${testCase.then}`.substring(0, 100);
    
    let completeCode = `describe('${testName}', () => {\n`;
    completeCode += `  it('${testDescription}', () => {\n`;

    // Aggiungi fase GIVEN con log e commento
    if (givenBody) {
      completeCode += `    // ===== GIVEN PHASE =====\n`;
      completeCode += `    cy.log('🔵 GIVEN: ${testCase.given}');\n`;
      // Il codice è già pulito da extractBody, ma assicuriamoci che non ci siano duplicati
      const cleanGiven = givenBody
        .replace(/\/\/\s*=====\s*GIVEN\s*PHASE\s*=====/gi, '')
        .replace(/cy\.log\(['"]🔵\s*GIVEN:.*?['"]\);/g, '')
        .trim();
      if (cleanGiven) {
        // Indenta ogni riga del codice
        const indentedGiven = cleanGiven.split('\n').map(line => `    ${line}`).join('\n');
        completeCode += `${indentedGiven}\n\n`;
      }
    }

    // Aggiungi fase WHEN con log e commento
    if (whenBody) {
      completeCode += `    // ===== WHEN PHASE =====\n`;
      completeCode += `    cy.log('🟡 WHEN: ${testCase.when}');\n`;
      const cleanWhen = whenBody
        .replace(/\/\/\s*=====\s*WHEN\s*PHASE\s*=====/gi, '')
        .replace(/cy\.log\(['"]🟡\s*WHEN:.*?['"]\);/g, '')
        // Rimuovi eventuali cy.visit() residui (la navigazione è già stata fatta in GIVEN)
        .split('\n')
        .filter(line => !line.trim().includes('cy.visit(') || line.trim().startsWith('//'))
        .join('\n')
        .trim();
      if (cleanWhen) {
        // Indenta ogni riga del codice
        const indentedWhen = cleanWhen.split('\n').map(line => `    ${line}`).join('\n');
        completeCode += `${indentedWhen}\n\n`;
      }
    }

    // Aggiungi fase THEN con log e commento
    if (thenBody) {
      completeCode += `    // ===== THEN PHASE =====\n`;
      completeCode += `    cy.log('🟢 THEN: ${testCase.then}');\n`;
      const cleanThen = thenBody
        .replace(/\/\/\s*=====\s*THEN\s*PHASE\s*=====/gi, '')
        .replace(/cy\.log\(['"]🟢\s*THEN:.*?['"]\);/g, '')
        // Rimuovi eventuali cy.visit() residui (la navigazione è già stata fatta in GIVEN)
        .split('\n')
        .filter(line => !line.trim().includes('cy.visit(') || line.trim().startsWith('//'))
        .join('\n')
        .trim();
      if (cleanThen) {
        // Indenta ogni riga del codice
        const indentedThen = cleanThen.split('\n').map(line => `    ${line}`).join('\n');
        completeCode += `${indentedThen}\n`;
      }
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
  const findSimilarTestCases = (currentBlockText, blockType) => {
    const allOtherTestCases = getAllOtherTestCases();
    const similarCases = [];
    
    // Funzione migliorata di similarità basata su parole comuni
    const calculateSimilarity = (text1, text2) => {
      if (!text1 || !text2) return 0;
      const normalize = (text) => {
        return text.toLowerCase()
          .replace(/[^\w\s]/g, ' ') // Sostituisci punteggiatura con spazi
          .split(/\s+/)
          .filter(w => w.length > 2); // Filtra parole molto corte
      };
      
      const words1 = normalize(text1);
      const words2 = normalize(text2);
      
      if (words1.length === 0 || words2.length === 0) return 0;
      
      // Calcola similarità usando Jaccard similarity
      const set1 = new Set(words1);
      const set2 = new Set(words2);
      
      const intersection = [...set1].filter(x => set2.has(x)).length;
      const union = new Set([...set1, ...set2]).size;
      
      if (union === 0) return 0;
      return intersection / union;
    };

    allOtherTestCases.forEach(tc => {
      let bestSimilarity = 0;
      let bestBlockText = '';
      let bestBlockCode = '';
      let bestBlockType = blockType;
      let bestFullCode = '';

      // Cerca similarità nella fase corrente
      const currentPhaseText = tc.testCaseData?.[blockType] || '';
      const currentPhaseCode = tc.blockStates?.[blockType]?.code || '';
      
      if (currentPhaseText && currentPhaseCode && currentPhaseCode.trim()) {
        const similarity = calculateSimilarity(currentBlockText, currentPhaseText);
        if (similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestBlockText = currentPhaseText;
          bestBlockCode = currentPhaseCode;
          bestBlockType = blockType;
          bestFullCode = currentPhaseCode;
        }
      }

      // Cerca anche in altre fasi (potrebbero avere codice simile)
      const phases = ['given', 'when', 'then'];
      phases.forEach(phase => {
        if (phase === blockType) return; // Già controllato sopra
        
        const phaseText = tc.testCaseData?.[phase] || '';
        const phaseCode = tc.blockStates?.[phase]?.code || '';
        
        if (phaseText && phaseCode && phaseCode.trim()) {
          const similarity = calculateSimilarity(currentBlockText, phaseText);
          // Per altre fasi, richiediamo similarità leggermente più alta
          if (similarity > bestSimilarity * 1.1) {
            bestSimilarity = similarity;
            bestBlockText = phaseText;
            bestBlockCode = phaseCode;
            bestBlockType = phase;
            bestFullCode = phaseCode;
          }
        }
      });

      // Se abbiamo trovato una similarità sufficiente
      if (bestSimilarity > 0.08) { // Soglia ancora più bassa (8%) per essere più inclusiva
        // Se non abbiamo codice per la fase corrente ma abbiamo similarità, usa il codice migliore trovato
        const codeToUse = (blockType === bestBlockType && currentPhaseCode) 
          ? currentPhaseCode 
          : bestBlockCode;
        
        if (codeToUse && codeToUse.trim()) {
          similarCases.push({
            id: tc.id,
            similarity: bestSimilarity,
            blockText: bestBlockText,
            blockType: bestBlockType,
            code: codeToUse,
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
    });

    // Ordina per similarità decrescente e prendi i primi 5
    return similarCases
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);
  };

  const handleSendPrompt = async (blockType, text, wideReasoning = false) => {
    if (!text.trim() || !testCase || !context) return;

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
        similarTestCases = findSimilarTestCases(blockText, blockType);
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
        selectorsCount: context.selectors?.length || 0,
        methodsCount: context.methods?.length || 0,
        filesAnalyzed: context.filesAnalyzed?.length || 0,
        // Invia solo i primi 50 selettori e 10 metodi per ridurre il payload
        selectors: context.selectors?.slice(0, 50) || [],
        methods: context.methods?.slice(0, 10) || [],
        groupedSelectors: context.groupedSelectors || {},
        // AGGIUNGI CONTESTO DELLE ALTRE FASI
        otherPhases: otherPhasesContext,
        // AGGIUNGI TEST CASE SIMILI SE WIDE REASONING È ATTIVO
        wideReasoning: finalWideReasoning,
        similarTestCases: similarTestCases
      };

      const result = await api.chatWithAI(text, actionPart, optimizedContext, newMessages);
      
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

  const handleTargetFileInput = (e) => {
    persistTargetFilePath(e.target.value);
  };

  if (!testCase) {
    return <div>Nessun test case selezionato</div>;
  }

  if (!context) {
    return (
      <div className="test-case-builder">
        <div className="builder-header">
          <button onClick={onBack} className="back-button">← Torna alla lista</button>
          <h2>Costruzione Test Case #{testCase.id}</h2>
        </div>
        <div className="warning-message">
          ⚠️ Contesto non disponibile. Torna alla pagina di setup e estrai il contesto dalle risorse prima di costruire i test case.
        </div>
      </div>
    );
  }

  // MODIFICA onOpenRunner per usare il codice completo
  const handleOpenRunner = () => {
    if (!targetFilePath?.trim()) {
      onLogEvent?.('error', 'Specifica un file Cypress di destinazione prima di eseguire il test completo.');
      return;
    }
    const completeCode = buildCompleteTestCode();
    if (completeCode) {
      setRunnerCode(completeCode);
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

    const filePathToUse = targetFilePath || `C:\\Users\\Antonio Nuzzi\\g2a\\test\\test_case${testCase.id}.cy.js`;
    
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
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '10px' }}>
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

      <GherkinBlock
        type="given"
        label="Given"
        text={testCase.given}
        isExpanded={expandedBlocks.given}
        onToggle={() => toggleBlock('given')}
        state={blockStates.given}
        onPromptChange={(value) => handlePromptChange('given', value)}
        onSendPrompt={(text, wideReasoning) => handleSendPrompt('given', text, wideReasoning)}
        context={context}
        onOpenRunner={handleOpenRunner}
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
        context={context}
        onOpenRunner={handleOpenRunner}
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
        context={context}
        onOpenRunner={handleOpenRunner}
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
function GherkinBlock({ type, label, text, isExpanded, onToggle, state, onPromptChange, onSendPrompt, context, onOpenRunner }) {
  const [showWideReasoningMenu, setShowWideReasoningMenu] = useState(false);
  const dropdownRef = useRef(null);

  // Chiudi il menu quando si clicca fuori
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowWideReasoningMenu(false);
      }
    };

    if (showWideReasoningMenu) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showWideReasoningMenu]);

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

  return (
    <div className={`gherkin-block-container ${type} ${isExpanded ? 'expanded' : ''}`}>
      <div className="gherkin-block-header" onClick={onToggle}>
        <div className="gherkin-label">
          <span className="gherkin-type">{label}</span>
          <span className="gherkin-text">{text}</span>
        </div>
        <button className="toggle-button">{isExpanded ? '▼' : '▶'}</button>
      </div>

      {isExpanded && (
        <div className="gherkin-block-content">
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
                <div className="code-display">
                  <SyntaxHighlighter
                    language="javascript"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      borderRadius: '8px',
                      padding: '20px',
                      overflowX: 'auto',
                      overflowY: 'auto',
                      maxWidth: '100%',
                      wordWrap: 'break-word',
                      whiteSpace: 'pre-wrap',
                      fontSize: '13px',
                      lineHeight: '1.6'
                    }}
                    wrapLines={true}
                    wrapLongLines={true}
                  >
                    {state.code}
                  </SyntaxHighlighter>
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

