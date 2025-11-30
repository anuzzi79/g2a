// backend/routes/cypress.js
import express from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const router = express.Router();

// Directory Cypress persistente nel progetto
const CYPRESS_WORKSPACE = path.resolve(process.cwd(), 'cypress-workspace');

const CYPRESS_BIN_WIN = path.join(CYPRESS_WORKSPACE, 'node_modules', '.bin', 'cypress.cmd');
const CYPRESS_BIN_UNIX = path.join(CYPRESS_WORKSPACE, 'node_modules', '.bin', 'cypress');

function buildCypressConfig(baseUrl = 'http://localhost:3000') {
  const safeBaseUrl = (baseUrl || 'http://localhost:3000').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `export default {
  e2e: {
    baseUrl: '${safeBaseUrl}',
    setupNodeEvents(on, config) {},
    supportFile: false,
    video: true,
    screenshotOnRunFailure: true
  }
};`;
}

function buildRunArguments(headedMode, specFile) {
  const args = [
    'run',
    '--config video=true,screenshotOnRunFailure=true'
  ];
  if (specFile) {
    // Specifica il file da eseguire per evitare di eseguire tutti i test
    args.push('--spec', specFile);
  }
  if (headedMode) {
    args.push('--headed', '--browser', 'chrome');
  } else {
    args.push('--headless');
  }
  return args.join(' ');
}

async function cleanE2EDirectory() {
  const e2eDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'e2e');
  await fs.mkdir(e2eDir, { recursive: true });
  const files = await fs.readdir(e2eDir).catch(() => []);
  await Promise.all(files.map(async (file) => {
    if (file.endsWith('.cy.js') || file.endsWith('.cy.ts')) {
      await fs.unlink(path.join(e2eDir, file)).catch(() => {});
    }
  }));
  return e2eDir;
}

// Funzione per inizializzare Cypress workspace (chiamata una sola volta)
async function initializeCypressWorkspace() {
  const workspaceInitialized = path.join(CYPRESS_WORKSPACE, '.initialized');
  const binToCheck = process.platform === 'win32' ? CYPRESS_BIN_WIN : CYPRESS_BIN_UNIX;

  // Verifica marker e binario
  let isInitialized = false;
  try {
    await fs.access(workspaceInitialized);
    await fs.access(binToCheck);
    console.log('Cypress workspace già inizializzato e Cypress installato');
    isInitialized = true;
  } catch (e) {
    console.log('Cypress workspace non inizializzato o binario mancante:', e.message);
  }

  if (isInitialized) {
    return;
  }

  // Se il marker esiste ma il binario no, forza reinstallazione completa
  await fs.rm(CYPRESS_WORKSPACE, { recursive: true, force: true }).catch(() => {});

  console.log('Inizializzazione Cypress workspace (solo al primo avvio)...');
  console.log('Directory workspace:', CYPRESS_WORKSPACE);
  await fs.mkdir(CYPRESS_WORKSPACE, { recursive: true });
  await fs.mkdir(path.join(CYPRESS_WORKSPACE, 'cypress', 'e2e'), { recursive: true });

  // Crea package.json
  const packageJson = {
    name: 'g2a-cypress-workspace',
    version: '1.0.0',
    scripts: {
      test: 'cypress run'
    },
    devDependencies: {
      cypress: '^15.7.0'
    }
  };
  await fs.writeFile(
    path.join(CYPRESS_WORKSPACE, 'package.json'),
    JSON.stringify(packageJson, null, 2),
    'utf8'
  );

  // Crea cypress.config.js base
  await fs.writeFile(
    path.join(CYPRESS_WORKSPACE, 'cypress.config.js'),
    buildCypressConfig(),
    'utf8'
  );

  // Installa Cypress (UNA SOLA VOLTA)
  try {
    console.log('Installazione Cypress nel workspace (questo richiederà 1-2 minuti solo la prima volta)...');
    await execAsync('npm install --no-save --legacy-peer-deps', {
      cwd: CYPRESS_WORKSPACE,
      timeout: 180000, // 3 minuti per la prima installazione
      env: { ...process.env, npm_config_progress: 'false', npm_config_loglevel: 'error' }
    });
    console.log('Cypress installato con successo nel workspace persistente');
    await fs.writeFile(workspaceInitialized, Date.now().toString(), 'utf8');
  } catch (installError) {
    console.error('Errore installazione Cypress:', installError.message);
    throw installError;
  }
}

