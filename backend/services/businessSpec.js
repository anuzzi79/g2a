// backend/services/businessSpec.js
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

// Helper per ottenere il percorso del file Business Spec
function getBusinessSpecPath(sessionId) {
  return path.join(getSessionsBasePath(), sessionId, 'business-spec.txt');
}

// Carica Business Spec da file
export async function loadBusinessSpec(sessionId) {
  try {
    const filePath = getBusinessSpecPath(sessionId);
    const data = await fs.readFile(filePath, 'utf8');
    return {
      text: data,
      updatedAt: (await fs.stat(filePath)).mtime.toISOString()
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File non esiste, ritorna documento vuoto
      return {
        text: '',
        updatedAt: new Date().toISOString()
      };
    }
    throw error;
  }
}

// Salva Business Spec
export async function saveBusinessSpec(sessionId, text) {
  if (typeof text !== 'string') {
    throw new Error('Il campo "text" deve essere una stringa');
  }

  const filePath = getBusinessSpecPath(sessionId);
  const dirPath = path.dirname(filePath);
  
  // Crea directory se non esiste
  await fs.mkdir(dirPath, { recursive: true });
  
  // Salva come file di testo semplice
  await fs.writeFile(filePath, text, 'utf8');
  
  return {
    text,
    updatedAt: new Date().toISOString()
  };
}

