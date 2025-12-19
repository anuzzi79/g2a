// backend/routes/contextDocument.js
import express from 'express';
import {
  loadContextDocument,
  saveContextDocument
} from '../services/contextDocument.js';

const router = express.Router();

console.log('📄 Context Document router inizializzato');

/**
 * GET /api/context-document/:sessionId
 * Carica il Documento di Contesto per una sessione
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const document = await loadContextDocument(sessionId);
    res.json({ document });
  } catch (error) {
    console.error('Errore caricamento Documento di Contesto:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/context-document/:sessionId
 * Salva o aggiorna il Documento di Contesto per una sessione
 */
router.put('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { text } = req.body;
    
    if (typeof text !== 'string') {
      return res.status(400).json({ 
        error: 'Il campo "text" è richiesto e deve essere una stringa' 
      });
    }
    
    const document = await saveContextDocument(sessionId, text);
    res.json({ document });
  } catch (error) {
    console.error('Errore salvataggio Documento di Contesto:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;


