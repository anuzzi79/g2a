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

const PREVIEW_WAIT_MS = 60 * 60 * 1000; // 60 minuti per lasciare il browser aperto
const PREVIEW_TERMINATION_PATTERNS = [
  'The automation client disconnected',
  'Cannot continue running tests',
  'Renderer process closed',
  'Renderer process crashed',
  'Browser exited unexpectedly',
  'The browser process unexpectedly exited',
  'The Test Runner unexpectedly exited',
  'Timed out waiting for the browser to connect',
  'App process exited unexpectedly'
];

let previewProcess = null;
let previewSpecFile = null;
let lastResolvedLauncher = 'npx cypress';
let previewStdoutListener = null;
let previewStderrListener = null;

// Riferimento al processo Cypress in esecuzione (per stop)
let runningCypressProcess = null;

// Cache in memoria per velocizzare - evita accessi filesystem ripetuti
let workspaceInitializedCache = false;
let cypressBinPathCache = null;

function buildCypressConfig(baseUrl = 'http://localhost:3000') {
  const safeBaseUrl = (baseUrl || 'http://localhost:3000').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `export default {
  e2e: {
    baseUrl: '${safeBaseUrl}',
    setupNodeEvents(on, config) {},
    supportFile: false,
    video: false,
    screenshotOnRunFailure: true,
    pageLoadTimeout: 30000,
    defaultCommandTimeout: 4000
  }
};`;
}

function buildRunArguments(headedMode, specFile, options = {}) {
  const { disableVideo = true } = options; // Default: video disabilitato per velocità
  const configParts = [];
  if (!disableVideo) {
    configParts.push('video=true');
  } else {
    configParts.push('video=false');
  }
  configParts.push('screenshotOnRunFailure=true');

  const args = [
    'run',
    `--config ${configParts.join(',')}`
  ];
  if (specFile) {
    // Specifica il file da eseguire per evitare di eseguire tutti i test
    args.push('--spec', specFile);
  }
  if (headedMode) {
    args.push('--headed', '--browser', 'chrome', '--no-exit');
  } else {
    args.push('--headless');
  }
  return args.join(' ');
}

async function saveUserTestFile(targetPath, testCode) {
  if (!targetPath) return null;
  const normalizedPath = path.resolve(targetPath);
  const dirPath = path.dirname(normalizedPath);
  await fs.mkdir(dirPath, { recursive: true });
  await fs.writeFile(normalizedPath, testCode, 'utf8');
  console.log('Test Cypress salvato su file locale:', normalizedPath);
  return normalizedPath;
}

async function stopPreviewSession(reason = 'manual') {
  // Ottimizzazione: se non c'è processo da fermare, esci subito
  if (!previewProcess) {
    return;
  }
  
  const processToKill = previewProcess;
  previewProcess = null;

  if (processToKill) {
    console.log(`Chiusura sessione di anteprima (${reason})...`);
    if (previewStdoutListener) {
      processToKill.stdout?.off('data', previewStdoutListener);
    }
    if (previewStderrListener) {
      processToKill.stderr?.off('data', previewStderrListener);
    }
    previewStdoutListener = null;
    previewStderrListener = null;

    if (!processToKill.killed) {
      try {
        processToKill.kill('SIGTERM');
      } catch (error) {
        console.warn('Impossibile terminare il processo di preview:', error.message);
      }
    }
  }

  if (previewSpecFile) {
    await fs.unlink(previewSpecFile).catch(() => {});
    previewSpecFile = null;
  }
}

