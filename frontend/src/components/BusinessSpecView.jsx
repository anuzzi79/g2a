import { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/BusinessSpecView.css';

export function BusinessSpecView({ sessionId, onBack, onLogEvent }) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [lastSaved, setLastSaved] = useState(null);

  useEffect(() => {
    const loadSpec = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        setError(null);
        const result = await api.getBusinessSpec(sessionId);
        setText(result.spec?.text || '');
        setLastSaved(result.spec?.updatedAt || null);
        onLogEvent?.('info', 'Business Spec caricata');
      } catch (err) {
        console.error('Errore caricamento Business Spec:', err);
        setError(err.message);
        onLogEvent?.('error', `Errore caricamento Business Spec: ${err.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadSpec();
  }, [sessionId, onLogEvent]);

  const handleSave = async () => {
    if (!sessionId) {
      setError('Nessuna sessione selezionata');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const result = await api.saveBusinessSpec(sessionId, text);
      setLastSaved(result.spec?.updatedAt || new Date().toISOString());
      onLogEvent?.('success', 'Business Spec salvata');
    } catch (err) {
      console.error('Errore salvataggio Business Spec:', err);
      setError(err.message);
      onLogEvent?.('error', `Errore salvataggio Business Spec: ${err.message}`);
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
      const result = await api.getBusinessSpec(sessionId);
      setText(result.spec?.text || '');
      setLastSaved(result.spec?.updatedAt || null);
      onLogEvent?.('info', 'Business Spec ricaricata');
    } catch (err) {
      console.error('Errore ricaricamento Business Spec:', err);
      setError(err.message);
      onLogEvent?.('error', `Errore ricaricamento Business Spec: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="business-spec-view">
        <div className="business-spec-loading">
          <p>Caricamento Business Specifications...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="business-spec-view">
      <div className="business-spec-header">
        <h2>📋 Business Specifications</h2>
        <div className="business-spec-header-actions">
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
        <div className="business-spec-error">
          <strong>Errore:</strong> {error}
        </div>
      )}

      <div className="business-spec-editor">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Inserisci le specifiche di business in linguaggio naturale..."
          className="business-spec-textarea"
          disabled={saving}
        />
      </div>
    </div>
  );
}




