// backend/routes/llm.js
import express from 'express';
import { parseGherkinSentence, suggestAutomation, chatWithAI } from '../services/llmAgent.js';

const router = express.Router();

/**
 * POST /api/llm/parse-gherkin
 * Parsing di una frase Gherkin per estrarre parti di senso compiuto
 */
router.post('/parse-gherkin', async (req, res) => {
  try {
    const { sentence, context } = req.body;

    if (!sentence) {
      return res.status(400).json({ error: 'sentence richiesta' });
    }

    const parts = await parseGherkinSentence(sentence, context || {});

    res.json({
      success: true,
      parts
    });
  } catch (error) {
    console.error('Errore parsing Gherkin:', error);
    res.status(500).json({ 
      error: 'Errore parsing: ' + error.message 
    });
  }
});

/**
 * POST /api/llm/suggest
 * Suggerisce automazione per una parte di azione
 */
router.post('/suggest', async (req, res) => {
  try {
    const { actionPart, context, conversationHistory } = req.body;

    if (!actionPart) {
      return res.status(400).json({ error: 'actionPart richiesto' });
    }

    const suggestion = await suggestAutomation(
      actionPart, 
      context || {}, 
      conversationHistory || []
    );

    res.json({
      success: true,
      suggestion
    });
  } catch (error) {
    console.error('Errore suggerimento:', error);
    res.status(500).json({ 
      error: 'Errore suggerimento: ' + error.message 
    });
  }
});

/**
 * POST /api/llm/chat
 * Chat interattiva per raffinare soluzione
 */
router.post('/chat', async (req, res) => {
  try {
    const { message, actionPart, context, conversationHistory, wideReasoning, similarTestCases } = req.body;

    console.log('Richiesta chat ricevuta:', { 
      messageLength: message?.length, 
      hasActionPart: !!actionPart, 
      hasContext: !!context,
      historyLength: conversationHistory?.length || 0,
      wideReasoning: wideReasoning || false,
      similarTestCasesCount: similarTestCases?.length || 0
    });

    if (!message) {
      return res.status(400).json({ error: 'message richiesto' });
    }

    const response = await chatWithAI(
      message,
      actionPart || {},
      context || {},
      conversationHistory || [],
      wideReasoning || false,
      similarTestCases || []
    );

    console.log('Risposta chat generata:', response?.substring(0, 100));

    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('Errore chat:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Errore chat: ' + error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;