async function startPreviewSession(testCode, targetUrl) {
  try {
    await stopPreviewSession();

    const e2eDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'e2e');
    await fs.mkdir(e2eDir, { recursive: true });

    const previewFile = path.join(e2eDir, 'g2a-preview.cy.js');
    const previewCode = `${testCode}

after(() => {
  cy.log('🔍 Anteprima attiva: la finestra di Cypress resterà aperta finché non la chiudi manualmente.');
  cy.wait(${PREVIEW_WAIT_MS});
});
`;
    await fs.writeFile(previewFile, previewCode, 'utf8');
    previewSpecFile = previewFile;

    const specRelative = path.relative(CYPRESS_WORKSPACE, previewFile).replace(/\\/g, '/');
    const previewArgs = buildRunArguments(true, specRelative, { disableVideo: true });
    const command = `${lastResolvedLauncher} ${previewArgs} 2>&1`;

    console.log('Avvio anteprima Cypress (browser resterà aperto)...');
    previewProcess = exec(command, {
      cwd: CYPRESS_WORKSPACE,
      env: {
        ...process.env,
        CYPRESS_baseUrl: targetUrl || 'http://localhost:3000'
      }
    }, (err) => {
      if (err) {
        console.error('La sessione di anteprima si è chiusa con errore:', err.message);
      } else {
        console.log('Sessione di anteprima terminata.');
      }
    });

    const handlePreviewOutput = (chunk) => {
      const text = chunk?.toString?.() || '';
      if (!text) return;
      if (PREVIEW_TERMINATION_PATTERNS.some(pattern => text.includes(pattern))) {
        stopPreviewSession('browser-closed');
      }
    };

    previewStdoutListener = handlePreviewOutput;
    previewStderrListener = handlePreviewOutput;
    previewProcess.stdout?.on('data', previewStdoutListener);
    previewProcess.stderr?.on('data', previewStderrListener);

    previewProcess.on('exit', async () => {
      previewProcess = null;
      previewStdoutListener = null;
      previewStderrListener = null;
      await fs.unlink(previewFile).catch(() => {});
      previewSpecFile = null;
    });
  } catch (error) {
    console.error('Impossibile avviare la sessione di anteprima:', error);
  }
}

async function cleanE2EDirectory() {
  const e2eDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'e2e');
  await fs.mkdir(e2eDir, { recursive: true });
  // Ottimizzazione: elimina solo il file di test specifico invece di leggere tutta la directory
  // Questo è molto più veloce quando ci sono molti file
  const testFile = path.join(e2eDir, 'g2a-test.cy.js');
  await fs.unlink(testFile).catch(() => {});
  return e2eDir;
}

