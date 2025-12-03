import { useState, useRef } from 'react';
import { ResourceSelector } from './ResourceSelector';
import { ResourceList } from './ResourceList';
import { api } from '../services/api';

/**
 * Componente per costruire contesto LLM
 */
export function ContextBuilder({ onContextReady, onLogEvent }) {
  const [docs, setDocs] = useState([]);
  const [extracting, setExtracting] = useState(false);
  const [context, setContext] = useState(null);
  const [error, setError] = useState(null);
  const addResourceFnRef = useRef(null);
  const resourcesListRef = useRef(null);

  const handleDocUpload = (e) => {
    const files = Array.from(e.target.files);
    setDocs(files);
    onLogEvent?.('info', `${files.length} documenti caricati`, { files: files.map(f => f.name) });
  };


  const handleAddToResources = async (path) => {
    const addFn = addResourceFnRef.current;
    
    if (!addFn) {
      onLogEvent?.('warning', 'Lista risorse non ancora inizializzata. Attendi qualche istante e riprova.');
      setTimeout(async () => {
        const retryFn = addResourceFnRef.current;
        if (retryFn) {
          await handleAddToResources(path);
        }
      }, 500);
      return;
    }

    try {
      // Verifica se è un file o una directory
      const isFile = path.endsWith('.js') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.tsx');
      
      if (isFile) {
        // Se è un file, aggiungilo direttamente
        addFn(path);
        onLogEvent?.('success', `File aggiunto: ${path}`);
      } else {
        // Se è una directory, scansiona per trovare file .js
        onLogEvent?.('info', `Scansione directory: ${path}`);
        
        const result = await api.scanDirectory(path);
        
        if (result.error) {
          onLogEvent?.('error', `Errore scansione: ${result.error}`);
          // Fallback: aggiungi solo la directory
          addFn(path);
          return;
        }

        if (result.files && result.files.length > 0) {
          // Aggiungi tutti i file .js trovati
          let addedCount = 0;
          for (const file of result.files) {
            addFn(file.path);
            addedCount++;
          }
          onLogEvent?.('success', `${addedCount} file .js aggiunti dalla directory ${path}`);
        } else {
          // Nessun file trovato, aggiungi solo la directory
          onLogEvent?.('warning', `Nessun file .js trovato in ${path}, aggiunta solo la directory`);
          addFn(path);
        }
      }
    } catch (error) {
      onLogEvent?.('error', `Errore durante scansione: ${error.message}`);
      // Fallback: aggiungi solo il path
      const fallbackFn = addResourceFnRef.current;
      if (fallbackFn) {
        fallbackFn(path);
      }
    }
  };

  const handleSelectFromResources = (path) => {
    // Selezione dalla lista non cambia projectPath
    onLogEvent?.('info', `Risorsa selezionata dalla lista: ${path}`);
  };

  const extractContext = async () => {
    // DISABILITATO: Estrazione contesto da page objects
    // Ora usiamo solo Wide Reasoning sui test case esistenti
    setExtracting(true);
    setError(null);
    onLogEvent?.('info', 'Contesto page objects disabilitato. Usa Wide Reasoning nei test case per trovare codice simile.');
    
    try {
      // Crea un contesto vuoto (solo per compatibilità)
      const emptyContext = {
        selectors: [],
        methods: [],
        filesAnalyzed: [],
        resources: [],
        groupedSelectors: {}
      };
      
      setContext(emptyContext);
      onContextReady?.(emptyContext);
      localStorage.setItem('g2a_context', JSON.stringify(emptyContext));
      onLogEvent?.('success', 'Contesto inizializzato (page objects disabilitate)');
    } catch (err) {
      const errorMsg = 'Errore inizializzazione contesto: ' + err.message;
      setError(errorMsg);
      onLogEvent?.('error', errorMsg, { error: err.message });
    } finally {
      setExtracting(false);
    }
  };

  return (
    <div className="context-builder card">
      <h3>📁 Setup Contesto LLM</h3>
      
      <div className="section">
        <label>1. Upload Documenti/Specifiche (opzionale)</label>
        <input
          type="file"
          multiple
          accept=".pdf,.docx,.txt,.json,.md"
          onChange={handleDocUpload}
        />
        {docs.length > 0 && (
          <p className="success">✅ {docs.length} file caricati</p>
        )}
      </div>

      {/* DISABILITATO: Sezione page objects rimossa temporaneamente
      Il reclutamento delle page objects nel reasoning è stato disabilitato.
      Ora si usa esclusivamente il Wide Reasoning sui test case esistenti.
      <div className="section">
        <label>2. Risorse per il Contesto</label>
        <p className="help-text">Aggiungi directory o file che l'LLM userà come ispirazione per il reasoning durante l'automazione</p>
        <ResourceSelector
          onAddResource={handleAddToResources}
          onLogEvent={onLogEvent}
        />
        
        <ResourceList 
          onSelectResource={handleSelectFromResources}
          onLogEvent={onLogEvent}
          onAddResource={(fn) => { addResourceFnRef.current = fn; }}
          onGetResources={(getFn) => { 
            resourcesListRef.current = getFn;
            console.log('ResourceList getResources callback registrato');
          }}
        />
        {error && <p className="error">❌ {error}</p>}
      </div>
      */}

      <div className="section">
        <button 
          onClick={extractContext} 
          disabled={extracting}
          className="primary-button"
          title="Inizializza il contesto (page objects disabilitate, usa Wide Reasoning nei test case)"
        >
          {extracting ? '🔍 Inizializzando contesto...' : 'Inizializza Contesto'}
        </button>
        <p className="help-text" style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
          💡 Le page objects sono state disabilitate. Usa il <strong>Wide Reasoning</strong> nei test case per trovare codice simile da altri test esistenti.
        </p>
      </div>

      {context && (
        <div className="context-summary">
          <h4>📊 Contesto Inizializzato</h4>
          <ul>
            <li>Page Objects: <strong>Disabilitate</strong></li>
            <li>Wide Reasoning: <strong>Attivo</strong> (usa nei test case)</li>
          </ul>
          <p style={{ marginTop: '10px', fontSize: '0.9em', color: '#666' }}>
            Il reasoning ora si basa esclusivamente sul Wide Reasoning sui test case esistenti.
          </p>
        </div>
      )}
    </div>
  );
}
