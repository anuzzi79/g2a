// backend/services/llmMatch.js
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import { loadContextDocument, saveContextDocument } from './contextDocument.js';
import { loadBusinessSpec } from './businessSpec.js';
import { loadBinomi, saveBinomio } from './ecDatabase.js';
import { loadECObjects } from './ecDatabase.js';

// Helper per ottenere il percorso base delle sessioni
function getSessionsBasePath() {
  const envPath = process.env.G2A_SESSIONS_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.resolve(process.cwd(), 'sessions');
}

// Helper per ottenere il percorso del file suggestions
function getSuggestionsPath(sessionId) {
  return path.join(getSessionsBasePath(), sessionId, 'llm-suggestions.json');
}

// Inizializza client OpenAI
let openaiClient = null;
function getOpenAIClient() {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY non configurata nel file .env');
    }
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Carica tutti i context sources per il reasoning LLM
 */
async function gatherContextSources(sessionId) {
  const [dc, businessSpec, binomi, ecObjects] = await Promise.all([
    loadContextDocument(sessionId),
    loadBusinessSpec(sessionId),
    loadBinomi(sessionId),
    loadECObjects(sessionId)
  ]);

  // Filtra solo binomi attivi (pattern disponibili)
  const activeBinomi = binomi.filter(b => (b.status || 'active') === 'active');

  // Raggruppa oggetti per test case
  const objectsByTestCase = {};
  ecObjects.forEach(obj => {
    const tcId = obj.testCaseId || 'unknown';
    if (!objectsByTestCase[tcId]) {
      objectsByTestCase[tcId] = [];
    }
    objectsByTestCase[tcId].push(obj);
  });

  // Identifica oggetti FROM non ancora collegati (senza binomio)
  const unlinkedFromObjects = ecObjects.filter(obj => {
    if (obj.location !== 'header') return false; // Solo oggetti FROM (header)
    return !activeBinomi.some(b => b.fromObjectId === obj.id);
  });

  return {
    contextDocument: dc,
    businessSpec,
    activeBinomi,
    ecObjects,
    objectsByTestCase,
    unlinkedFromObjects
  };
}

/**
 * Costruisce il mega-prompt per il reasoning LLM
 */
function buildLLMPrompt(contextSources) {
  const { contextDocument, businessSpec, activeBinomi, ecObjects, objectsByTestCase, unlinkedFromObjects } = contextSources;

  let prompt = `Sei un esperto di test automation che analizza pattern di matching tra linguaggio naturale e codice Cypress.

Il tuo compito è identificare oggetti FROM (linguaggio naturale) che potrebbero essere collegati a pattern esistenti di binomi, basandoti sul contesto fornito.

═══════════════════════════════════════════════════════════════
📋 DOCUMENTO DI CONTESTO (Regole Apprese)
═══════════════════════════════════════════════════════════════

${contextDocument.text || '(Nessun documento di contesto ancora disponibile)'}

═══════════════════════════════════════════════════════════════
📝 BUSINESS SPECIFICATIONS
═══════════════════════════════════════════════════════════════

${businessSpec.text || '(Nessuna business spec disponibile)'}

═══════════════════════════════════════════════════════════════
🔗 BINOMI PATTERN ESISTENTI (Da utilizzare come riferimento)
═══════════════════════════════════════════════════════════════

${activeBinomi.length === 0 ? '(Nessun binomio pattern disponibile)' : activeBinomi.map((b, idx) => {
  const fromObj = ecObjects.find(o => o.id === b.fromObjectId);
  const toObj = ecObjects.find(o => o.id === b.toObjectId);
  return `${idx + 1}. Pattern Binomio ID: ${b.id}
   - Test Case: ${b.testCaseId || 'N/A'}
   - FROM: "${fromObj?.text || b.fromObjectId}"
   - TO: "${toObj?.text || b.toObjectId}"
   ${b.forceMeta?.ruleText ? `   - Regola: ${b.forceMeta.ruleText}` : ''}`;
}).join('\n\n')}

═══════════════════════════════════════════════════════════════
🎯 OGGETTI FROM NON COLLEGATI (Da analizzare)
═══════════════════════════════════════════════════════════════

${unlinkedFromObjects.length === 0 ? '(Nessun oggetto FROM non collegato trovato)' : unlinkedFromObjects.map((obj, idx) => {
  const tcObjects = objectsByTestCase[obj.testCaseId] || [];
  const contextObjects = tcObjects.filter(o => o.location === 'content').map(o => o.text).join(', ');
  return `${idx + 1}. Oggetto ID: ${obj.id}
   - Test Case: ${obj.testCaseId || 'N/A'}
   - Testo: "${obj.text}"
   ${contextObjects ? `   - Contesto (oggetti TO nella stessa fase): ${contextObjects}` : ''}`;
}).join('\n\n')}

═══════════════════════════════════════════════════════════════
📊 TASK
═══════════════════════════════════════════════════════════════

Analizza gli oggetti FROM non collegati sopra e identifica quali potrebbero essere matchati con i pattern esistenti.

Per ogni match suggerito, fornisci:
- fromObjectId: ID dell'oggetto FROM non collegato
- suggestedPatternBinomioId: ID del binomio pattern che suggerisci come match
- confidence: livello di confidenza (0.0 - 1.0) sulla correttezza del match
- reasoning: spiegazione dettagliata del perché questo match è valido, basandoti sul Documento di Contesto e le regole apprese

IMPORTANTE:
- Considera il contesto semantico e il dominio applicativo (Business Spec)
- Usa le regole del Documento di Contesto per guidare il tuo reasoning
- Sii conservativo: suggerisci solo match con confidence >= 0.6
- Ogni oggetto FROM può essere suggerito solo una volta

Rispondi con un JSON valido nel seguente formato:
{
  "suggestions": [
    {
      "fromObjectId": "obj-123",
      "suggestedPatternBinomioId": "binomio-456",
      "confidence": 0.85,
      "reasoning": "Entrambi gli oggetti gestiscono il login dell'utente con pattern simili nel DOM..."
    }
  ],
  "stats": {
    "totalAnalyzed": 50,
    "suggested": 12,
    "avgConfidence": 0.78
  }
}`;

  return prompt;
}

