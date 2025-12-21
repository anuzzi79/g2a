import express from 'express';
import cypressConfigService from '../services/cypressConfig.js';

const router = express.Router();

/**
 * GET /api/cypress-config
 * Carica la configurazione salvata
 */
router.get('/', async (req, res) => {
  try {
    const config = cypressConfigService.loadConfiguration();
    res.json({ success: true, config });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cypress-config
 * Salva la configurazione
 */
router.post('/', async (req, res) => {
  try {
    const config = req.body;
    const result = await cypressConfigService.saveConfiguration(config);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cypress-config/analyze
 * Analizza una configurazione senza salvarla
 */
router.post('/analyze', async (req, res) => {
  try {
    const config = req.body;
    const analysis = await cypressConfigService.analyzeConfiguration(config);
    res.json({ success: true, analysis });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/cypress-config/verify
 * Verifica validità configurazione esistente
 */
router.get('/verify', async (req, res) => {
  try {
    const verification = cypressConfigService.verifyConfiguration();
    res.json({ success: true, verification });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cypress-config/read-file
 * Legge il contenuto di un file per preview
 */
router.post('/read-file', async (req, res) => {
  try {
    const { filePath, isProtected } = req.body;
    const result = cypressConfigService.readFileContent(filePath, isProtected);
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cypress-config/validate-file
 * Valida che un file esista
 */
router.post('/validate-file', async (req, res) => {
  try {
    const { filePath } = req.body;
    const valid = cypressConfigService.validateFile(filePath);
    res.json({ success: true, valid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/cypress-config/validate-directory
 * Valida che una directory esista
 */
router.post('/validate-directory', async (req, res) => {
  try {
    const { dirPath } = req.body;
    const valid = cypressConfigService.validateDirectory(dirPath);
    res.json({ success: true, valid });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;