// Funzione per inizializzare Cypress workspace (chiamata una sola volta)
async function initializeCypressWorkspace() {
  // Cache in memoria - evita accessi filesystem se già inizializzato
  if (workspaceInitializedCache) {
    return;
  }

  const workspaceInitialized = path.join(CYPRESS_WORKSPACE, '.initialized');
  const binToCheck = process.platform === 'win32' ? CYPRESS_BIN_WIN : CYPRESS_BIN_UNIX;

  // Verifica marker e binario
  let isInitialized = false;
  try {
    await fs.access(workspaceInitialized);
    await fs.access(binToCheck);
    console.log('Cypress workspace già inizializzato e Cypress installato');
    isInitialized = true;
    workspaceInitializedCache = true; // Imposta cache
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
    workspaceInitializedCache = true; // Imposta cache dopo installazione
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
    const keepBrowserOpen = options.keepBrowserOpen ?? false;
    const outputFilePath = typeof options.outputFilePath === 'string'
      ? options.outputFilePath.trim()
      : '';

    if (!code || !code.trim()) {
      return res.status(400).json({ error: 'Codice Cypress richiesto' });
    }

    // Inizializza workspace se necessario (solo al primo utilizzo) - ora con cache!
    await initializeCypressWorkspace();

    // Ferma preview in background (non bloccare se fallisce)
    stopPreviewSession().catch(err => {
      console.warn('Errore fermando preview session (continuo comunque):', err.message);
    });

    // Pulisci directory e2e (questa è critica)
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
    const configBaseUrl = targetUrl || 'http://localhost:3000';
    
    // Esegui scritture file in parallelo - molto più veloce!
    const screenshotsDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'screenshots');
    const videosDir = path.join(CYPRESS_WORKSPACE, 'cypress', 'videos');
    
    // NON pulire screenshots/videos ad ogni run - solo assicurati che le directory esistano
    // Questo accelera MOLTO l'avvio (fs.rm ricorsivo è lentissimo con molti file)
    await Promise.all([
      fs.writeFile(testFile, testCode, 'utf8'),
      fs.writeFile(
        path.join(CYPRESS_WORKSPACE, 'cypress.config.js'),
        buildCypressConfig(configBaseUrl),
        'utf8'
      ),
      fs.mkdir(screenshotsDir, { recursive: true }).catch(() => {}),
      fs.mkdir(videosDir, { recursive: true }).catch(() => {})
    ]);

    // Prepara il comando Cypress (dichiarato fuori dal try per accesso in catch)
    let cypressCommand = '';
    
    const normalizedOutputPath = outputFilePath ? path.resolve(outputFilePath) : '';
    let savedFilePath = null;
    let saveFileError = null;

    if (normalizedOutputPath) {
      try {
        savedFilePath = await saveUserTestFile(normalizedOutputPath, testCode);
      } catch (fileError) {
        saveFileError = fileError.message;
        console.error('Errore salvataggio file utente:', fileError);
      }
    }

    try {
      // Esegui il test (NON reinstalla Cypress!)
      // Verifica che Cypress sia installato prima di eseguire
      const cypressBinPath = path.join(CYPRESS_WORKSPACE, 'node_modules', '.bin', 'cypress');
      const cypressBinPathWin = cypressBinPath + '.cmd'; // Per Windows
      
      // Calcola il path relativo del file di test per --spec
      const specFileRelative = path.relative(CYPRESS_WORKSPACE, testFile).replace(/\\/g, '/');
      
      // Usa cache del binario se disponibile - evita accessi filesystem ripetuti
      if (cypressBinPathCache) {
        lastResolvedLauncher = cypressBinPathCache;
        const runArgs = buildRunArguments(headedMode, specFileRelative);
        cypressCommand = `${lastResolvedLauncher} ${runArgs} 2>&1`;
      } else {
        // Cerca binario solo se non in cache
        try {
          // Prova prima con il binario locale (Windows)
          await fs.access(cypressBinPathWin);
          cypressBinPathCache = `"${cypressBinPathWin}"`;
          lastResolvedLauncher = cypressBinPathCache;
          const runArgs = buildRunArguments(headedMode, specFileRelative);
          cypressCommand = `${lastResolvedLauncher} ${runArgs} 2>&1`;
        } catch (e1) {
          try {
            // Prova con il binario locale (Unix)
            await fs.access(cypressBinPath);
            cypressBinPathCache = `"${cypressBinPath}"`;
            lastResolvedLauncher = cypressBinPathCache;
            const runArgs = buildRunArguments(headedMode, specFileRelative);
            cypressCommand = `${lastResolvedLauncher} ${runArgs} 2>&1`;
          } catch (e2) {
            // Fallback a npx
            cypressBinPathCache = 'npx cypress';
            lastResolvedLauncher = cypressBinPathCache;
            const runArgs = buildRunArguments(headedMode, specFileRelative);
            cypressCommand = `${lastResolvedLauncher} ${runArgs} 2>&1`;
          }
        }
      }
      
      // Usa exec invece di execAsync per avere controllo sul processo
      let stdout = '';
      let stderr = '';
      
      const cypressProcess = exec(cypressCommand, {
        cwd: CYPRESS_WORKSPACE,
        env: { 
          ...process.env, 
          CYPRESS_baseUrl: targetUrl || 'http://localhost:3000',
          NO_COLOR: '1',
          FORCE_COLOR: '0'
        },
        maxBuffer: 10 * 1024 * 1024
      });
      
      // Mantieni riferimento al processo per poterlo fermare
      runningCypressProcess = cypressProcess;
      
      // Raccogli output
      cypressProcess.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      
      cypressProcess.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });
      
      // Attendi completamento o timeout
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!cypressProcess.killed) {
            cypressProcess.kill('SIGTERM');
            reject(new Error('Timeout: il test ha impiegato troppo tempo (3 minuti)'));
          }
        }, 180000); // 3 minuti
        
        cypressProcess.on('exit', (code, signal) => {
          clearTimeout(timeout);
          runningCypressProcess = null;
          if (signal === 'SIGTERM') {
            // Processo fermato manualmente
            const error = new Error('Esecuzione fermata dall\'utente');
            error.code = 'STOPPED';
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
          } else if (code === 0) {
            resolve();
          } else {
            const error = new Error(`Process exited with code ${code}`);
            error.code = code;
            error.stdout = stdout;
            error.stderr = stderr;
            reject(error);
          }
        });
        
        cypressProcess.on('error', (err) => {
          clearTimeout(timeout);
          runningCypressProcess = null;
          reject(err);
        });
      });
      
      let screenshots = [];
      let video = null;

      // Leggi screenshots e video in parallelo per velocizzare
      try {
        const [screenshotFiles, videoFiles] = await Promise.all([
          fs.readdir(screenshotsDir).catch(() => []),
          fs.readdir(videosDir).catch(() => [])
        ]);
        
        // Processa solo i primi screenshot (non tutti) per velocità
        const pngFiles = screenshotFiles.filter(f => f.endsWith('.png')).slice(0, 5);
        const screenshotPromises = pngFiles.map(async (file) => {
          try {
            const filePath = path.join(screenshotsDir, file);
            const stats = await fs.stat(filePath);
            if (stats.isFile()) {
              const base64 = await fs.readFile(filePath, 'base64');
              return `data:image/png;base64,${base64}`;
            }
          } catch (e) {
            return null;
          }
        });
        
        // Carica video solo se disponibile e non disabilitato
        const disableVideo = options?.disableVideo ?? true; // Default: video disabilitato
        const videoPromise = (!disableVideo && videoFiles && videoFiles.length > 0)
          ? (async () => {
              try {
                const videoPath = path.join(videosDir, videoFiles[0]);
                const base64 = await fs.readFile(videoPath, 'base64');
                return `data:video/mp4;base64,${base64}`;
              } catch (e) {
                return null;
              }
            })()
          : Promise.resolve(null);
        
        // Esegui tutto in parallelo
        const [screenshotResults, videoResult] = await Promise.all([
          Promise.all(screenshotPromises),
          videoPromise
        ]);
        
        screenshots = screenshotResults.filter(Boolean);
        video = videoResult;
      } catch (e) {
        // Ignora errori silenziosamente
      }

      // NON eliminare il workspace! Solo pulisci il file di test
      await fs.unlink(testFile).catch(() => {});

      if (headedMode && keepBrowserOpen) {
        startPreviewSession(testCode, targetUrl);
      }

      res.json({
        success: true,
        output: stdout,
        screenshots,
        video,
        savedFilePath,
        saveFileError
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
      
      if (headedMode && keepBrowserOpen) {
        startPreviewSession(testCode, targetUrl);
      }

      res.status(500).json({
        success: false,
        error: errorMessage,
        cypressError: cypressError,
        output: stdout || '',
        stderr: stderr || '',
        details: lastLines.substring(0, 3000), // Ultimi 3000 caratteri
        fullOutput: combinedOutput.substring(0, 8000), // Primi 8000 caratteri per debug
        testFileContent: testFileContent.substring(0, 1000), // Contenuto del file di test
        savedFilePath,
        saveFileError
      });
    }

  } catch (error) {
    console.error('Errore esecuzione Cypress:', error);
    console.error('Stack trace:', error.stack);
    runningCypressProcess = null;
    
    // Assicurati di rispondere anche se c'è stato un errore
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Errore esecuzione Cypress: ' + (error.message || 'Errore sconosciuto')
      });
    }
  }
});

