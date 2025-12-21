import fs from 'fs';
import path from 'path';
import cypressConfigService from './cypressConfig.js';
import codeValidatorService from './codeValidator.js';

class TestGeneratorService {
  /**
   * Genera un unico file Cypress da una lista di test cases
   */
  async generateTestSuite(testSuiteData) {
    try {
      const { suiteName, testCases, fileName, outputDir, preliminaryCode } = testSuiteData;
      
      const userConfig = cypressConfigService.loadConfiguration();
      if (!userConfig || !userConfig.cypressConfig) {
        throw new Error('Configurazione Cypress non trovata. Configura prima i file Cypress.');
      }
      
      const projectRoot = this.extractProjectRoot(userConfig.cypressConfig);
      const testCasesDir = path.join(projectRoot, outputDir || 'test_cases');
      const fullFileName = fileName.endsWith('.cy.js') ? fileName : `${fileName}.cy.js`;
      const fullPath = path.join(testCasesDir, fullFileName);
      
      if (!fs.existsSync(testCasesDir)) {
        fs.mkdirSync(testCasesDir, { recursive: true });
      }
      
      // 1. Genera il contenuto grezzo
      let fileContent = this.buildTestFileContent(suiteName, testCases, userConfig, preliminaryCode);
      
      // 2. 🤖 "COMPILATORE ESPERTO" IN AZIONE
      try {
        const validationResult = codeValidatorService.validateAndFixCode(fileContent);
        if (validationResult.hasChanges) {
          fileContent = validationResult.fixedCode;
        }
        
        const formattedCode = codeValidatorService.formatCode(fileContent);
        if (formattedCode) {
             fileContent = formattedCode;
        }
      } catch (validationError) {
        console.error('⚠️ Errore validazione:', validationError);
      }
      
      fs.writeFileSync(fullPath, fileContent, 'utf-8');
      return {
        success: true,
        filePath: fullPath,
        relativePath: path.join(outputDir || 'test_cases', fullFileName),
        testCasesCount: testCases.length,
        projectRoot: projectRoot
      };
      
    } catch (error) {
      console.error('❌ Errore generazione:', error);
      return { success: false, error: error.message };
    }
  }
  
  extractProjectRoot(cypressConfigPath) {
    return path.dirname(cypressConfigPath);
  }
  
  /**
   * Costruisce il contenuto del file di test
   */
  buildTestFileContent(suiteName, testCases, userConfig, preliminaryCode = '') {
    const testBlocks = testCases
      .map((tc, index) => this.generateItBlock(tc, index))
      .join('\n\n');
    
    const cleanPreliminary = preliminaryCode ? preliminaryCode.trim() : '';

    // LOGICA INTELLIGENTE v3 (Analisi dello stato del blocco)
    if (cleanPreliminary && /(describe|context)\s*\(/.test(cleanPreliminary)) {
      
      // Controlliamo se il blocco describe è aperto o chiuso
      const openBraces = (cleanPreliminary.match(/\{/g) || []).length;
      const closeBraces = (cleanPreliminary.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        // CASO A: DESCRIBE APERTO (come nel tuo caso attuale)
        // Semplicemente appendiamo i test e lasciamo che il validatore chiuda tutto alla fine
        console.log('🧠 Describe APERTO rilevato. Appendendo i test...');
        return `${cleanPreliminary}\n\n${testBlocks}\n`;
      } else {
        // CASO B: DESCRIBE CHIUSO
        // Cerchiamo di iniettare PRIMA dell'ultima chiusura del describe
        console.log('🧠 Describe CHIUSO rilevato. Tentativo di iniezione interna...');
        const lastClosingBrace = cleanPreliminary.lastIndexOf('}');
        if (lastClosingBrace > -1) {
           const beforeClosing = cleanPreliminary.substring(0, lastClosingBrace);
           const afterClosing = cleanPreliminary.substring(lastClosingBrace);
           return `${beforeClosing}\n\n${testBlocks}\n${afterClosing}`;
        }
      }
    }

    // LOGICA STANDARD
    const headerCode = cleanPreliminary || this.generateImports(testCases, userConfig);
    return `${headerCode}\n\ndescribe('${this.escapeString(suiteName)}', () => {\n  before(() => {\n    cy.loginViaAPI();\n    cy.enterProject();\n  });\n\n${testBlocks}\n});\n`;
  }
  
  generateImports(testCases, userConfig) {
    const imports = [];
    const uniquePageObjects = new Set();
    testCases.forEach(tc => {
      if (tc.pageObjects && Array.isArray(tc.pageObjects)) {
        tc.pageObjects.forEach(po => uniquePageObjects.add(po));
      }
    });
    if (uniquePageObjects.size > 0 && userConfig.pagesDirectory) {
      const projectRoot = this.extractProjectRoot(userConfig.cypressConfig);
      const pagesDir = userConfig.pagesDirectory;
      uniquePageObjects.forEach(pageObjectName => {
        const pageObjectPath = path.join(pagesDir, `${pageObjectName}.js`);
        const normalizedPath = pageObjectPath.replace(/\\/g, '/');
        imports.push(`import ${pageObjectName} from '${normalizedPath}';`);
      });
    }
    return imports.join('\n');
  }
  
  generateItBlock(testCase, index) {
    const testNumber = testCase.id || (index + 1);
    const description = `Test Case #${testNumber}`;
    const hasGivenCode = testCase.givenCode && testCase.givenCode.trim();
    const hasWhenCode = testCase.whenCode && testCase.whenCode.trim();
    const hasThenCode = testCase.thenCode && testCase.thenCode.trim();
    const givenCode = hasGivenCode ? testCase.givenCode : this.convertGherkinToCode(testCase.given, 'given');
    const whenCode = hasWhenCode ? testCase.whenCode : this.convertGherkinToCode(testCase.when, 'when');
    const thenCode = hasThenCode ? testCase.thenCode : this.convertGherkinToCode(testCase.then, 'then');
    const givenText = this.escapeString(testCase.given || '');
    const whenText = this.escapeString(testCase.when || '');
    const thenText = this.escapeString(testCase.then || '');
    
    return `  it('${description}', () => {
    // Given: ${givenText}
${this.indentCode(givenCode, 4)}

    // When: ${whenText}
${this.indentCode(whenCode, 4)}

    // Then: ${thenText}
${this.indentCode(thenCode, 4)}
  });`;
  }
  
  convertGherkinToCode(gherkinText, section) {
    if (!gherkinText || !gherkinText.trim()) {
      return `    // TODO: Implementare la sezione ${section}`;
    }
    const lines = gherkinText.split('\n').filter(l => l.trim());
    const sectionUpper = section.toUpperCase();
    let code = `    // ${sectionUpper} - TODO: Implementare con Wide Reasoning\n`;
    lines.forEach((line, idx) => {
      code += `    // ${idx + 1}. ${line.trim()}\n`;
      code += `    // TODO: Cypress code here\n`;
      if (idx < lines.length - 1) code += '\n';
    });
    return code.trimEnd();
  }
  
  indentCode(code, spaces) {
    if (!code) return '';
    const indent = ' '.repeat(spaces);
    return code.split('\n').map(line => `${indent}${line}`).join('\n');
  }
  
  escapeString(str) {
    if (!str) return '';
    return str.replace(/'/g, "\\'").replace(/\n/g, '\\n');
  }
}

export default new TestGeneratorService();
