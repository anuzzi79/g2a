// backend/services/llmAgent.js
import OpenAI from 'openai';
import fs from 'fs/promises';

let openaiClient = null;

/**
 * Inizializza il client OpenAI
 */
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
 * Parsing di una frase Gherkin per estrarre parti di senso compiuto
 */
export async function parseGherkinSentence(sentence, context = {}) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4';

  const contextStr = context.selectors?.length > 0 
    ? `\n\nContesto disponibile:\n- ${context.selectors.length} selettori trovati\n- ${context.methods?.length || 0} metodi disponibili`
    : '';

  const prompt = `Analizza questa frase Gherkin e estrai le parti di senso compiuto che rappresentano azioni o verifiche automatizzabili.

Frase: "${sentence}"
${contextStr}

Per ogni parte di senso compiuto, identifica:
1. Il tipo di azione (click, type, verify, navigate, wait, etc.)
2. L'elemento target (se presente)
3. Il valore o stato atteso (se presente)

Rispondi con un JSON che contiene un campo "parts" che è un array. Ogni elemento dell'array deve avere:
{
  "type": "azione",
  "target": "elemento o selettore",
  "value": "valore o testo atteso",
  "description": "descrizione breve della parte"
}

Esempio di risposta JSON:
{
  "parts": [
    {"type": "navigate", "target": null, "value": "/path/to/page", "description": "Naviga al path specificato"},
    {"type": "click", "target": "Action/Copy", "value": null, "description": "Clicca sul pulsante Action/Copy"},
    {"type": "verify", "target": "modal", "value": "aperto", "description": "Verifica che il modal sia aperto"}
  ]
}

IMPORTANTE: Rispondi SOLO con il JSON valido, senza testo aggiuntivo.`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: 'Sei un esperto di automazione test e parsing Gherkin. Analizza le frasi e estrai azioni automatizzabili. Rispondi SEMPRE con un JSON valido che contiene un campo "parts" che è un array.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);
    
    // Supporta sia array diretto che oggetto con campo "parts"
    let parts = [];
    if (Array.isArray(parsed)) {
      parts = parsed;
    } else if (parsed.parts && Array.isArray(parsed.parts)) {
      parts = parsed.parts;
    } else if (parsed.actions && Array.isArray(parsed.actions)) {
      parts = parsed.actions;
    }
    
    return parts;
  } catch (error) {
    console.error('Errore parsing Gherkin:', error);
    throw error;
  }
}

/**
 * Suggerisce selettore/azione per una parte di senso compiuto
 */
export async function suggestAutomation(actionPart, context = {}, conversationHistory = []) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4';

  // Prepara contesto dei selettori disponibili
  let contextInfo = '';
  if (context.selectors && context.selectors.length > 0) {
    const selectorExamples = context.selectors.slice(0, 20).map(s => 
      `- ${s.selector} (${s.type}, file: ${s.file})`
    ).join('\n');
    contextInfo = `\n\nSelettori disponibili nel contesto:\n${selectorExamples}`;
    if (context.selectors.length > 20) {
      contextInfo += `\n... e altri ${context.selectors.length - 20} selettori`;
    }
  }

  if (context.methods && context.methods.length > 0) {
    const methodExamples = context.methods.slice(0, 10).map(m => 
      `- ${m.name}() in ${m.file}`
    ).join('\n');
    contextInfo += `\n\nMetodi disponibili:\n${methodExamples}`;
  }

  const historyStr = conversationHistory.length > 0
    ? `\n\nStoria conversazione:\n${conversationHistory.map((msg, i) => `${i + 1}. ${msg.role}: ${msg.content}`).join('\n')}`
    : '';

  const prompt = `L'utente vuole automatizzare questa azione:
Tipo: ${actionPart.type}
Target: ${actionPart.target || 'non specificato'}
Valore: ${actionPart.value || 'non specificato'}
Descrizione: ${actionPart.description}
${contextInfo}${historyStr}

Suggerisci:
1. Il miglior selettore Cypress da usare (es: cy.get('...'), cy.contains('...'))
2. Il comando Cypress appropriato (click, type, should, etc.)
3. Se possibile, un metodo esistente dal contesto che potrebbe essere riutilizzato
4. Eventuali considerazioni o alternative

Rispondi in formato JSON:
{
  "suggestion": "codice Cypress suggerito completo",
  "selector": "selettore suggerito",
  "command": "comando Cypress",
  "explanation": "spiegazione breve del perché questa soluzione",
  "alternativeSelectors": ["alternativa1", "alternativa2"],
  "existingMethod": "nome metodo esistente se riutilizzabile",
  "confidence": 0.8,
  "needsClarification": false,
  "clarificationQuestion": null
}

Se hai bisogno di più informazioni dall'utente, imposta needsClarification: true e fornisci una clarificationQuestion.`;

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        { 
          role: 'system', 
          content: 'Sei un esperto di automazione Cypress. Suggerisci il miglior codice per automatizzare azioni basandoti sul contesto fornito.' 
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5,
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const suggestion = JSON.parse(content);
    
    return suggestion;
  } catch (error) {
    console.error('Errore suggerimento automazione:', error);
    throw error;
  }
}

/**
 * Chat interattiva per raffinare una soluzione
 */
export async function chatWithAI(message, actionPart, context = {}, conversationHistory = []) {
  const client = getOpenAIClient();
  const model = process.env.OPENAI_MODEL || 'gpt-4';

  // Ottimizza il contesto: prendi solo i selettori e metodi più rilevanti
  // Limita a 50 selettori più rilevanti e 10 metodi per evitare token eccessivi
  let optimizedContext = '';
  
  if (context && context.selectors && context.selectors.length > 0) {
    const relevantSelectors = context.selectors.slice(0, 50).map(s => 
      `- ${s.selector} (${s.type}, file: ${s.file})`
    ).join('\n');
    optimizedContext += `\n\nSelettori disponibili (${context.selectors.length} totali, mostrati i primi 50):\n${relevantSelectors}`;
  }

  if (context && context.methods && context.methods.length > 0) {
    const relevantMethods = context.methods.slice(0, 10).map(m => 
      `- ${m.name}() in ${m.file}`
    ).join('\n');
    optimizedContext += `\n\nMetodi disponibili (${context.methods.length} totali, mostrati i primi 10):\n${relevantMethods}`;
  }

  const messages = [
    {
      role: 'system',
      content: `Sei un assistente AI per l'automazione di test Cypress. Aiuta l'utente a trovare la migliore soluzione per automatizzare:

Azione: ${actionPart.type || 'sconosciuta'} - ${actionPart.description || 'da determinare'}
Target: ${actionPart.target || 'da determinare'}
Valore: ${actionPart.value || 'da determinare'}
${optimizedContext}

Usa il contesto fornito (selettori e metodi disponibili) per suggerire soluzioni concrete.`
    },
    ...conversationHistory.map(msg => ({
      role: msg.role,
      content: msg.content
    })),
    {
      role: 'user',
      content: message
    }
  ];

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7
    });

    return response.choices[0].message.content;
  } catch (error) {
    console.error('Errore chat AI:', error);
    throw error;
  }
}

