// backend/services/contextExtractor.js
import fs from 'fs/promises';
import path from 'path';
import { findJSFiles } from './fileSystem.js';

/**
 * Estrae contesto da un array di risorse (directory o file)
 */
export async function extractContextFromResources(resources, validationResults = null) {
  const context = {
    selectors: [],
    methods: [],
    filesAnalyzed: [],
    resources: []
  };

  // Processa ogni risorsa
  const jsFiles = [];
  
  for (let i = 0; i < resources.length; i++) {
    const resourcePath = resources[i];
    const validation = validationResults?.[i];
    
    try {
      if (validation?.isFile) {
        // Se è un file, aggiungilo direttamente
        jsFiles.push({
          fullPath: resourcePath,
          relativePath: path.basename(resourcePath)
        });
      } else if (validation?.isDirectory) {
        // Se è una directory, trova tutti i file JS dentro
        const dirFiles = await findJSFiles(resourcePath);
        jsFiles.push(...dirFiles);
      }
    } catch (error) {
      console.error(`Errore processando risorsa ${resourcePath}:`, error.message);
    }
  }

  // Analizza ogni file
  for (const file of jsFiles) {
    try {
      const content = await fs.readFile(file.fullPath, 'utf8');
      const extracted = parsePageObjectFile(content, file.relativePath);
      
      context.selectors.push(...extracted.selectors);
      context.methods.push(...extracted.methods);
      context.filesAnalyzed.push({
        path: file.fullPath,
        relativePath: file.relativePath
      });
    } catch (error) {
      console.error(`Errore analisi ${file.relativePath}:`, error.message);
    }
  }

  context.resources = resources;

  // Raggruppa selettori per contesto
  context.groupedSelectors = groupSelectorsByContext(context.selectors);

  return context;
}

/**
 * Estrae selettori e metodi da un file Page Object
 */
function parsePageObjectFile(content, fileName) {
  const selectors = [];
  const methods = [];
  
  // Pattern per selettori Cypress
  const selectorPatterns = [
    { pattern: /cy\.get\(['"]([^'"]+)['"]\)/g, type: 'get' },
    { pattern: /cy\.contains\(['"]([^'"]+)['"]\)/g, type: 'contains' },
    { pattern: /cy\.get\(`([^`]+)`\)/g, type: 'get-template' },
    { pattern: /cy\.contains\(`([^`]+)`\)/g, type: 'contains-template' },
  ];

  // Estrai selettori
  selectorPatterns.forEach(({ pattern, type }) => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const lineNumber = content.substring(0, match.index).split('\n').length;
      selectors.push({
        selector: match[1],
        type,
        file: fileName,
        line: lineNumber
      });
    }
  });

  // Estrai metodi/funzioni
  const methodPatterns = [
    /(?:export\s+)?function\s+(\w+)\s*\([^)]*\)\s*\{[\s\S]*?\n\}/g,
    /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>\s*\{[\s\S]*?\n\}/g,
    /(?:export\s+)?class\s+(\w+)[\s\S]*?\}/g
  ];

  methodPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const methodContent = match[0];
      methods.push({
        name: match[1],
        signature: methodContent.substring(0, 300),
        file: fileName,
        hasCypressCommands: /cy\.(get|contains|click|type|select|visit)/.test(methodContent)
      });
    }
  });

  return { selectors, methods };
}

/**
 * Raggruppa selettori per contesto semantico
 */
function groupSelectorsByContext(selectors) {
  const groups = {};
  
  for (const selector of selectors) {
    const fileName = selector.file.toLowerCase();
    let group = 'other';
    
    // Pattern matching generico
    if (fileName.includes('copy') || selector.selector.toLowerCase().includes('copy')) {
      group = 'copy';
    } else if (fileName.includes('login')) {
      group = 'login';
    } else if (fileName.includes('modal') || selector.selector.toLowerCase().includes('modal')) {
      group = 'modal';
    } else if (fileName.includes('list')) {
      group = 'list';
    } else if (fileName.includes('detail')) {
      group = 'detail';
    } else {
      // Estrai prima parola significativa dal file name
      const match = fileName.match(/\/(\w+)[_\-\s]/);
      if (match) {
        group = match[1];
      }
    }
    
    if (!groups[group]) {
      groups[group] = [];
    }
    groups[group].push(selector);
  }

  return groups;
}

