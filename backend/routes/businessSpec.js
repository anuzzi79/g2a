// backend/routes/businessSpec.js
import express from 'express';
import {
  loadBusinessSpec,
  saveBusinessSpec
} from '../services/businessSpec.js';

const router = express.Router();

console.log('📋 Business Spec router inizializzato');

router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const spec = await loadBusinessSpec(sessionId);
    res.json({ spec });
  } catch (error) {
    console.error('Errore caricamento Business Spec:', error);
    res.status(500).json({ error: error.message });
  }
});

router.put('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { text } = req.body;

    if (typeof text !== 'string') {
      return res.status(400).json({
        error: 'Il campo "text" è richiesto e deve essere una stringa'
      });
    }

    const spec = await saveBusinessSpec(sessionId, text);
    res.json({ spec });
  } catch (error) {
    console.error('Errore salvataggio Business Spec:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

