// backend/routes/context.js
import express from 'express';
import { extractContextFromResources } from '../services/contextExtractor.js';
import { validateDirectory } from '../services/fileSystem.js';

const router = express.Router();

/**
 * POST /api/context/extract
 * Estrae contesto da risorse (directory/file) specificate
 */
router.post('/extract', async (req, res) => {
  try {
    const { resources } = req.body;

    if (!resources || !Array.isArray(resources) || resources.length === 0) {
      return res.status(400).json({ error: 'Array di risorse (directory/file) richiesto' });
    }

    // Valida che tutte le risorse esistano
    const fs = await import('fs/promises');
    const validationResults = await Promise.all(
      resources.map(async (resourcePath) => {
        try {
          const stats = await fs.stat(resourcePath);
          return { path: resourcePath, valid: true, isDirectory: stats.isDirectory(), isFile: stats.isFile() };
        } catch (error) {
          return { path: resourcePath, valid: false, error: error.message };
        }
      })
    );

    const invalidResources = validationResults.filter(r => !r.valid);
    if (invalidResources.length > 0) {
      return res.status(400).json({ 
        error: 'Alcune risorse non sono valide',
        invalidResources: invalidResources.map(r => ({ path: r.path, error: r.error }))
      });
    }

    // Estrai contesto da tutte le risorse
    const context = await extractContextFromResources(resources, validationResults);

    res.json({
      success: true,
      resourcesCount: resources.length,
      context
    });
  } catch (error) {
    console.error('Errore estrazione contesto:', error);
    res.status(500).json({ 
      error: 'Errore estrazione contesto: ' + error.message 
    });
  }
});

export default router;
