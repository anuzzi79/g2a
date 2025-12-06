import { useState, useEffect } from 'react';
import { parseCSV } from '../services/csvParser';
import { api } from '../services/api';

/**
 * Componente generico per upload CSV
 */
export function CSVUploader({ currentSession, onCSVLoaded, onLogEvent }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [savedFileName, setSavedFileName] = useState(null);

  // Verifica se esiste già un CSV salvato per questa sessione
  useEffect(() => {
    const checkExistingCSV = async () => {
      if (!currentSession) return;

      try {
        const result = await api.getSessionCSV(currentSession.id);
        if (result.success && result.csvContent) {
          setSavedFileName(result.fileName);
          onLogEvent?.('info', `File CSV già caricato per questa sessione: ${result.fileName}`);
        }
      } catch (error) {
        // Se il CSV non esiste, non è un errore - è normale per una nuova sessione
        if (error.message.includes('non trovato')) {
          // Nessun CSV salvato, è normale
          return;
        }
        console.error('Errore verifica CSV esistente:', error);
      }
    };

    checkExistingCSV();
  }, [currentSession, onLogEvent]);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

    if (!currentSession) {
      const errorMsg = 'Nessuna sessione selezionata. Seleziona una sessione prima di caricare il CSV.';
      setError(errorMsg);
      onLogEvent?.('error', errorMsg);
      return;
    }

    setFile(selectedFile);
    setLoading(true);
    setError(null);
    onLogEvent?.('info', `Caricamento CSV: ${selectedFile.name}`);

    try {
      const text = await selectedFile.text();
      const testCases = await parseCSV(text);
      
      if (testCases.length === 0) {
        const errorMsg = 'Nessun test case trovato nel CSV';
        setError(errorMsg);
        onLogEvent?.('error', errorMsg);
        setLoading(false);
        return;
      }

      // Salva il CSV nel backend
      try {
        await api.saveSessionCSV(currentSession.id, text, selectedFile.name);
        setSavedFileName(selectedFile.name);
        onLogEvent?.('success', `CSV salvato nella sessione "${currentSession.name}"`);
      } catch (saveError) {
        console.error('Errore salvataggio CSV:', saveError);
        onLogEvent?.('warning', `CSV caricato ma errore nel salvataggio: ${saveError.message}`);
      }

      onCSVLoaded?.(testCases, selectedFile.name);
      onLogEvent?.('success', `CSV caricato: ${testCases.length} test cases`, { fileName: selectedFile.name });
    } catch (err) {
      const errorMsg = 'Errore nel parsing CSV: ' + err.message;
      setError(errorMsg);
      onLogEvent?.('error', errorMsg, { error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="csv-uploader card">
      <h3>📄 Upload CSV Test Cases</h3>
      {savedFileName && (
        <div style={{ 
          marginBottom: '15px', 
          padding: '10px', 
          backgroundColor: '#e8f5e9', 
          borderRadius: '4px',
          fontSize: '14px'
        }}>
          <strong>✅ File CSV già caricato:</strong> {savedFileName}
          <br />
          <span style={{ fontSize: '12px', color: '#666' }}>
            Questo file verrà caricato automaticamente quando apri la sessione.
          </span>
        </div>
      )}
      <div className="upload-section">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={loading || !currentSession}
          id="csv-file-input"
        />
        <label htmlFor="csv-file-input" className="file-input-label">
          {loading ? '⏳ Caricamento...' : '📂 Sfoglia CSV...'}
        </label>
      </div>
      {!currentSession && (
        <p style={{ color: '#f44336', fontSize: '14px', marginTop: '10px' }}>
          ⚠️ Seleziona una sessione prima di caricare il CSV
        </p>
      )}
      
      {file && !loading && !error && (
        <p className="success">✅ File caricato: {file.name}</p>
      )}
      {loading && <p className="loading">⏳ Caricamento e parsing...</p>}
      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}