/**
 * Esegue il Run LLM Assisted Match
 */
export async function runLLMAssistedMatch(sessionId) {
  try {
    console.log(`[LLM Match] Inizio analisi per sessione ${sessionId}`);

    // 1. Raccogli tutti i context sources
    const contextSources = await gatherContextSources(sessionId);
    
    if (contextSources.unlinkedFromObjects.length === 0) {
      return {
        suggestions: [],
        stats: {
          totalAnalyzed: 0,
          suggested: 0,
          avgConfidence: 0
        }
      };
    }

    if (contextSources.activeBinomi.length === 0) {
      return {
        suggestions: [],
        stats: {
          totalAnalyzed: contextSources.unlinkedFromObjects.length,
          suggested: 0,
          avgConfidence: 0
        },
        message: 'Nessun binomio pattern disponibile per il matching'
      };
    }

    // 2. Costruisci prompt
    const prompt = buildLLMPrompt(contextSources);

    // 3. Chiama OpenAI
    const client = getOpenAIClient();
    const model = process.env.OPENAI_MODEL || 'gpt-4';

    console.log(`[LLM Match] Invio richiesta a OpenAI (modello: ${model})...`);

    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: 'Sei un esperto di test automation che analizza pattern di matching tra linguaggio naturale e codice Cypress. Rispondi SEMPRE con un JSON valido che contiene un campo "suggestions" (array) e un campo "stats" (oggetto).'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    let parsed;
    
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      console.error('[LLM Match] Errore parsing risposta JSON:', parseError);
      console.error('[LLM Match] Contenuto ricevuto:', content);
      throw new Error('Risposta LLM non valida: formato JSON non corretto');
    }

    // 4. Valida e normalizza suggestions
    const suggestions = (parsed.suggestions || []).map(s => ({
      id: uuidv4(),
      fromObjectId: s.fromObjectId,
      suggestedPatternBinomioId: s.suggestedPatternBinomioId,
      confidence: Math.max(0, Math.min(1, parseFloat(s.confidence) || 0)),
      reasoning: s.reasoning || '',
      status: 'pending',
      createdAt: new Date().toISOString()
    })).filter(s => {
      // Valida che gli ID esistano
      const fromExists = contextSources.unlinkedFromObjects.some(o => o.id === s.fromObjectId);
      const patternExists = contextSources.activeBinomi.some(b => b.id === s.suggestedPatternBinomioId);
      return fromExists && patternExists && s.confidence >= 0.6;
    });

    // 5. Calcola stats
    const stats = {
      totalAnalyzed: contextSources.unlinkedFromObjects.length,
      suggested: suggestions.length,
      avgConfidence: suggestions.length > 0
        ? suggestions.reduce((sum, s) => sum + s.confidence, 0) / suggestions.length
        : 0
    };

    // 6. Salva suggestions in file
    const runId = uuidv4();
    const suggestionsData = {
      runId,
      timestamp: new Date().toISOString(),
      suggestions,
      stats
    };

    const filePath = getSuggestionsPath(sessionId);
    const dirPath = path.dirname(filePath);
    await fs.mkdir(dirPath, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(suggestionsData, null, 2), 'utf8');

    console.log(`[LLM Match] Completato: ${suggestions.length} suggestions salvate`);

    return {
      runId,
      suggestions,
      stats
    };
  } catch (error) {
    console.error('[LLM Match] Errore durante run:', error);
    throw error;
  }
}

/**
 * Amalgama il Documento di Contesto integrando nuove regole tramite LLM
 */
