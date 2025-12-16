// backend/routes/ecDatabase.js
import express from 'express';
import {
  loadECObjects,
  saveECObject,
  deleteECObject,
  getECObjectsByTestCase,
  loadBinomi,
  saveBinomio,
  deleteBinomio,
  getBinomiByTestCase,
  deleteBinomiByObjectId
} from '../services/ecDatabase.js';

const router = express.Router();

console.log('📊 EC Database router inizializzato');

/**
 * GET /api/ec-objects/:sessionId
 * Lista tutti gli oggetti EC per una sessione
 */
router.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { testCaseId } = req.query;
    
    let objects;
    if (testCaseId) {
      objects = await getECObjectsByTestCase(sessionId, testCaseId);
    } else {
      objects = await loadECObjects(sessionId);
    }
    
    res.json({ objects });
  } catch (error) {
    console.error('Errore caricamento oggetti EC:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ec-objects/:sessionId
 * Crea o aggiorna un oggetto EC
 */
router.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const object = req.body;
    
    if (!object.id || !object.text || !object.testCaseId) {
      return res.status(400).json({ 
        error: 'Campi richiesti: id, text, testCaseId' 
      });
    }
    
    const saved = await saveECObject(sessionId, object);
    res.json({ object: saved });
  } catch (error) {
    console.error('Errore salvataggio oggetto EC:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/ec-objects/:sessionId/:objectId
 * Elimina un oggetto EC e tutti i binomi associati
 */
router.delete('/:sessionId/:objectId', async (req, res) => {
  try {
    const { sessionId, objectId } = req.params;
    
    // Elimina binomi associati
    await deleteBinomiByObjectId(sessionId, objectId);
    
    // Elimina oggetto
    const deleted = await deleteECObject(sessionId, objectId);
    
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Oggetto non trovato' });
    }
  } catch (error) {
    console.error('Errore eliminazione oggetto EC:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/binomi/:sessionId
 * Lista tutti i binomi per una sessione
 * NOTA: Questa route viene registrata come app.use('/api/binomi', ...) nel server,
 * quindi il path qui è solo '/:sessionId'
 */
const binomiRouter = express.Router();

binomiRouter.get('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { testCaseId } = req.query;
    
    let binomi;
    if (testCaseId) {
      binomi = await getBinomiByTestCase(sessionId, testCaseId);
    } else {
      binomi = await loadBinomi(sessionId);
    }
    
    res.json({ binomi });
  } catch (error) {
    console.error('Errore caricamento binomi:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/binomi/:sessionId
 * Crea o aggiorna un binomio
 */
binomiRouter.post('/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const binomio = req.body;
    
    if (!binomio.id || !binomio.fromObjectId || !binomio.toObjectId || !binomio.testCaseId) {
      return res.status(400).json({ 
        error: 'Campi richiesti: id, fromObjectId, toObjectId, testCaseId' 
      });
    }
    
    // Valida che fromObjectId e toObjectId siano diversi
    if (binomio.fromObjectId === binomio.toObjectId) {
      return res.status(400).json({ 
        error: 'fromObjectId e toObjectId devono essere diversi' 
      });
    }
    
    const saved = await saveBinomio(sessionId, binomio);
    res.json({ binomio: saved });
  } catch (error) {
    console.error('Errore salvataggio binomio:', error);
    const errorMessage = error?.message || error?.toString() || 'Errore sconosciuto durante il salvataggio del binomio';
    res.status(500).json({ error: errorMessage });
  }
});

/**
 * PUT /api/binomi/:sessionId/:binomioId
 * Aggiorna lo status di un binomio (active/disabled)
 */
binomiRouter.put('/:sessionId/:binomioId', async (req, res) => {
  try {
    const { sessionId, binomioId } = req.params;
    const { status, reason } = req.body;
    
    if (!status || (status !== 'active' && status !== 'disabled')) {
      return res.status(400).json({ 
        error: 'Il campo "status" è richiesto e deve essere "active" o "disabled"' 
      });
    }
    
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return res.status(400).json({ 
        error: 'Il campo "reason" è richiesto e deve essere una stringa non vuota' 
      });
    }
    
    // Carica binomi esistenti
    const binomi = await loadBinomi(sessionId);
    const binomioIndex = binomi.findIndex(b => b.id === binomioId);
    
    if (binomioIndex === -1) {
      return res.status(404).json({ error: 'Binomio non trovato' });
    }
    
    const binomio = binomi[binomioIndex];
    const now = new Date().toISOString();
    
    // Aggiorna status e campi correlati
    if (status === 'disabled') {
      binomio.status = 'disabled';
      binomio.disabledAt = now;
      binomio.disabledReason = reason.trim();
      // Rimuovi campi di riattivazione se esistono
      delete binomio.enabledAt;
      delete binomio.enabledReason;
    } else {
      binomio.status = 'active';
      binomio.enabledAt = now;
      binomio.enabledReason = reason.trim();
      // Rimuovi campi di disattivazione se esistono
      delete binomio.disabledAt;
      delete binomio.disabledReason;
    }
    
    // Salva il binomio aggiornato
    const saved = await saveBinomio(sessionId, binomio);
    res.json({ binomio: saved });
  } catch (error) {
    console.error('Errore aggiornamento status binomio:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/binomi/:sessionId/:binomioId
 * Elimina un binomio
 */
binomiRouter.delete('/:sessionId/:binomioId', async (req, res) => {
  try {
    const { sessionId, binomioId } = req.params;
    
    const deleted = await deleteBinomio(sessionId, binomioId);
    
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Binomio non trovato' });
    }
  } catch (error) {
    console.error('Errore eliminazione binomio:', error);
    res.status(500).json({ error: error.message });
  }
});

// Esporta sia il router principale (per ec-objects) che quello per binomi
export { binomiRouter };
export default router;

