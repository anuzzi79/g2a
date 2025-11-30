import { useState } from 'react';
import { parseCSV } from '../services/csvParser';

/**
 * Componente generico per upload CSV
 */
export function CSVUploader({ onCSVLoaded, onLogEvent }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;

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
        return;
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
      <div className="upload-section">
        <input
          type="file"
          accept=".csv"
          onChange={handleFileChange}
          disabled={loading}
          id="csv-file-input"
        />
        <label htmlFor="csv-file-input" className="file-input-label">
          {loading ? '⏳ Caricamento...' : '📂 Sfoglia CSV...'}
        </label>
      </div>
      
      {file && !loading && !error && (
        <p className="success">✅ File caricato: {file.name}</p>
      )}
      {loading && <p className="loading">⏳ Caricamento e parsing...</p>}
      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}

