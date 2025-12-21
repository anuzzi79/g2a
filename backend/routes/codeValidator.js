// backend/routes/codeValidator.js
import express from 'express';
import codeValidatorService from '../services/codeValidator.js';

const router = express.Router();

/**
 * POST /api/code-validator/validate
 * Valida e corregge il codice
 */
router.post('/validate', async (req, res) => {
  try {
    const { code, isPartial } = req.body;

    if (code === undefined || code === null) {
      return res.status(400).json({
        success: false,
        error: 'Codice richiesto'
      });
    }

    // Passiamo isPartial al servizio
    const result = codeValidatorService.validateAndFixCode(code, isPartial);

    res.json({
      success: true,
      ...result
    });

  } catch (error) {
    console.error('Errore validazione codice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/code-validator/format
 * Formatta il codice
 */
router.post('/format', async (req, res) => {
  try {
    const { code } = req.body;

    if (code === undefined || code === null) {
      return res.status(400).json({
        success: false,
        error: 'Codice richiesto'
      });
    }

    const formatted = codeValidatorService.formatCode(code);

    res.json({
      success: true,
      formattedCode: formatted
    });

  } catch (error) {
    console.error('Errore formattazione codice:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