/**
 * POST /api/cypress/stop
 * Ferma l'esecuzione Cypress in corso
 */
router.post('/stop', async (req, res) => {
  try {
    if (runningCypressProcess && !runningCypressProcess.killed) {
      console.log('Fermata esecuzione Cypress richiesta dall\'utente...');
      runningCypressProcess.kill('SIGTERM');
      runningCypressProcess = null;
      res.json({ success: true, message: 'Esecuzione fermata con successo' });
    } else {
      res.json({ success: false, message: 'Nessuna esecuzione in corso' });
    }
  } catch (error) {
    console.error('Errore fermata esecuzione:', error);
    res.status(500).json({
      success: false,
      error: 'Errore fermata esecuzione: ' + error.message
    });
  }
});

/**
 * POST /api/cypress/save-file
 * Salva codice Cypress in un file senza eseguirlo
 */
router.post('/save-file', async (req, res) => {
  try {
    console.log('=== SAVE FILE REQUEST ===');
    console.log('Body ricevuto:', { 
      hasCode: !!req.body.code, 
      codeLength: req.body.code?.length || 0,
      filePath: req.body.filePath 
    });

    const { code, filePath } = req.body;

    if (!code || !code.trim()) {
      console.error('ERRORE: Codice Cypress mancante');
      return res.status(400).json({ error: 'Codice Cypress richiesto' });
    }

    if (!filePath || !filePath.trim()) {
      console.error('ERRORE: Percorso file mancante');
      return res.status(400).json({ error: 'Percorso file richiesto' });
    }

    const normalizedPath = path.resolve(filePath.trim());
    console.log('Percorso normalizzato:', normalizedPath);
    
    // Crea la directory se non esiste
    const dir = path.dirname(normalizedPath);
    console.log('Directory da creare:', dir);
    
    try {
      await fs.mkdir(dir, { recursive: true });
      console.log('Directory creata/verificata con successo');
    } catch (mkdirError) {
      console.error('ERRORE creazione directory:', mkdirError);
      throw new Error(`Impossibile creare directory: ${mkdirError.message}`);
    }

    // Verifica che la directory esista
    try {
      const dirStats = await fs.stat(dir);
      if (!dirStats.isDirectory()) {
        throw new Error(`Il percorso ${dir} non è una directory`);
      }
      console.log('Directory verificata:', dir);
    } catch (statError) {
      console.error('ERRORE verifica directory:', statError);
      throw new Error(`Directory non accessibile: ${statError.message}`);
    }

    // Salva il file
    console.log('Tentativo salvataggio file...');
    try {
      await fs.writeFile(normalizedPath, code, 'utf8');
      console.log(`✅ File salvato con successo: ${normalizedPath}`);
      
      // Verifica che il file sia stato creato
      const fileStats = await fs.stat(normalizedPath);
      console.log(`File verificato - Dimensione: ${fileStats.size} bytes`);
    } catch (writeError) {
      console.error('ERRORE scrittura file:', writeError);
      console.error('Stack:', writeError.stack);
      throw new Error(`Impossibile scrivere file: ${writeError.message}`);
    }

    res.json({
      success: true,
      filePath: normalizedPath,
      message: `File salvato: ${normalizedPath}`
    });
  } catch (error) {
    console.error('=== ERRORE SALVATAGGIO FILE ===');
    console.error('Errore:', error);
    console.error('Stack:', error.stack);
    res.status(500).json({
      success: false,
      error: 'Errore salvataggio file: ' + error.message,
      details: error.stack
    });
  }
});

