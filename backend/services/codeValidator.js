// backend/services/codeValidator.js
// Servizio per validare e correggere il codice preliminare

class CodeValidatorService {
  /**
   * Valida e corregge il codice JavaScript/Cypress
   * Risolve problemi di parentesi, punteggiatura, sintassi
   * @param {string} code - Il codice da validare
   * @param {boolean} isPartial - Se true, non chiude automaticamente i blocchi aperti alla fine
   */
  validateAndFixCode(code, isPartial = false) {
    if (!code || typeof code !== 'string') {
      return {
        isValid: true,
        fixedCode: code || '',
        errors: [],
        warnings: []
      };
    }

    const errors = [];
    const warnings = [];
    let fixedCode = code;

    try {
      // 1. Rimuovi spazi multipli e normalizza
      fixedCode = this.normalizeWhitespace(fixedCode);

      // 2. Pulizia preliminare di "spazzatura" nota alla fine
      fixedCode = this.cleanTrailingGarbage(fixedCode);

      // 3. Controlla e correggi parentesi
      const parenthesesResult = this.fixParentheses(fixedCode, isPartial);
      fixedCode = parenthesesResult.code;
      errors.push(...parenthesesResult.errors);
      warnings.push(...parenthesesResult.warnings);

      // 4. Controlla e correggi virgole e punto e virgola
      const punctuationResult = this.fixPunctuation(fixedCode);
      fixedCode = punctuationResult.code;
      warnings.push(...punctuationResult.warnings);

      // 5. Controlla quote non chiuse
      const quotesResult = this.fixQuotes(fixedCode);
      fixedCode = quotesResult.code;
      errors.push(...quotesResult.errors);

      // 6. Valida sintassi base
      const syntaxResult = this.validateBasicSyntax(fixedCode);
      errors.push(...syntaxResult.errors);
      warnings.push(...syntaxResult.warnings);

      // 7. Pulizia finale post-correzioni (CRUCIALE)
      // Se non è parziale (quindi file completo), assicuriamoci che finisca pulito
      if (!isPartial) {
        fixedCode = this.cleanTrailingGarbage(fixedCode, true);
      }

      return {
        isValid: errors.length === 0,
        fixedCode,
        errors,
        warnings,
        hasChanges: fixedCode !== code
      };

    } catch (error) {
      console.error('Errore validazione codice:', error);
      return {
        isValid: false,
        fixedCode: code,
        errors: [`Errore durante la validazione: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Rimuove pattern errati comuni alla fine del file
   * @param {string} code 
   * @param {boolean} aggressive - Se true, forza una chiusura pulita se sembra un file Cypress completo
   */
  cleanTrailingGarbage(code, aggressive = false) {
    let clean = code.trimEnd();

    // Rimuove sequenze di chiusura duplicate/errate comuni
    // Es: });) oppure });} oppure ) } oppure });});
    
    // Regex per trovare la "coda" del file che contiene solo chiusure e spazi
    // Cerca l'ultimo blocco di chiusure
    
    if (aggressive) {
      // Se siamo in modalità aggressiva (file completo), vogliamo che finisca con });
      // o almeno con } se non c'era describe.
      
      // Controlliamo se c'è spazzatura dopo l'ultimo }); valido
      const lastCleanClosing = clean.lastIndexOf('});');
      
      if (lastCleanClosing > -1) {
        // Se c'è qualcosa dopo l'ultimo }); che non è spazio vuoto
        const tail = clean.substring(lastCleanClosing + 3);
        
        // Se la coda contiene solo altre parentesi di chiusura o punti e virgola vaganti, la tronchiamo
        if (/^[\s\n]*[)}\];]*$/.test(tail)) {
           clean = clean.substring(0, lastCleanClosing + 3);
        }
      }
    }

    // Altre pulizie specifiche
    
    // Rimuove ');' se preceduto da '});'
    clean = clean.replace(/}\);\s*\);/g, '});');
    
    // Rimuove '}' se preceduto da '});'
    clean = clean.replace(/}\);\s*}/g, '});');
    
    // Rimuove ')' se preceduto da '});'
    clean = clean.replace(/}\);\s*\)/g, '});');

    // Caso specifico segnalato: });)
    clean = clean.replace(/}\);[\s\n]*\)/g, '});');
    
    // Caso specifico: }); }} );
    clean = clean.replace(/}\);[\s\n]*}[\s\n]*}\s*\);/g, '});');

    // Fix per });)
    if (clean.endsWith('});)')) {
        clean = clean.substring(0, clean.length - 1);
    }

    return clean;
  }

  /**
   * Normalizza spazi e indentazione
   */
  normalizeWhitespace(code) {
    // Rimuovi spazi alla fine delle righe
    let normalized = code.replace(/[ \t]+$/gm, '');
    
    // Normalizza righe vuote multiple (max 2 consecutive)
    normalized = normalized.replace(/\n{3,}/g, '\n\n');
    
    return normalized;
  }

  /**
   * Controlla e correggi parentesi
   */
  fixParentheses(code, isPartial = false) {
    const errors = [];
    const warnings = [];
    let fixedCode = code;

    // Conta parentesi
    const counts = {
      '(': 0, ')': 0,
      '{': 0, '}': 0,
      '[': 0, ']': 0
    };

    // Stack per tracciare l'ordine di apertura
    const stack = [];
    const pairs = { '(': ')', '{': '}', '[': ']' };
    const closing = { ')': '(', '}': '{', ']': '[' };

    for (let i = 0; i < code.length; i++) {
      const char = code[i];
      
      if (pairs[char]) {
        // Parentesi di apertura
        counts[char]++;
        stack.push(char);
      } else if (closing[char]) {
        // Parentesi di chiusura
        counts[char]++;
        const expected = stack.pop();
        
        if (!expected) {
          // Parentesi di chiusura senza apertura!
          warnings.push(`Parentesi di chiusura '${char}' senza apertura alla posizione ${i} - RIMOSSA`);
          
          // La rimuoviamo "chirurgicamente"
          fixedCode = fixedCode.slice(0, i) + fixedCode.slice(i + 1);
          i--; 
          counts[char]--;
          continue; 
        } else if (pairs[expected] !== char) {
          errors.push(`Parentesi non corrispondenti: aperta '${expected}' ma chiusa con '${char}' alla posizione ${i}`);
        }
      }
    }

    // Se è codice parziale (preliminare), non aggiungiamo chiusure automatiche
    if (!isPartial) {
      // Aggiungi parentesi mancanti alla fine se necessario
      if (counts['('] > counts[')']) {
        const missing = counts['('] - counts[')'];
        fixedCode += ')'.repeat(missing);
        warnings.push(`Aggiunte ${missing} parentesi tonde di chiusura mancanti`);
      }
      if (counts['{'] > counts['}']) {
        const missing = counts['{'] - counts['}'];
        fixedCode += '\n' + '}'.repeat(missing);
        warnings.push(`Aggiunte ${missing} parentesi graffe di chiusura mancanti`);
      }
      if (counts['['] > counts[']']) {
        const missing = counts['['] - counts[']'];
        fixedCode += ']'.repeat(missing);
        warnings.push(`Aggiunte ${missing} parentesi quadre di chiusura mancanti`);
      }
      
      // Controllo extra per describe/it blocks non chiusi con punto e virgola
      if (counts['{'] > counts['}']) {
          if (fixedCode.trim().endsWith('}')) {
              fixedCode += ');';
          }
      }
    } else {
        if (counts['{'] > counts['}']) {
            warnings.push(`Nota: Ci sono blocchi aperti ({) non chiusi (OK per codice preliminare)`);
        }
    }

    return { code: fixedCode, errors, warnings };
  }

  /**
   * Controlla e correggi punteggiatura
   */
  fixPunctuation(code) {
    const warnings = [];
    let fixedCode = code;

    const lines = fixedCode.split('\n');
    const fixedLines = lines.map((line, index) => {
      const trimmed = line.trim();
      
      if (!trimmed || 
          trimmed.startsWith('//') || 
          trimmed.startsWith('/*') ||
          /[;,\{\}\)]$/.test(trimmed) ||
          trimmed.startsWith('import ') && trimmed.includes('from') && !trimmed.endsWith(';')) {
        
        if (trimmed.startsWith('import ') && trimmed.includes('from') && !trimmed.endsWith(';')) {
          warnings.push(`Aggiunto punto e virgola alla riga ${index + 1} (import)`);
          return line + ';';
        }
        
        return line;
      }

      if (/^(const|let|var|await)\s+/.test(trimmed) && !trimmed.endsWith(';')) {
        warnings.push(`Aggiunto punto e virgola alla riga ${index + 1}`);
        return line + ';';
      }

      return line;
    });

    fixedCode = fixedLines.join('\n');

    return { code: fixedCode, warnings };
  }

  /**
   * Controlla e correggi quote non chiuse
   */
  fixQuotes(code) {
    const errors = [];
    let inString = false;
    let stringChar = null;
    let escaped = false;

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if ((char === '"' || char === "'" || char === '`') && !inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar && inString) {
        inString = false;
        stringChar = null;
      }
    }

    if (inString) {
      errors.push(`Stringa non chiusa (aperta con ${stringChar})`);
    }

    return { code, errors };
  }

  /**
   * Valida sintassi base
   */
  validateBasicSyntax(code) {
    const errors = [];
    const warnings = [];

    const lines = code.split('\n');
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('import ') && !trimmed.includes('from') && trimmed !== 'import') {
        warnings.push(`Possibile import malformato alla riga ${index + 1}: manca "from"?`);
      }

      if (/^(const|let|var)\s*;/.test(trimmed)) {
        errors.push(`Dichiarazione vuota alla riga ${index + 1}`);
      }

      if (/;;/.test(trimmed)) {
        warnings.push(`Doppio punto e virgola alla riga ${index + 1}`);
      }
    });

    return { errors, warnings };
  }

  /**
   * Formatta il codice con indentazione base
   */
  formatCode(code) {
    if (!code) return '';

    const lines = code.split('\n');
    let indentLevel = 0;
    const formatted = [];

    for (let line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.startsWith('}') || trimmed.startsWith('])') || trimmed.startsWith('});')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }

      if (trimmed) {
        formatted.push('  '.repeat(indentLevel) + trimmed);
      } else {
        formatted.push('');
      }

      if (trimmed.endsWith('{') || trimmed.endsWith('(') || trimmed.endsWith('[')) {
        indentLevel++;
      }
    }

    return formatted.join('\n');
  }
}

export default new CodeValidatorService();
