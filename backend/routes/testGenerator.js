import express from 'express';
import testGeneratorService from '../services/testGenerator.js';
import fs from 'fs/promises';
import path from 'path';

const router = express.Router();

/**
 * POST /api/test-generator/generate-suite
 * Genera un unico file Cypress da una lista di test cases
 */
router.post('/generate-suite', async (req, res) => {
  console.log('🔔 POST /api/test-generator/generate-suite ricevuta');
  // console.log('📦 Body ricevuto:', JSON.stringify(req.body, null, 2)); // Troppo verboso
  
  try {
    let { suiteName, testCases, fileName, outputDir, preliminaryCode, sessionId } = req.body;
    
    // FALLBACK INTELLIGENTE:
    // Se preliminaryCode è vuoto ma abbiamo sessionId, proviamo a leggerlo dal file salvato
    if ((!preliminaryCode || !preliminaryCode.trim()) && sessionId) {
      console.log(`⚠️ Preliminary code vuoto nel body. Tento recupero da sessione ${sessionId}...`);
      try {
        // Costruisci path sessions (assumendo standard location o env)
        const sessionsPath = process.env.G2A_SESSIONS_PATH || path.resolve(process.cwd(), 'sessions');
        const codePath = path.join(sessionsPath, sessionId, 'preliminary-code.txt');
        
        const savedCode = await fs.readFile(codePath, 'utf8');
        if (savedCode && savedCode.trim()) {
          preliminaryCode = savedCode;
          console.log(`✅ Recuperato codice preliminare salvato (${savedCode.length} chars)`);
        } else {
          console.log('⚠️ Nessun codice salvato trovato o file vuoto.');
        }
      } catch (err) {
        console.log(`❌ Impossibile recuperare codice salvato: ${err.message}`);
      }
    }

    // Validazione input
    if (!suiteName || !testCases || !Array.isArray(testCases) || testCases.length === 0) {
      console.error('❌ Validazione fallita: parametri mancanti');
      return res.status(400).json({
        success: false,
        error: 'Parametri mancanti: suiteName, testCases (array non vuoto) sono obbligatori'
      });
    }
    
    if (!fileName) {
      console.error('❌ Validazione fallita: fileName mancante');
      return res.status(400).json({
        success: false,
        error: 'Parametro mancante: fileName è obbligatorio'
      });
    }
    
    console.log(`📝 Generazione test suite: ${suiteName}`);
    console.log(`   Test cases: ${testCases.length}`);
    console.log(`   File name: ${fileName}`);
    console.log(`   Output dir: ${outputDir || 'test_cases'}`);
    console.log(`   Preliminary code: ${preliminaryCode ? 'presente (' + preliminaryCode.length + ' chars)' : 'vuoto'}`);
    
    const result = await testGeneratorService.generateTestSuite({
      suiteName,
      testCases,
      fileName,
      outputDir: outputDir || 'test_cases',
      preliminaryCode // Passiamo il codice (eventualmente recuperato)
    });
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(500).json(result);
    }
    
  } catch (error) {
    console.error('Errore generazione test suite:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;

