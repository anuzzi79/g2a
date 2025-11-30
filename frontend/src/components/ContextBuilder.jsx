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
    // Ottieni le risorse dalla lista
    if (!resourcesListRef.current) {
      setError('Lista risorse non ancora inizializzata');
      onLogEvent?.('error', 'Attendi qualche istante e riprova');
      return;
    }

    const resources = resourcesListRef.current();
    console.log('Risorse ottenute dalla lista:', resources);
    
    if (!resources || resources.length === 0) {
      setError('Nessuna risorsa nella lista');
      onLogEvent?.('error', 'Aggiungi almeno una risorsa (directory o file) prima di estrarre il contesto');
      return;
    }

    setExtracting(true);
    setError(null);
    onLogEvent?.('info', `Estrazione contesto da ${resources.length} risors${resources.length > 1 ? 'e' : 'a'}`);

    try {
      console.log('Chiamata API con resources:', resources);
      const result = await api.extractContextFromResources(resources);
      
      if (result.error) {
        setError(result.error);
        onLogEvent?.('error', 'Errore estrazione contesto', { error: result.error });
        return;
      }

      setContext(result.context);
      onContextReady?.(result.context);
      
      localStorage.setItem('g2a_context', JSON.stringify(result.context));
      onLogEvent?.('success', 'Contesto estratto con successo', {
        selectors: result.context.selectors?.length || 0,
        methods: result.context.methods?.length || 0,
        filesAnalyzed: result.context.filesAnalyzed?.length || 0
      });
    } catch (err) {
      const errorMsg = 'Errore estrazione: ' + err.message;
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

      <div className="section">
        <button 
          onClick={extractContext} 
          disabled={extracting}
          className="primary-button"
          title="Estrai il contesto dalle risorse aggiunte"
        >
          {extracting ? '🔍 Estraendo contesto...' : 'Estrai Contesto'}
        </button>
      </div>

      {context && (
        <div className="context-summary">
          <h4>📊 Contesto Estratto</h4>
          <ul>
            <li>Selettori: <strong>{context.selectors?.length || 0}</strong></li>
            <li>Metodi: <strong>{context.methods?.length || 0}</strong></li>
            <li>File analizzati: <strong>{context.filesAnalyzed?.length || 0}</strong></li>
            <li>Gruppi: <strong>{Object.keys(context.groupedSelectors || {}).length}</strong></li>
          </ul>
        </div>
      )}
    </div>
  );
}
