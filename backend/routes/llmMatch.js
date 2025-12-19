// backend/routes/llmMatch.js
import express from 'express';
import {
  runLLMAssistedMatch,
  confirmLLMSuggestions
} from '../services/llmMatch.js';

const router = express.Router();

console.log('🤖 LLM Match router inizializzato');

/**
 * POST /api/llm-match/:sessionId/run
 * Esegue il Run LLM Assisted Match e ritorna le suggestions
 */
router.post('/:sessionId/run', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await runLLMAssistedMatch(sessionId);
    res.json(result);
  } catch (error) {
    console.error('Errore Run LLM Match:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/llm-match/:sessionId/confirm
 * Conferma le suggestions accettate e crea i binomi
 */
router.post('/:sessionId/confirm', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { acceptedIds } = req.body;

    if (!Array.isArray(acceptedIds)) {
      return res.status(400).json({
        error: 'Il campo "acceptedIds" è richiesto e deve essere un array'
      });
    }

    const result = await confirmLLMSuggestions(sessionId, acceptedIds);
    res.json(result);
  } catch (error) {
    console.error('Errore conferma LLM Suggestions:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

