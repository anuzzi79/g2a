import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class CypressConfigService {
  constructor() {
    this.configFilePath = path.join(__dirname, '../../config/cypress-sources.json');
    this.ensureConfigDirectory();
  }

  /**
   * Assicura che la directory config esista
   */
  ensureConfigDirectory() {
    const configDir = path.dirname(this.configFilePath);
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Carica la configurazione salvata
   */
  loadConfiguration() {
    try {
      if (fs.existsSync(this.configFilePath)) {
        const configData = fs.readFileSync(this.configFilePath, 'utf8');
        return JSON.parse(configData);
      }
      return null;
    } catch (error) {
      console.error('Error loading configuration:', error);
      return null;
    }
  }

  /**
   * Valida che un file esista e sia leggibile
   */
  validateFile(filePath) {
    try {
      return fs.existsSync(filePath) && fs.statSync(filePath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Valida che una directory esista
   */
  validateDirectory(dirPath) {
    try {
      return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch (error) {
      return false;
    }
  }

  /**
   * Estrae tasks da cypress.config.js
   */
  extractTasksFromConfig(configPath) {
    try {
      const content = fs.readFileSync(configPath, 'utf8');
      const tasks = [];
      
      // Cerca la sezione on("task", { ... })
      const taskSectionMatch = content.match(/on\s*\(\s*["']task["']\s*,\s*\{([^}]+)\}/s);
      
      if (taskSectionMatch) {
        const taskSection = taskSectionMatch[1];
        // Estrae nomi funzioni (es. saveProjectId, getProjectId)
        const taskMatches = taskSection.matchAll(/(\w+)\s*\([^)]*\)\s*\{/g);
        
        for (const match of taskMatches) {
          tasks.push(match[1]);
        }
      }
      
      return tasks;
    } catch (error) {
      console.error('Error extracting tasks:', error);
      return [];
    }
  }

  /**
   * Estrae comandi custom da commands.js
   */
  extractCustomCommands(commandsPath) {
    try {
      const content = fs.readFileSync(commandsPath, 'utf8');
      const commands = [];
      
      // Cerca Cypress.Commands.add('nomeComando', ...)
      const commandMatches = content.matchAll(/Cypress\.Commands\.add\s*\(\s*['"](\w+)['"]/g);
      
      for (const match of commandMatches) {
        commands.push(match[1]);
      }
      
      return commands;
    } catch (error) {
      console.error('Error extracting commands:', error);
      return [];
    }
  }

  /**
   * Scansiona directory Page Objects
   */
  scanPageObjects(pagesPath) {
    try {
      const files = fs.readdirSync(pagesPath);
      const pageObjects = [];
      
      files.forEach(file => {
        if (file.endsWith('.js') || file.endsWith('.jsx')) {
          try {
            const filePath = path.join(pagesPath, file);
            const content = fs.readFileSync(filePath, 'utf8');
            
            // Cerca export class NomeClasse
            const classMatch = content.match(/export\s+class\s+(\w+)/);
            
            if (classMatch) {
              pageObjects.push({
                fileName: file,
                className: classMatch[1],
                filePath: filePath
              });
            }
          } catch (error) {
            console.error(`Error reading ${file}:`, error);
          }
        }
      });
      
      return pageObjects;
    } catch (error) {
      console.error('Error scanning page objects:', error);
      return [];
    }
  }

  /**
   * Legge package.json e estrae dipendenze
   */
  extractDependencies(packagePath) {
    try {
      const content = fs.readFileSync(packagePath, 'utf8');
      const packageJson = JSON.parse(content);
      
      return {
        dependencies: packageJson.dependencies || {},
        devDependencies: packageJson.devDependencies || {}
      };
    } catch (error) {
      console.error('Error extracting dependencies:', error);
      return { dependencies: {}, devDependencies: {} };
    }
  }

  /**
   * Scansiona e analizza tutti i file configurati
   */
  async analyzeConfiguration(config) {
    const analysis = {
      cypressConfig: { valid: false },
      envFile: { valid: false },
      packageFile: { valid: false },
      commandsFile: { valid: false },
      e2eFile: { valid: false },
      pagesDirectory: { valid: false }
    };

    // Analizza cypress.config.js
    if (config.cypressConfig && this.validateFile(config.cypressConfig)) {
      analysis.cypressConfig = {
        valid: true,
        path: config.cypressConfig,
        tasks: this.extractTasksFromConfig(config.cypressConfig),
        lastModified: fs.statSync(config.cypressConfig).mtime
      };
    }

    // Analizza cypress.env.json
    if (config.envFile && this.validateFile(config.envFile)) {
      analysis.envFile = {
        valid: true,
        path: config.envFile,
        protected: true, // File protetto (credenziali)
        lastModified: fs.statSync(config.envFile).mtime
      };
    }

    // Analizza package.json
    if (config.packageFile && this.validateFile(config.packageFile)) {
      const deps = this.extractDependencies(config.packageFile);
      analysis.packageFile = {
        valid: true,
        path: config.packageFile,
        dependencies: Object.keys(deps.dependencies).length,
        devDependencies: Object.keys(deps.devDependencies).length,
        lastModified: fs.statSync(config.packageFile).mtime
      };
    }

    // Analizza commands.js
    if (config.commandsFile && this.validateFile(config.commandsFile)) {
      analysis.commandsFile = {
        valid: true,
        path: config.commandsFile,
        commands: this.extractCustomCommands(config.commandsFile),
        lastModified: fs.statSync(config.commandsFile).mtime
      };
    }

    // Analizza e2e.js
    if (config.e2eFile && this.validateFile(config.e2eFile)) {
      analysis.e2eFile = {
        valid: true,
        path: config.e2eFile,
        lastModified: fs.statSync(config.e2eFile).mtime
      };
    }

    // Analizza directory pages
    if (config.pagesDirectory && this.validateDirectory(config.pagesDirectory)) {
      const pageObjects = this.scanPageObjects(config.pagesDirectory);
      analysis.pagesDirectory = {
        valid: true,
        path: config.pagesDirectory,
        pageObjects: pageObjects,
        count: pageObjects.length
      };
    }

    return analysis;
  }

  /**
   * Salva la configurazione
   */
  async saveConfiguration(config) {
    try {
      // Analizza prima di salvare
      const analysis = await this.analyzeConfiguration(config);
      
      const configData = {
        ...config,
        analysis: analysis,
        timestamp: new Date().toISOString(),
        valid: true
      };

      fs.writeFileSync(
        this.configFilePath,
        JSON.stringify(configData, null, 2),
        'utf8'
      );

      return { success: true, analysis };
    } catch (error) {
      console.error('Error saving configuration:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Legge il contenuto di un file (per preview)
   */
  readFileContent(filePath, isProtected = false) {
    try {
      if (isProtected) {
        return { 
          success: false, 
          error: 'File protetto - contiene credenziali sensibili',
          protected: true 
        };
      }

      if (!this.validateFile(filePath)) {
        return { success: false, error: 'File non trovato o non accessibile' };
      }

      const content = fs.readFileSync(filePath, 'utf8');
      const stats = fs.statSync(filePath);

      return {
        success: true,
        content: content,
        fileName: path.basename(filePath),
        size: stats.size,
        lastModified: stats.mtime
      };
    } catch (error) {
      console.error('Error reading file:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verifica validità configurazione esistente
   */
  verifyConfiguration() {
    const config = this.loadConfiguration();
    
    if (!config) {
      return { valid: false, message: 'Nessuna configurazione trovata' };
    }

    const issues = [];

    if (config.cypressConfig && !this.validateFile(config.cypressConfig)) {
      issues.push('cypress.config.js non trovato');
    }

    if (config.envFile && !this.validateFile(config.envFile)) {
      issues.push('cypress.env.json non trovato');
    }

    if (config.packageFile && !this.validateFile(config.packageFile)) {
      issues.push('package.json non trovato');
    }

    if (config.commandsFile && !this.validateFile(config.commandsFile)) {
      issues.push('commands.js non trovato');
    }

    if (config.pagesDirectory && !this.validateDirectory(config.pagesDirectory)) {
      issues.push('Directory pages/ non trovata');
    }

    return {
      valid: issues.length === 0,
      issues: issues,
      config: config
    };
  }
}

export default new CypressConfigService();

