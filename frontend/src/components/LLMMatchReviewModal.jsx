import { useState, useEffect } from 'react';
import '../styles/LLMMatchReviewModal.css';

export function LLMMatchReviewModal({ suggestions, stats, ecObjects, binomi, onAccept, onReject, onClose }) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedReasoning, setExpandedReasoning] = useState(new Set());

  useEffect(() => {
    // Seleziona tutti per default
    if (suggestions && suggestions.length > 0) {
      setSelectedIds(new Set(suggestions.map(s => s.id)));
    }
  }, [suggestions]);

  const handleToggleSelection = (id) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (suggestions && suggestions.length > 0) {
      setSelectedIds(new Set(suggestions.map(s => s.id)));
    }
  };

  const handleDeselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleToggleReasoning = (id) => {
    const newExpanded = new Set(expandedReasoning);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedReasoning(newExpanded);
  };

  const handleAcceptSelected = () => {
    if (selectedIds.size === 0) {
      alert('Seleziona almeno una suggestion da accettare');
      return;
    }
    onAccept(Array.from(selectedIds));
  };

  const handleAcceptAll = () => {
    if (suggestions && suggestions.length > 0) {
      onAccept(suggestions.map(s => s.id));
    }
  };

  if (!suggestions || suggestions.length === 0) {
    return (
      <div className="llm-match-modal-overlay" onClick={onClose}>
        <div className="llm-match-modal-content" onClick={(e) => e.stopPropagation()}>
          <h3>Nessuna Suggestion Trovata</h3>
          <p>L'analisi LLM non ha trovato match suggeriti.</p>
          <div className="llm-match-modal-stats">
            <p>Oggetti analizzati: {stats?.totalAnalyzed || 0}</p>
          </div>
          <button onClick={onClose} className="llm-match-modal-close-btn">
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="llm-match-modal-overlay" onClick={onClose}>
      <div className="llm-match-modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="llm-match-modal-header">
          <h3>🤖 Review LLM Match Suggestions</h3>
          <button onClick={onClose} className="llm-match-modal-close-btn">
            ✕
          </button>
        </div>

        <div className="llm-match-modal-stats">
          <div className="stat-item">
            <strong>Analizzati:</strong> {stats?.totalAnalyzed || 0}
          </div>
          <div className="stat-item">
            <strong>Suggeriti:</strong> {suggestions.length}
          </div>
          <div className="stat-item">
            <strong>Confidence Media:</strong> {((stats?.avgConfidence || 0) * 100).toFixed(1)}%
          </div>
          <div className="stat-item">
            <strong>Selezionati:</strong> {selectedIds.size} / {suggestions.length}
          </div>
        </div>

        <div className="llm-match-suggestions-list">
          {suggestions.map((suggestion) => {
            const fromObj = ecObjects?.find(o => o.id === suggestion.fromObjectId);
            const patternBinomio = binomi?.find(b => b.id === suggestion.suggestedPatternBinomioId);
            const patternFromObj = ecObjects?.find(o => o.id === patternBinomio?.fromObjectId);
            const patternToObj = ecObjects?.find(o => o.id === patternBinomio?.toObjectId);
            const isSelected = selectedIds.has(suggestion.id);
            const isReasoningExpanded = expandedReasoning.has(suggestion.id);

            return (
              <div key={suggestion.id} className={`llm-match-suggestion-item ${isSelected ? 'selected' : ''}`}>
                <div className="suggestion-header">
                  <label className="suggestion-checkbox">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleSelection(suggestion.id)}
                    />
                    <span className="suggestion-from-text">
                      <strong>FROM:</strong> {fromObj?.text || suggestion.fromObjectId}
                    </span>
                  </label>
                  <div className="suggestion-confidence">
                    <div className="confidence-bar-container">
                      <div
                        className="confidence-bar"
                        style={{ width: `${suggestion.confidence * 100}%` }}
                      />
                    </div>
                    <span className="confidence-value">
                      {(suggestion.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                <div className="suggestion-pattern-info">
                  <div className="pattern-label">
                    <strong>Pattern Binomio:</strong> {patternBinomio?.id || suggestion.suggestedPatternBinomioId}
                  </div>
                  {patternFromObj && patternToObj && (
                    <div className="pattern-preview">
                      <div className="pattern-from">
                        <strong>FROM:</strong> {patternFromObj.text}
                      </div>
                      <div className="pattern-to">
                        <strong>TO:</strong> {patternToObj.text.substring(0, 100)}
                        {patternToObj.text.length > 100 ? '...' : ''}
                      </div>
                    </div>
                  )}
                </div>

                <div className="suggestion-reasoning">
                  <button
                    className="reasoning-toggle"
                    onClick={() => handleToggleReasoning(suggestion.id)}
                  >
                    {isReasoningExpanded ? '▼' : '▶'} Reasoning
                  </button>
                  {isReasoningExpanded && (
                    <div className="reasoning-content">
                      {suggestion.reasoning || 'Nessuna reasoning disponibile'}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div className="llm-match-modal-actions">
          <div className="selection-actions">
            <button onClick={handleSelectAll} className="action-btn secondary">
              Seleziona Tutti
            </button>
            <button onClick={handleDeselectAll} className="action-btn secondary">
              Deseleziona Tutti
            </button>
          </div>
          <div className="confirm-actions">
            <button onClick={onClose} className="action-btn cancel">
              Annulla
            </button>
            <button onClick={handleAcceptSelected} className="action-btn accept" disabled={selectedIds.size === 0}>
              Accetta Selezionati ({selectedIds.size})
            </button>
            <button onClick={handleAcceptAll} className="action-btn accept-all">
              Accetta Tutti
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

