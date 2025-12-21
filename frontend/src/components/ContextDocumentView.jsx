import { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/ContextDocumentView.css';

export function ContextDocumentView({ sessionId, onBack, onLogEvent }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const loadDocument = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const result = await api.getContextDocument(sessionId);
        setText(result.document?.text || '');
        setLastSaved(result.document?.updatedAt || null);
        onLogEvent?.('info', 'Documento di Contesto caricato');
      } catch (error) {
        console.error('Errore caricamento Documento di Contesto:', error);
        setError(error.message);
        onLogEvent?.('error', `Errore caricamento Documento di Contesto: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadDocument();
  }, [sessionId, onLogEvent]);

  const handleSave = async () => {
    if (!sessionId) {
      setError('Nessuna sessione selezionata');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await api.saveContextDocument(sessionId, text);
      setLastSaved(result.document?.updatedAt || new Date().toISOString());
      onLogEvent?.('success', 'Documento di Contesto salvato');
    } catch (error) {
      console.error('Errore salvataggio Documento di Contesto:', error);
      setError(error.message);
      onLogEvent?.('error', `Errore salvataggio Documento di Contesto: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleReload = async () => {
    if (!sessionId) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await api.getContextDocument(sessionId);
      setText(result.document?.text || '');
      setLastSaved(result.document?.updatedAt || null);
      onLogEvent?.('info', 'Documento di Contesto ricaricato');
    } catch (error) {
      console.error('Errore ricaricamento Documento di Contesto:', error);
      setError(error.message);
      onLogEvent?.('error', `Errore ricaricamento Documento di Contesto: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="context-document-view">
        <div className="context-document-loading">
          <p>Caricamento Documento di Contesto...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="context-document-view">
      <div className="context-document-header">
        <h2>📄 Documento di Contesto</h2>
        <div className="context-document-header-actions">
          {lastSaved && (
            <span className="last-saved-info">
              Ultimo salvataggio: {new Date(lastSaved).toLocaleString('it-IT')}
            </span>
          )}
          <button 
            onClick={handleReload} 
            className="reload-button"
            disabled={loading}
          >
            🔄 Ricarica
          </button>
          <button 
            onClick={handleSave} 
            className="save-button"
            disabled={saving || loading}
          >
            {saving ? '⏳ Salvataggio...' : '💾 Salva'}
          </button>
          <button onClick={onBack} className="back-button">
            ← Indietro
          </button>
        </div>
      </div>

      {error && (
        <div className="context-document-error">
          <strong>Errore:</strong> {error}
        </div>
      )}

      <div className="context-document-editor">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Inserisci qui il testo del Documento di Contesto..."
          className="context-document-textarea"
        />
      </div>
    </div>
  );
}




