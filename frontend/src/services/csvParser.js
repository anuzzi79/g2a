// frontend/src/services/csvParser.js
import Papa from 'papaparse';

/**
 * Parser CSV generico per test case Gherkin
 * Supporta vari formati CSV con colonne: Data/Given, Action/When, Expected Result/Then
 */
export async function parseCSV(csvText) {
  return new Promise((resolve, reject) => {
    Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const testCases = results.data
          .filter(row => {
            // Accetta vari nomi colonne comuni (case-insensitive)
            const hasGiven = row.Data || row.Given || row['Given'] || row['Precondition'] || 
                           row.data || row.given || row.precondition;
            const hasWhen = row.Action || row.When || row['When'] || row['Step'] || 
                          row.action || row.when || row.step;
            const hasThen = row['Expected Result'] || row.Then || row['Then'] || row['Expected'] || 
                          row['expected result'] || row.then || row.expected;
            return hasGiven && hasWhen && hasThen;
          })
          .map((row, index) => {
            // Normalizza nomi colonne (case-insensitive)
            const given = row.Data || row.Given || row['Given'] || row['Precondition'] || 
                         row.data || row.given || row.precondition || '';
            const when = row.Action || row.When || row['When'] || row['Step'] || 
                        row.action || row.when || row.step || '';
            const then = row['Expected Result'] || row.Then || row['Then'] || row['Expected'] || 
                        row['expected result'] || row.then || row.expected || '';
            const automation = row.Automation || row['Automation'] || row.automation || '';

            return {
              id: index + 1,
              given: given.trim(),
              when: when.trim(),
              then: then.trim(),
              automation: automation.trim(),
              raw: row // Mantieni row originale per debug
            };
          });

        if (testCases.length === 0) {
          reject(new Error(
            'Nessun test case valido trovato nel CSV. ' +
            'Verifica che il CSV contenga colonne: Data/Given, Action/When, Expected Result/Then'
          ));
          return;
        }

        resolve(testCases);
      },
      error: (error) => {
        reject(new Error('Errore parsing CSV: ' + error.message));
      }
    });
  });
}











