// backend/routes/resources.js
import express from 'express';
import { validateDirectory, findJSFiles } from '../services/fileSystem.js';

const router = express.Router();

/**
 * POST /api/resources/scan-directory
 * Scansiona una directory e trova tutti i file .js
 */
router.post('/scan-directory', async (req, res) => {
  try {
    const { directoryPath } = req.body;

    if (!directoryPath) {
      return res.status(400).json({ error: 'directoryPath richiesto' });
    }

    // Valida directory
    const isValidDir = await validateDirectory(directoryPath);
    if (!isValidDir) {
      return res.status(400).json({ error: 'Directory non valida o non esiste' });
    }

    // Trova tutti i file JS
    const jsFiles = await findJSFiles(directoryPath);

    // Restituisci lista di file con path completo
    const files = jsFiles.map(file => ({
      path: file.fullPath,
      relativePath: file.relativePath,
      name: file.relativePath.split(/[/\\]/).pop() || file.relativePath
    }));

    res.json({
      success: true,
      directoryPath,
      filesCount: files.length,
      files
    });
  } catch (error) {
    console.error('Errore scansione directory:', error);
    res.status(500).json({ 
      error: 'Errore scansione directory: ' + error.message 
    });
  }
});

export default router;