/**
 * POST /api/cypress/parse-test-file
 * Parsa un file Cypress e estrae le fasi Given/When/Then
 */
router.post('/parse-test-file', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath || !filePath.trim()) {
      return res.status(400).json({ error: 'Percorso file richiesto' });
    }

    const normalizedPath = path.resolve(filePath.trim());
    
    console.log('=== PARSING TEST FILE ===');
    console.log('Percorso file:', normalizedPath);
    
    // Leggi il file
    let fileContent;
    try {
      fileContent = await fs.readFile(normalizedPath, 'utf8');
      console.log('File letto, dimensione:', fileContent.length, 'caratteri');
    } catch (readError) {
      console.error('Errore lettura file:', readError);
      return res.status(404).json({ error: `File non trovato: ${normalizedPath}` });
    }

    // Estrai le fasi dal codice
    const phases = {
      given: '',
      when: '',
      then: ''
    };

    // Pattern per trovare le fasi usando i commenti ===== PHASE =====
    const givenMatch = fileContent.match(/\/\/\s*=====\s*GIVEN\s*PHASE\s*=====([\s\S]*?)(?=\/\/\s*=====\s*(WHEN|THEN)\s*PHASE\s*=====|it\(|describe\(|$)/i);
    const whenMatch = fileContent.match(/\/\/\s*=====\s*WHEN\s*PHASE\s*=====([\s\S]*?)(?=\/\/\s*=====\s*(THEN|GIVEN)\s*PHASE\s*=====|it\(|describe\(|$)/i);
    const thenMatch = fileContent.match(/\/\/\s*=====\s*THEN\s*PHASE\s*=====([\s\S]*?)(?=\/\/\s*=====\s*(GIVEN|WHEN)\s*PHASE\s*=====|it\(|describe\(|$)/i);

    console.log('Match trovati:', {
      given: !!givenMatch,
      when: !!whenMatch,
      then: !!thenMatch
    });

    if (givenMatch) {
      let givenCode = givenMatch[1].trim();
      // Rimuovi cy.log se presente
      givenCode = givenCode.replace(/cy\.log\(['"][🔵🟡🟢]\s*(GIVEN|WHEN|THEN):.*?['"]\);/g, '').trim();
      // Rimuovi indentazione eccessiva (mantieni solo quella necessaria)
      const lines = givenCode.split('\n');
      if (lines.length > 0) {
        // Trova l'indentazione minima
        const minIndent = lines
          .filter(line => line.trim())
          .reduce((min, line) => {
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            return Math.min(min, indent);
          }, Infinity);
        
        // Rimuovi indentazione comune
        if (minIndent > 0 && minIndent < Infinity) {
          givenCode = lines.map(line => {
            if (line.trim()) {
              return line.substring(minIndent);
            }
            return line;
          }).join('\n');
        }
      }
      phases.given = givenCode.trim();
      console.log('Given code estratto, lunghezza:', phases.given.length);
    }

    if (whenMatch) {
      let whenCode = whenMatch[1].trim();
      whenCode = whenCode.replace(/cy\.log\(['"][🔵🟡🟢]\s*(GIVEN|WHEN|THEN):.*?['"]\);/g, '').trim();
      // Rimuovi indentazione eccessiva
      const lines = whenCode.split('\n');
      if (lines.length > 0) {
        const minIndent = lines
          .filter(line => line.trim())
          .reduce((min, line) => {
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            return Math.min(min, indent);
          }, Infinity);
        
        if (minIndent > 0 && minIndent < Infinity) {
          whenCode = lines.map(line => {
            if (line.trim()) {
              return line.substring(minIndent);
            }
            return line;
          }).join('\n');
        }
      }
      phases.when = whenCode.trim();
      console.log('When code estratto, lunghezza:', phases.when.length);
    }

    if (thenMatch) {
      let thenCode = thenMatch[1].trim();
      thenCode = thenCode.replace(/cy\.log\(['"][🔵🟡🟢]\s*(GIVEN|WHEN|THEN):.*?['"]\);/g, '').trim();
      // Rimuovi indentazione eccessiva
      const lines = thenCode.split('\n');
      if (lines.length > 0) {
        const minIndent = lines
          .filter(line => line.trim())
          .reduce((min, line) => {
            const indent = line.match(/^(\s*)/)?.[1]?.length || 0;
            return Math.min(min, indent);
          }, Infinity);
        
        if (minIndent > 0 && minIndent < Infinity) {
          thenCode = lines.map(line => {
            if (line.trim()) {
              return line.substring(minIndent);
            }
            return line;
          }).join('\n');
        }
      }
      phases.then = thenCode.trim();
      console.log('Then code estratto, lunghezza:', phases.then.length);
    }

    console.log('Parsing completato:', {
      hasGiven: phases.given.length > 0,
      hasWhen: phases.when.length > 0,
      hasThen: phases.then.length > 0
    });

    res.json({
      success: true,
      phases,
      message: 'File parsato con successo'
    });
  } catch (error) {
    console.error('Errore parsing file:', error);
    res.status(500).json({
      success: false,
      error: 'Errore parsing file: ' + error.message
    });
  }
});

export default router;

