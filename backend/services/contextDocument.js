// backend/services/contextDocument.js
import fs from 'fs/promises';
import path from 'path';

// Helper per ottenere il percorso base delle sessioni
function getSessionsBasePath() {
  const envPath = process.env.G2A_SESSIONS_PATH;
  if (envPath) {
    return path.resolve(envPath);
  }
  return path.resolve(process.cwd(), 'sessions');
}

// Helper per ottenere il percorso del file Documento di Contesto
function getContextDocumentPath(sessionId) {
  return path.join(getSessionsBasePath(), sessionId, 'context-document.json');
}

// Carica Documento di Contesto da file
export async function loadContextDocument(sessionId) {
  try {
    const filePath = getContextDocumentPath(sessionId);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return {
      version: parsed.version || 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: parsed.updatedAt || new Date().toISOString(),
      text: parsed.text || ''
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File non esiste, ritorna documento vuoto con metadata di default
      return {
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        text: ''
      };
    }
    throw error;
  }
}

// Salva Documento di Contesto
export async function saveContextDocument(sessionId, text) {
  if (typeof text !== 'string') {
    throw new Error('Il campo "text" deve essere una stringa');
  }

  const filePath = getContextDocumentPath(sessionId);
  const dirPath = path.dirname(filePath);
  
  // Crea directory se non esiste
  await fs.mkdir(dirPath, { recursive: true });
  
  // Carica documento esistente per preservare createdAt e version
  let document = {
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    text: ''
  };
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    document = {
      version: parsed.version || 1,
      createdAt: parsed.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      text: text
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
    // Se il file non esiste, usa i valori di default sopra
  }
  
  // Salva
  await fs.writeFile(filePath, JSON.stringify(document, null, 2), 'utf8');
  return document;
}


