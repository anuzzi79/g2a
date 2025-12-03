// backend/routes/sessions.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';

const router = express.Router();

console.log('📁 Sessions router inizializzato');

// Helper per ottenere il percorso base delle sessioni
function getSessionsBasePath() {
  // Prima prova a leggere da env o config
  const envPath = process.env.G2A_SESSIONS_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  
  // Default: nella root del progetto
  return path.resolve(process.cwd(), 'sessions');
}

// Helper per ottenere metadati sessione da file JSON
async function getSessionsMetadata() {
  const metadataPath = path.join(getSessionsBasePath(), '.sessions-metadata.json');
  try {
    const data = await fs.readFile(metadataPath, 'utf8');
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveSessionsMetadata(metadata) {
  const metadataPath = path.join(getSessionsBasePath(), '.sessions-metadata.json');
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');
}

/**
 * GET /api/sessions
 * Lista tutte le sessioni
 */
router.get('/', async (req, res) => {
  try {
    const basePath = getSessionsBasePath();
    const metadata = await getSessionsMetadata();
    const sessions = [];

    // Leggi tutte le directory sessioni
    try {
      const entries = await fs.readdir(basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('session-')) {
          const sessionId = entry.name;
          const sessionPath = path.join(basePath, entry.name);
          
          // Conta file di test
          const testFilesDir = path.join(sessionPath, 'test_files');
          let testCasesCount = 0;
          try {
            const testFiles = await fs.readdir(testFilesDir);
            testCasesCount = testFiles.filter(f => f.endsWith('.cy.js')).length;
          } catch {
            // Directory non esiste ancora
          }

          // Leggi metadati dalla directory o dai metadati globali
          let sessionMeta = {};
          try {
            const metaFile = path.join(sessionPath, 'metadata.json');
            const metaData = await fs.readFile(metaFile, 'utf8');
            sessionMeta = JSON.parse(metaData);
          } catch {
            // Usa metadati globali come fallback
            sessionMeta = metadata[sessionId] || {};
          }
          
          sessions.push({
            id: sessionId,
            name: sessionMeta.name || entry.name,
            createdAt: sessionMeta.createdAt || (await fs.stat(sessionPath)).birthtime.toISOString(),
            lastAccessed: sessionMeta.lastAccessed || new Date().toISOString(),
            basePath: sessionPath,
            testCasesCount,
            status: sessionMeta.status || 'active'
          });
        }
      }
    } catch (err) {
      // Directory non esiste ancora, ritorna array vuoto
      if (err.code !== 'ENOENT') throw err;
    }

    // Ordina per ultimo accesso (più recente prima)
    sessions.sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));

    res.json({ sessions });
  } catch (error) {
    console.error('Errore lettura sessioni:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/sessions
 * Crea una nuova sessione
 */
router.post('/', async (req, res) => {
  try {
    const { name, basePath: customBasePath } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Nome sessione richiesto' });
    }

    const basePath = customBasePath || getSessionsBasePath();
    const sessionId = `session-${randomUUID()}`;
    const sessionPath = path.join(basePath, sessionId);

    // Crea directory sessione
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'test_files'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'csv'), { recursive: true });

    // Crea metadata.json
    const metadata = {
      name: name.trim(),
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      status: 'active'
    };
    await fs.writeFile(
      path.join(sessionPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    // Salva nei metadati globali
    const globalMetadata = await getSessionsMetadata();
    globalMetadata[sessionId] = metadata;
    await saveSessionsMetadata(globalMetadata);

    res.json({
      session: {
        id: sessionId,
        name: metadata.name,
        createdAt: metadata.createdAt,
        lastAccessed: metadata.lastAccessed,
        basePath: sessionPath,
        testCasesCount: 0,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('Errore creazione sessione:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * PUT /api/sessions/:id
 * Aggiorna una sessione (es. rinomina)
 */
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lastAccessed } = req.body;

    const basePath = getSessionsBasePath();
    const sessionPath = path.join(basePath, id);

    // Verifica che la sessione esista
    try {
      await fs.access(sessionPath);
    } catch {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }

    // Aggiorna metadata.json
    const metadataPath = path.join(sessionPath, 'metadata.json');
    let metadata = {};
    try {
      const data = await fs.readFile(metadataPath, 'utf8');
      metadata = JSON.parse(data);
    } catch {
      // Crea nuovo metadata se non esiste
    }

    if (name) {
      metadata.name = name.trim();
    }
    if (lastAccessed) {
      metadata.lastAccessed = lastAccessed;
    } else {
      metadata.lastAccessed = new Date().toISOString();
    }
    
    await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf8');

    // Aggiorna metadati globali
    const globalMetadata = await getSessionsMetadata();
    globalMetadata[id] = metadata;
    await saveSessionsMetadata(globalMetadata);

    res.json({ success: true, session: metadata });
  } catch (error) {
    console.error('Errore aggiornamento sessione:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/sessions/:id
 * Elimina una sessione
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { keepFiles } = req.query; // Query param opzionale

    const basePath = getSessionsBasePath();
    const sessionPath = path.join(basePath, id);

    // Verifica che la sessione esista
    try {
      await fs.access(sessionPath);
    } catch {
      return res.status(404).json({ error: 'Sessione non trovata' });
    }

    if (keepFiles === 'true') {
      // Solo rimuovi dai metadati, mantieni i file
      const globalMetadata = await getSessionsMetadata();
      if (globalMetadata[id]) {
        globalMetadata[id].status = 'archived';
        await saveSessionsMetadata(globalMetadata);
      }
    } else {
      // Elimina completamente
      await fs.rm(sessionPath, { recursive: true, force: true });
      
      // Rimuovi dai metadati globali
      const globalMetadata = await getSessionsMetadata();
      delete globalMetadata[id];
      await saveSessionsMetadata(globalMetadata);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Errore eliminazione sessione:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/sessions/default-path
 * Ottiene il percorso predefinito per le sessioni
 */
router.get('/default-path', (req, res) => {
  const defaultPath = getSessionsBasePath();
  res.json({ path: defaultPath });
});

/**
 * POST /api/sessions/migrate-legacy
 * Migra i dati legacy (localStorage) in una sessione "Primeira"
 */
router.post('/migrate-legacy', async (req, res) => {
  try {
    const { legacyData } = req.body; // Dati da localStorage

    const basePath = getSessionsBasePath();
    const sessionId = 'session-primeira';
    const sessionPath = path.join(basePath, sessionId);

    // Crea directory sessione se non esiste
    await fs.mkdir(sessionPath, { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'test_files'), { recursive: true });
    await fs.mkdir(path.join(sessionPath, 'csv'), { recursive: true });

    // Crea metadata.json
    const metadata = {
      name: 'Primeira',
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      status: 'active',
      migrated: true,
      migratedAt: new Date().toISOString()
    };
    await fs.writeFile(
      path.join(sessionPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf8'
    );

    // Salva contesto se presente
    if (legacyData.context) {
      await fs.writeFile(
        path.join(sessionPath, 'context.json'),
        JSON.stringify(legacyData.context, null, 2),
        'utf8'
      );
    }

    // Salva test cases se presenti
    if (legacyData.testCases && Array.isArray(legacyData.testCases)) {
      await fs.writeFile(
        path.join(sessionPath, 'csv', 'legacy_test_cases.json'),
        JSON.stringify(legacyData.testCases, null, 2),
        'utf8'
      );
    }

    // Salva nei metadati globali
    const globalMetadata = await getSessionsMetadata();
    globalMetadata[sessionId] = metadata;
    await saveSessionsMetadata(globalMetadata);

    res.json({
      session: {
        id: sessionId,
        name: metadata.name,
        createdAt: metadata.createdAt,
        lastAccessed: metadata.lastAccessed,
        basePath: sessionPath,
        testCasesCount: legacyData.testCases?.length || 0,
        status: 'active',
        migrated: true
      }
    });
  } catch (error) {
    console.error('Errore migrazione dati legacy:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;

