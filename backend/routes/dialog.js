// backend/routes/dialog.js
import express from 'express';
import { selectDirectoryDialog, selectFileDialog } from '../services/fileSystem.js';

const router = express.Router();

/**
 * POST /api/dialog/select-directory
 * Apre dialog Windows classico di Esplora Risorse per selezionare directory
 */
router.post('/select-directory', async (req, res) => {
  try {
    const { description = 'Seleziona Directory' } = req.body;
    
    console.log('Richiesta apertura dialog con descrizione:', description);
    
    const selectedPath = await selectDirectoryDialog(description);
    
    console.log('Dialog chiuso, risultato:', selectedPath || 'null/canceled');
    
    if (!selectedPath) {
      return res.json({ canceled: true });
    }

    res.json({ 
      path: selectedPath,
      canceled: false 
    });
  } catch (error) {
    console.error('Errore dialog:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Errore apertura dialog: ' + error.message,
      details: error.message
    });
  }
});

/**
 * POST /api/dialog/select-file
 * Apre dialog Windows classico di Esplora Risorse per selezionare file
 */
router.post('/select-file', async (req, res) => {
  try {
    const { description = 'Seleziona File', filters = 'Tutti i file|*.*' } = req.body;
    
    console.log('Richiesta apertura dialog file con descrizione:', description);
    
    const selectedPath = await selectFileDialog(description, filters);
    
    console.log('Dialog chiuso, risultato:', selectedPath || 'null/canceled');
    
    if (!selectedPath) {
      return res.json({ canceled: true });
    }

    res.json({ 
      path: selectedPath,
      canceled: false 
    });
  } catch (error) {
    console.error('Errore dialog file:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({ 
      error: 'Errore apertura dialog: ' + error.message,
      details: error.message
    });
  }
});

export default router;
