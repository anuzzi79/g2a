import { useState, useEffect } from 'react';
import { api } from '../services/api';
import '../styles/SessionManager.css';

export function SessionManager({ currentSession, onSessionSelect, onLogEvent }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSessionName, setNewSessionName] = useState('');
  const [migrating, setMigrating] = useState(false);

  // Carica sessioni all'avvio
  useEffect(() => {
    loadSessions();
    checkLegacyData();
  }, []);

  const loadSessions = async () => {
    setLoading(true);
    try {
      const result = await api.getSessions();
      setSessions(result.sessions || []);
    } catch (error) {
      console.error('Errore caricamento sessioni:', error);
      onLogEvent?.('error', `Errore caricamento sessioni: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const checkLegacyData = async () => {
    // Verifica se ci sono dati legacy da migrare
    try {
      const hasContext = localStorage.getItem('g2a_context');
      const hasTestStates = Object.keys(localStorage).some(key => key.startsWith('g2a_test_state_'));
      
      if (hasContext || hasTestStates) {
        // C'è qualcosa da migrare, ma non lo facciamo automaticamente
        // L'utente può farlo manualmente se vuole
      }
    } catch (error) {
      console.error('Errore verifica dati legacy:', error);
    }
  };

  const handleCreateSession = async () => {
    if (!newSessionName.trim()) {
      onLogEvent?.('warning', 'Inserisci un nome per la sessione');
      return;
    }

    setLoading(true);
    try {
      const result = await api.createSession({
        name: newSessionName.trim()
      });
      
      onLogEvent?.('success', `Sessione "${result.session.name}" creata`);
      setShowCreateModal(false);
      setNewSessionName('');
      await loadSessions();
      // Seleziona automaticamente la nuova sessione
      onSessionSelect(result.session);
    } catch (error) {
      onLogEvent?.('error', `Errore creazione sessione: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!confirm('Sei sicuro di voler eliminare questa sessione? I file verranno eliminati.')) {
      return;
    }

    setLoading(true);
    try {
      await api.deleteSession(sessionId);
      onLogEvent?.('success', 'Sessione eliminata');
      await loadSessions();
      // Se era la sessione corrente, deseleziona
      if (currentSession?.id === sessionId) {
        onSessionSelect(null);
      }
    } catch (error) {
      onLogEvent?.('error', `Errore eliminazione sessione: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRenameSession = async (sessionId, newName) => {
    if (!newName.trim()) {
      return;
    }

    setLoading(true);
    try {
      await api.updateSession(sessionId, { name: newName.trim() });
      onLogEvent?.('success', 'Sessione rinominata');
      await loadSessions();
    } catch (error) {
      onLogEvent?.('error', `Errore rinomina sessione: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleMigrateLegacyData = async () => {
    if (!confirm('Vuoi migrare i dati esistenti in una sessione "Primeira"? Questo creerà una nuova sessione con tutti i tuoi dati attuali.')) {
      return;
    }

    setMigrating(true);
    try {
      // Raccogli tutti i dati legacy da localStorage
      const legacyData = {
        context: null,
        testCases: [],
        testStates: {}
      };

      // Carica contesto
      try {
        const contextStr = localStorage.getItem('g2a_context');
        if (contextStr) {
          legacyData.context = JSON.parse(contextStr);
        }
      } catch (e) {
        console.error('Errore caricamento contesto legacy:', e);
      }

      // Carica tutti gli stati dei test
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('g2a_test_state_')) {
          try {
            const testId = key.replace('g2a_test_state_', '');
            legacyData.testStates[testId] = JSON.parse(localStorage.getItem(key));
          } catch (e) {
            console.error(`Errore caricamento stato test ${key}:`, e);
          }
        }
      });

      // Migra i dati
      const result = await api.migrateLegacyData(legacyData);
      onLogEvent?.('success', `Dati migrati nella sessione "${result.session.name}"`);
      await loadSessions();
      // Seleziona la sessione migrata
      onSessionSelect(result.session);
    } catch (error) {
      onLogEvent?.('error', `Errore migrazione dati: ${error.message}`);
    } finally {
      setMigrating(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Mai';
    const date = new Date(dateString);
    return date.toLocaleDateString('it-IT', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const hasLegacyData = () => {
    const hasContext = localStorage.getItem('g2a_context');
    const hasTestStates = Object.keys(localStorage).some(key => key.startsWith('g2a_test_state_'));
    return !!(hasContext || hasTestStates);
  };

  return (
    <div className="session-manager">
      <div className="session-manager-header">
        <div>
          <h2>📁 Sessioni di Lavoro</h2>
          <p className="session-manager-subtitle">Seleziona una sessione esistente o creane una nuova per iniziare</p>
        </div>
        <div className="session-manager-actions">
          {hasLegacyData() && (
            <button 
              className="migrate-button"
              onClick={handleMigrateLegacyData}
              disabled={migrating || loading}
              title="Migra i dati esistenti in una sessione 'Primeira'"
            >
              {migrating ? '⏳ Migrazione...' : '🔄 Migra Dati Esistenti'}
            </button>
          )}
          <button 
            className="create-session-button"
            onClick={() => setShowCreateModal(true)}
            disabled={loading}
          >
            ➕ Nuova Sessione
          </button>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Crea Nuova Sessione</h3>
            <input
              type="text"
              placeholder="Nome sessione (es. Progetto E-commerce)"
              value={newSessionName}
              onChange={(e) => setNewSessionName(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleCreateSession()}
              autoFocus
            />
            <div className="modal-actions">
              <button onClick={handleCreateSession} disabled={loading || !newSessionName.trim()}>
                Crea
              </button>
              <button onClick={() => setShowCreateModal(false)}>Annulla</button>
            </div>
          </div>
        </div>
      )}

      {loading && sessions.length === 0 ? (
        <div className="loading-sessions">
          <p>Caricamento sessioni...</p>
        </div>
      ) : sessions.length === 0 ? (
        <div className="no-sessions">
          <p>📭 Nessuna sessione creata.</p>
          <p>Crea una nuova sessione per iniziare a lavorare, oppure migra i dati esistenti se ne hai.</p>
        </div>
      ) : (
        <div className="sessions-list">
          {sessions.map((session) => (
            <div
              key={session.id}
              className={`session-card ${currentSession?.id === session.id ? 'active' : ''}`}
              onClick={() => onSessionSelect(session)}
            >
              <div className="session-card-header">
                <h3>{session.name}</h3>
                {currentSession?.id === session.id && (
                  <span className="active-badge">Attiva</span>
                )}
                {session.migrated && (
                  <span className="migrated-badge" title="Sessione migrata da dati legacy">Migrata</span>
                )}
              </div>
              <div className="session-card-info">
                <p>📅 Creata: {formatDate(session.createdAt)}</p>
                <p>🕒 Ultimo accesso: {formatDate(session.lastAccessed)}</p>
                <p>📊 Test cases: {session.testCasesCount || 0}</p>
                {session.basePath && (
                  <p className="session-path" title={session.basePath}>
                    📂 {session.basePath.length > 50 ? '...' + session.basePath.slice(-47) : session.basePath}
                  </p>
                )}
              </div>
              <div className="session-card-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const newName = prompt('Nuovo nome:', session.name);
                    if (newName && newName !== session.name) {
                      handleRenameSession(session.id, newName);
                    }
                  }}
                >
                  ✏️ Rinomina
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteSession(session.id);
                  }}
                  className="delete-button"
                >
                  🗑️ Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