/**
 * POST /api/cypress/run
 * Esegue codice Cypress utilizzando il workspace persistente
 */
router.post('/run', async (req, res) => {
  try {
    const { code, targetUrl, options = {} } = req.body;
    const headedMode = options.headed ?? false;

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Codice Cypress richiesto' });
    }

    // Inizializza workspace se necessario (solo al primo utilizzo)
    await initializeCypressWorkspace();

    console.log('Preparazione test Cypress...');
    console.log('URL target:', targetUrl || 'non specificato');
    console.log('Modalità visualizzazione:', headedMode ? 'headed (browser visibile)' : 'headless');

    // Pulisci la cartella e2e per evitare file residui
    const e2eDir = await cleanE2EDirectory();

    // Crea file di test nella directory workspace
    // Il codice utente potrebbe già contenere describe/it, quindi lo usiamo direttamente se presente
    let testCode;
    if (code.trim().includes('describe(') || code.trim().includes('it(')) {
      // Il codice già contiene describe/it, usalo direttamente
      testCode = code;
    } else {
      // Wrappa il codice in describe/it
      const escapedCode = code.replace(/`/g, '\\`').replace(/\${/g, '\\${');
      testCode = targetUrl 
        ? `describe('G2A Test', () => {\n  it('runs the code', () => {\n    cy.visit('${targetUrl}');\n    ${escapedCode}\n  });\n});`
        : `describe('G2A Test', () => {\n  it('runs the code', () => {\n    ${escapedCode}\n  });\n});`;
    }

    const testFile = path.join(e2eDir, 'g2a-test.cy.js');
    await fs.writeFile(testFile, testCode, 'utf8');
    console.log('File di test creato:', testFile);
    console.log('Contenuto test (primi 500 caratteri):', testCode.substring(0, 500));

    // Aggiorna cypress.config.js (usa targetUrl se fornito)
    const configBaseUrl = targetUrl || 'http://localhost:3000';
    await fs.writeFile(
      path.join(CYPRESS_WORKSPACE, 'cypress.config.js'),
      buildCypressConfig(configBaseUrl),
      'utf8'
    );

    // Pulisci screenshot/video precedenti (opzionale)
    const screenshotsDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'screenshots');
    const videosDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'videos');
    await fs.rm(screenshotsDir, { recursive: true, force: true }).catch(() => {});
    await fs.rm(videosDir, { recursive: true, force: true }).catch(() => {});
    await fs.mkdir(screenshotsDir, { recursive: true }).catch(() => {});
    await fs.mkdir(videosDir, { recursive: true }).catch(() => {});

    // Prepara il comando Cypress (dichiarato fuori dal try per accesso in catch)
    let cypressCommand = '';
    
    try {
      // Esegui il test (NON reinstalla Cypress!)
      console.log('Esecuzione test Cypress...');
      console.log('Codice test:', testCode.substring(0, 200) + '...');
      
      // Verifica che Cypress sia installato prima di eseguire
      const cypressBinPath = path.join(CYPRESS_WORKSPACE, 'node_modules', '.bin', 'cypress');
      const cypressBinPathWin = cypressBinPath + '.cmd'; // Per Windows
      
      console.log('Cercando Cypress binario locale...');
      console.log('Path Windows:', cypressBinPathWin);
      console.log('Path Unix:', cypressBinPath);
      // Calcola il path relativo del file di test per --spec
      const specFileRelative = path.relative(CYPRESS_WORKSPACE, testFile).replace(/\\/g, '/');
      
      try {
        // Prova prima con il binario locale (Windows)
        await fs.access(cypressBinPathWin);
        const runArgs = buildRunArguments(headedMode, specFileRelative);
        cypressCommand = `"${cypressBinPathWin}" ${runArgs} 2>&1`;
        console.log('✓ Usando Cypress locale (Windows):', cypressCommand);
      } catch (e1) {
        console.log('✗ Binario Windows non trovato:', e1.message);
        try {
          // Prova con il binario locale (Unix)
          await fs.access(cypressBinPath);
          const runArgs = buildRunArguments(headedMode, specFileRelative);
          cypressCommand = `"${cypressBinPath}" ${runArgs} 2>&1`;
          console.log('✓ Usando Cypress locale (Unix):', cypressCommand);
        } catch (e2) {
          console.log('✗ Binario Unix non trovato:', e2.message);
          // Fallback a npm run che trova automaticamente il binario locale
          const runArgs = buildRunArguments(headedMode, specFileRelative);
          cypressCommand = `npx cypress ${runArgs} 2>&1`;
          console.log('⚠ Usando npm run (fallback):', cypressCommand);
        }
      }
      
      console.log('Comando finale che verrà eseguito:', cypressCommand);
      
      const { stdout, stderr } = await execAsync(cypressCommand, {
        cwd: CYPRESS_WORKSPACE, // Usa il workspace persistente
        timeout: 180000, // 3 minuti timeout per l'esecuzione
        env: { 
          ...process.env, 
          CYPRESS_baseUrl: targetUrl || 'http://localhost:3000',
          NO_COLOR: '1', // Disabilita colori per output più pulito
          FORCE_COLOR: '0' // Disabilita colori anche per processi child
        },
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer per output
      });
      
      let screenshots = [];
      let video = null;

      try {
        const screenshotFiles = await fs.readdir(screenshotsDir).catch(() => []);
        for (const file of screenshotFiles) {
          const filePath = path.join(screenshotsDir, file);
          const stats = await fs.stat(filePath);
          if (stats.isFile() && file.endsWith('.png')) {
            const base64 = await fs.readFile(filePath, 'base64');
            screenshots.push(`data:image/png;base64,${base64}`);
          }
        }
      } catch (e) {
        console.log('Nessuno screenshot trovato');
      }

      try {
        const videoFiles = await fs.readdir(videosDir).catch(() => []);
        if (videoFiles.length > 0) {
          const videoPath = path.join(videosDir, videoFiles[0]);
          const base64 = await fs.readFile(videoPath, 'base64');
          video = `data:video/mp4;base64,${base64}`;
        }
      } catch (e) {
        console.log('Nessun video trovato');
      }

      // NON eliminare il workspace! Solo pulisci il file di test
      await fs.unlink(testFile).catch(() => {});

      res.json({
        success: true,
        output: stdout,
        screenshots,
        video
      });

    } catch (execError) {
      // NON eliminare il workspace! Mantieni l'installazione di Cypress

      console.error('Errore esecuzione Cypress:', execError);
      console.error('execError.code:', execError.code);
      console.error('execError.message:', execError.message);
      console.error('execError.stdout (primi 2000 caratteri):', execError.stdout?.substring(0, 2000));
      console.error('execError.stderr (primi 2000 caratteri):', execError.stderr?.substring(0, 2000));
      console.error('Comando eseguito:', cypressCommand);
      
      // Cattura tutti i dettagli dell'errore
      const stdout = execError.stdout || '';
      const stderr = execError.stderr || '';
      const combinedOutput = (stdout + '\n' + stderr).trim();
      
      // Prova a leggere il file di test per vedere cosa è stato eseguito
      let testFileContent = '';
      try {
        testFileContent = await fs.readFile(testFile, 'utf8');
        console.log('Contenuto file di test:', testFileContent.substring(0, 500));
      } catch (e) {
        console.log('Impossibile leggere file di test:', e.message);
      }
      
      // Estrai informazioni utili dall'output
      let errorMessage = execError.message;
      let errorDetails = combinedOutput || '';
      
      // Se l'output è vuoto, prova a leggere i log di Cypress
      if (!errorDetails || errorDetails.length < 50) {
        try {
          const cypressLogsDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'logs');
          const logFiles = await fs.readdir(cypressLogsDir).catch(() => []);
          if (logFiles.length > 0) {
            const lastLog = logFiles[logFiles.length - 1];
            const logContent = await fs.readFile(path.join(cypressLogsDir, lastLog), 'utf8').catch(() => '');
            if (logContent) {
              errorDetails = logContent.substring(-2000); // Ultimi 2000 caratteri
            }
          }
        } catch (e) {
          console.log('Impossibile leggere log Cypress:', e.message);
        }
      }
      
      // Cerca messaggi di errore specifici di Cypress
      if (errorDetails.includes('cypress') && errorDetails.includes('not found')) {
        errorMessage = 'Cypress non è stato installato correttamente. Verifica che sia disponibile nel sistema.';
      } else if (errorDetails.includes('Timed out')) {
        errorMessage = 'Timeout: il test ha impiegato troppo tempo. Verifica il codice o aumenta il timeout.';
      } else if (errorDetails.includes('AssertionError') || errorDetails.includes('expected')) {
        errorMessage = 'Il test è fallito: verifica fallita durante l\'esecuzione.';
        // Estrai la parte dell'asserzione fallita
        const assertionMatch = errorDetails.match(/(expected .*? to .*?)/i);
        if (assertionMatch) {
          errorMessage += ' ' + assertionMatch[1];
        }
      } else if (errorDetails.includes('cy.get') || errorDetails.includes('Element not found')) {
        errorMessage = 'Elemento non trovato: il selettore utilizzato non corrisponde a nessun elemento nella pagina.';
      } else if (errorDetails.includes('Command failed')) {
        // Cerca dettagli più specifici nell'output
        const errorLines = errorDetails.split('\n').filter(line => 
          line.includes('Error') || 
          line.includes('FAIL') || 
          line.includes('failed') ||
          line.includes('AssertionError')
        );
        if (errorLines.length > 0) {
          errorMessage = `Errore esecuzione Cypress: ${errorLines[0].substring(0, 300)}`;
        } else {
          errorMessage = `Errore esecuzione Cypress: ${errorDetails.substring(0, 300)}`;
        }
      }

      // Prendi le ultime righe dell'output per più contesto
      const outputLines = combinedOutput.split('\n');
      const lastLines = outputLines.slice(-30).join('\n'); // Ultime 30 righe
      
      // Cerca errori specifici di Cypress nell'output
      let cypressError = '';
      if (combinedOutput.includes('AssertionError')) {
        const match = combinedOutput.match(/(AssertionError:[\s\S]{0,500})/);
        if (match) cypressError = match[1];
      } else if (combinedOutput.includes('Timed out')) {
        cypressError = 'Il test ha superato il tempo limite';
      } else if (combinedOutput.includes('SyntaxError') || combinedOutput.includes('Syntax Error')) {
        cypressError = 'Errore di sintassi nel codice Cypress';
      } else if (combinedOutput.includes('Element not found') || combinedOutput.includes('cy.get')) {
        const match = combinedOutput.match(/(cy\.get.*?not found[\s\S]{0,300})/i);
        if (match) cypressError = match[1];
      }
      
      res.status(500).json({
        success: false,
        error: errorMessage,
        cypressError: cypressError,
        output: stdout || '',
        stderr: stderr || '',
        details: lastLines.substring(0, 3000), // Ultimi 3000 caratteri
        fullOutput: combinedOutput.substring(0, 8000), // Primi 8000 caratteri per debug
        testFileContent: testFileContent.substring(0, 1000) // Contenuto del file di test
      });
    }

  } catch (error) {
    console.error('Errore esecuzione Cypress:', error);
    res.status(500).json({
      success: false,
      error: 'Errore esecuzione Cypress: ' + error.message
    });
  }
});

export default router;