async function amalgamateDC(sessionId, newRulesText) {
  const dc = await loadContextDocument(sessionId);
  const client = getOpenAIClient();
  
  const prompt = `Hai un Documento di Contesto con regole esistenti e nuove regole da integrare.

DOCUMENTO ATTUALE:
${dc.text}

NUOVE REGOLE:
${newRulesText}

TASK:
Riscrivi il Documento di Contesto integrando le nuove regole in modo organico:
- Raggruppa regole simili per categoria (genesis, matching, unmatching, LLM)
- Elimina duplicati o conflitti
- Mantieni cronologia quando rilevante
- Rendi il testo coerente e leggibile come guida per future inferenze LLM

Rispondi solo con il nuovo testo del Documento di Contesto, senza commenti aggiuntivi.`;

  const response = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4',
    messages: [
      { role: 'system', content: 'Sei un esperto di knowledge management che riorganizza documenti tecnici per massimizzare coerenza e utilita.' },
      { role: 'user', content: prompt }
    ],
    temperature: 0.3
  });

  const newDcText = response.choices[0].message.content.trim();
  await saveContextDocument(sessionId, newDcText);
  
  return newDcText;
}

/**
 * Conferma le suggestions accettate e crea i binomi
 */
export async function confirmLLMSuggestions(sessionId, acceptedSuggestionIds) {
  try {
    console.log(`[LLM Match] Conferma ${acceptedSuggestionIds.length} suggestions per sessione ${sessionId}`);

    // 1. Carica suggestions
    const filePath = getSuggestionsPath(sessionId);
    let suggestionsData;
    try {
      const data = await fs.readFile(filePath, 'utf8');
      suggestionsData = JSON.parse(data);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error('Nessuna suggestion trovata. Esegui prima il Run LLM Match.');
      }
      throw error;
    }

    // 2. Carica binomi e oggetti per riferimento
    const [binomi, ecObjects] = await Promise.all([
      loadBinomi(sessionId),
      loadECObjects(sessionId)
    ]);

    // 3. Per ogni suggestion accettata, crea binomio
    const createdBinomi = [];
    const updatedSuggestions = [];

    for (const s of suggestionsData.suggestions) {
      if (acceptedSuggestionIds.includes(s.id)) {
        // Trova pattern binomio
        const patternBinomio = binomi.find(b => b.id === s.suggestedPatternBinomioId);
        if (!patternBinomio) {
          console.warn(`[LLM Match] Pattern binomio ${s.suggestedPatternBinomioId} non trovato`);
          updatedSuggestions.push({ ...s, status: 'rejected', reason: 'Pattern binomio non trovato' });
          continue;
        }

        // Trova oggetto TO del pattern
        const patternToObject = ecObjects.find(o => o.id === patternBinomio.toObjectId);
        if (!patternToObject) {
          console.warn(`[LLM Match] Oggetto TO del pattern non trovato`);
          updatedSuggestions.push({ ...s, status: 'rejected', reason: 'Oggetto TO pattern non trovato' });
          continue;
        }

        // Crea nuovo binomio
        const newBinomio = {
          id: uuidv4(),
          testCaseId: ecObjects.find(o => o.id === s.fromObjectId)?.testCaseId || patternBinomio.testCaseId,
          fromObjectId: s.fromObjectId,
          toObjectId: patternBinomio.toObjectId, // Eredita TO dal pattern
          fromPoint: null,
          toPoint: null,
          createdAt: new Date().toISOString(),
          status: 'active',
          llmMeta: {
            sourceSuggestionId: s.id,
            sourcePatternBinomioId: s.suggestedPatternBinomioId,
            confidence: s.confidence,
            reasoning: s.reasoning,
            createdAt: new Date().toISOString()
          }
        };

        // Salva binomio
        await saveBinomio(sessionId, newBinomio);
        createdBinomi.push(newBinomio);

        updatedSuggestions.push({ ...s, status: 'accepted' });
      } else {
        updatedSuggestions.push({ ...s, status: 'rejected' });
      }
    }

    // 4. Aggiorna file suggestions
    suggestionsData.suggestions = updatedSuggestions;
    await fs.writeFile(filePath, JSON.stringify(suggestionsData, null, 2), 'utf8');

    // 5. Amalgama DC con nuove regole se ci sono binomi creati
    if (createdBinomi.length > 0) {
      const allNewReasoning = createdBinomi.map(b => b.llmMeta.reasoning).join('\n\n');
      await amalgamateDC(sessionId, allNewReasoning);
      console.log('[LLM Match] Documento di Contesto amalgamato');
    }

    console.log(`[LLM Match] Creati ${createdBinomi.length} nuovi binomi`);

    return {
      createdBinomi,
      acceptedCount: createdBinomi.length
    };
  } catch (error) {
    console.error('[LLM Match] Errore durante conferma:', error);
    throw error;
  }
}

