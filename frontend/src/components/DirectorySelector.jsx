import { useState, useEffect } from 'react';
import { api } from '../services/api';

/**
 * Componente per selezionare directory via dialog Windows o input manuale
 */
export function DirectorySelector({ onSelect, description, label, onLogEvent, onAddToResources }) {
  const [selectedPath, setSelectedPath] = useState('');
  const [manualPath, setManualPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleBrowse = async () => {
    setLoading(true);
    setError(null);
    onLogEvent?.('info', 'Apertura dialog selezione directory');
    
    try {
      // Aggiungi un piccolo delay per permettere al browser di completare il rendering
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await api.selectDirectory(description || label);
      
      if (result.canceled) {
        onLogEvent?.('info', 'Dialog annullato dall\'utente');
        setLoading(false);
        return;
      }
      
      if (result.path) {
        setSelectedPath(result.path);
        onSelect?.(result.path);
        onLogEvent?.('success', `Directory selezionata: ${result.path}`);
      } else if (result.error) {
        setError(result.error);
        onLogEvent?.('error', 'Errore dialog', { error: result.error });
      }
    } catch (err) {
      const errorMsg = 'Errore apertura dialog: ' + err.message;
      setError(errorMsg);
      onLogEvent?.('error', errorMsg, { error: err.message, stack: err.stack });
      console.error('Errore dialog:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleManualConfirm = () => {
    if (!manualPath.trim()) {
      setError('Inserisci un percorso valido');
      return;
    }
    
    const path = manualPath.trim();
    setSelectedPath(path);
    onSelect?.(path);
    setError(null);
    onLogEvent?.('success', `Directory inserita: ${path}`);
    // NON reset manualPath qui - l'utente può ancora aggiungerla alla lista
  };

  const handleAddToResources = async () => {
    const pathToAdd = selectedPath || manualPath.trim();
    if (!pathToAdd) {
      setError('Nessuna directory selezionata da aggiungere');
      onLogEvent?.('error', 'Tentativo di aggiungere directory vuota');
      return;
    }
    
    // Non loggare qui, aspetta che handleAddToResources in ContextBuilder completi
    // onAddToResources è async e gestirà i log e l'aggiunta
    try {
      await onAddToResources?.(pathToAdd);
      // Reset manualPath dopo aggiunta riuscita
      if (manualPath.trim() === pathToAdd) {
        setManualPath('');
      }
    } catch (error) {
      onLogEvent?.('error', `Errore durante aggiunta risorsa: ${error.message}`);
    }
  };

  return (
    <div className="directory-selector">
      {label && <label>{label}</label>}
      
      {/* Input per selezione manuale */}
      <div className="directory-input-group">
        <input
          type="text"
          placeholder="Inserisci percorso directory (es: C:\Users\...\fg-test\cypress\e2e\ui\pages)"
          value={manualPath}
          onChange={(e) => setManualPath(e.target.value)}
          className="directory-input"
          onKeyPress={(e) => {
            if (e.key === 'Enter') {
              handleManualConfirm();
            }
          }}
        />
        <button
          onClick={handleManualConfirm}
          disabled={!manualPath.trim()}
          className="browse-button"
          title="Conferma percorso"
        >
          ✓
        </button>
        <button 
          onClick={handleBrowse} 
          disabled={loading}
          className="browse-button"
          title="Apri dialog Windows"
        >
          {loading ? '⏳...' : '📂 Sfoglia...'}
        </button>
      </div>

      {/* Directory selezionata corrente o input manuale */}
      {(selectedPath || manualPath.trim()) && (
        <div className="selected-directory">
          {selectedPath ? (
            <p className="success">✅ Directory selezionata: <strong>{selectedPath}</strong></p>
          ) : (
            <p className="info">💡 Path inserito (non ancora confermato): <strong>{manualPath}</strong></p>
          )}
          <button
            onClick={handleAddToResources}
            className="add-resource-button"
            title="Aggiungi alla lista risorse"
          >
            + Aggiungi alla lista
          </button>
        </div>
      )}

      {error && <p className="error">❌ {error}</p>}
    </div>
  );
}

