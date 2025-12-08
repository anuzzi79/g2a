import { useState } from 'react';
import { api } from '../services/api';

/**
 * Componente per selezionare directory o file e aggiungerli alle risorse
 */
export function ResourceSelector({ onAddResource, onLogEvent }) {
  const [manualPath, setManualPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleBrowseDirectory = async () => {
    setLoading(true);
    setError(null);
    onLogEvent?.('info', 'Apertura dialog selezione directory');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await api.selectDirectory('Seleziona Directory');
      
      if (result.canceled) {
        onLogEvent?.('info', 'Dialog annullato dall\'utente');
        setLoading(false);
        return;
      }
      
      if (result.path) {
        setManualPath(result.path);
        onLogEvent?.('success', `Directory selezionata: ${result.path}`);
      } else if (result.error) {
        setError(result.error);
        onLogEvent?.('error', 'Errore dialog', { error: result.error });
      }
    } catch (err) {
      const errorMsg = 'Errore apertura dialog: ' + err.message;
      setError(errorMsg);
      onLogEvent?.('error', errorMsg, { error: err.message });
      console.error('Errore dialog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBrowseFile = async () => {
    setLoading(true);
    setError(null);
    onLogEvent?.('info', 'Apertura dialog selezione file');
    
    try {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await api.selectFile(
        'Seleziona File',
        'File JavaScript|*.js;*.jsx|Tutti i file|*.*'
      );
      
      if (result.canceled) {
        onLogEvent?.('info', 'Dialog annullato dall\'utente');
        setLoading(false);
        return;
      }
      
      if (result.path) {
        setManualPath(result.path);
        onLogEvent?.('success', `File selezionato: ${result.path}`);
      } else if (result.error) {
        setError(result.error);
        onLogEvent?.('error', 'Errore dialog', { error: result.error });
      }
    } catch (err) {
      const errorMsg = 'Errore apertura dialog: ' + err.message;
      setError(errorMsg);
      onLogEvent?.('error', errorMsg, { error: err.message });
      console.error('Errore dialog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!manualPath.trim()) {
      setError('Inserisci o seleziona un percorso valido');
      return;
    }
    
    const path = manualPath.trim();
    
    // Aggiungi la risorsa
    if (onAddResource) {
      await onAddResource(path);
      setManualPath(''); // Reset dopo aggiunta
      setError(null);
    }
  };

  return (
    <div className="resource-selector">
      <div className="directory-input-group">
        <input
          type="text"
          placeholder="Inserisci percorso directory o file (es: C:\Users\...\pages oppure C:\Users\...\file.js)"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          className="directory-input"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleConfirm();
            }
          }}
        />
        <button
          onClick={handleConfirm}
          disabled={!manualPath.trim() || loading}
          className="browse-button"
          title="Aggiungi risorsa"
        >
          ✓
        </button>
        <button 
          onClick={handleBrowseDirectory} 
          disabled={loading}
          className="browse-button"
          title="Sfoglia directory"
        >
          {loading ? '⏳...' : '📂 Directory'}
        </button>
        <button 
          onClick={handleBrowseFile} 
          disabled={loading}
          className="browse-button"
          title="Sfoglia file"
        >
          {loading ? '⏳...' : '📄 File'}
        </button>
      </div>
      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}





