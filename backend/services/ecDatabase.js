// backend/services/ecDatabase.js
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

// Helper per ottenere il percorso del file database oggetti EC
function getECObjectsPath(sessionId) {
  return path.join(getSessionsBasePath(), sessionId, 'ec-objects.json');
}

// Helper per ottenere il percorso del file database binomi
function getBinomiPath(sessionId) {
  return path.join(getSessionsBasePath(), sessionId, 'binomi-fondamentali.json');
}

// Carica oggetti EC da file
export async function loadECObjects(sessionId) {
  try {
    const filePath = getECObjectsPath(sessionId);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.objects || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      // File non esiste, ritorna array vuoto
      return [];
    }
    throw error;
  }
}

// Salva/aggiorna oggetto EC
export async function saveECObject(sessionId, object) {
  const filePath = getECObjectsPath(sessionId);
  const dirPath = path.dirname(filePath);
  
  // Crea directory se non esiste
  await fs.mkdir(dirPath, { recursive: true });
  
  // Carica oggetti esistenti
  let objects = [];
  let metadata = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    objects = parsed.objects || [];
    metadata = {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  // Aggiorna o aggiungi oggetto
  const existingIndex = objects.findIndex(obj => obj.id === object.id);
  if (existingIndex >= 0) {
    objects[existingIndex] = { ...objects[existingIndex], ...object };
  } else {
    objects.push(object);
  }
  
  // Salva
  const dataToSave = {
    ...metadata,
    objects
  };
  
  await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
  return object;
}

// Elimina oggetto EC
export async function deleteECObject(sessionId, objectId) {
  const filePath = getECObjectsPath(sessionId);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    const objects = (parsed.objects || []).filter(obj => obj.id !== objectId);
    
    const dataToSave = {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      objects
    };
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

// Filtra oggetti per test case
export async function getECObjectsByTestCase(sessionId, testCaseId) {
  const objects = await loadECObjects(sessionId);
  return objects.filter(obj => obj.testCaseId === String(testCaseId));
}

// Carica binomi da file
export async function loadBinomi(sessionId) {
  try {
    const filePath = getBinomiPath(sessionId);
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    return parsed.binomi || [];
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }
}

// Salva binomio
export async function saveBinomio(sessionId, binomio) {
  const filePath = getBinomiPath(sessionId);
  const dirPath = path.dirname(filePath);
  
  // Crea directory se non esiste
  await fs.mkdir(dirPath, { recursive: true });
  
  // Carica binomi esistenti
  let binomi = [];
  let metadata = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    binomi = parsed.binomi || [];
    metadata = {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString()
    };
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
  
  // Aggiorna o aggiungi binomio
  const existingIndex = binomi.findIndex(b => b.id === binomio.id);
  if (existingIndex >= 0) {
    binomi[existingIndex] = { ...binomi[existingIndex], ...binomio };
  } else {
    binomi.push(binomio);
  }
  
  // Salva
  const dataToSave = {
    ...metadata,
    binomi
  };
  
  await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
  return binomio;
}

// Elimina binomio
export async function deleteBinomio(sessionId, binomioId) {
  const filePath = getBinomiPath(sessionId);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    const binomi = (parsed.binomi || []).filter(b => b.id !== binomioId);
    
    const dataToSave = {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      binomi
    };
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

// Filtra binomi per test case
export async function getBinomiByTestCase(sessionId, testCaseId) {
  const binomi = await loadBinomi(sessionId);
  return binomi.filter(b => b.testCaseId === String(testCaseId));
}

// Elimina tutti i binomi associati a un oggetto EC
export async function deleteBinomiByObjectId(sessionId, objectId) {
  const filePath = getBinomiPath(sessionId);
  
  try {
    const data = await fs.readFile(filePath, 'utf8');
    const parsed = JSON.parse(data);
    const binomi = (parsed.binomi || []).filter(
      b => b.fromObjectId !== objectId && b.toObjectId !== objectId
    );
    
    const dataToSave = {
      version: parsed.version || '1.0',
      createdAt: parsed.createdAt || new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      binomi
    };
    
    await fs.writeFile(filePath, JSON.stringify(dataToSave, null, 2), 'utf8');
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}



