import { useState, useEffect, useCallback, useLayoutEffect } from 'react';

const STORAGE_KEY = 'g2a_resource_directories';

/**
 * Componente per gestire lista di risorse/directory
 */
export function ResourceList({ onSelectResource, onLogEvent, onAddResource, onGetResources }) {
  const [resources, setResources] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(resources));
    } catch (error) {
      console.error('Errore salvataggio risorse:', error);
    }
  }, [resources]);

  const addResource = useCallback((path) => {
    if (!path || !path.trim()) return;
    
    setResources(prev => {
      // Mantieni il path originale (con backslash per Windows)
      const normalizedPath = path.trim();
      
      // Verifica duplicati (case-insensitive per Windows)
      const normalizedLower = normalizedPath.toLowerCase();
      if (prev.some(r => r.path.toLowerCase() === normalizedLower)) {
        onLogEvent?.('warning', 'Directory già presente nella lista');
        return prev;
      }

      // Estrai il nome dalla directory (ultimo segmento del path)
      const pathParts = normalizedPath.split(/[/\\]/).filter(p => p);
      const newResource = {
        id: Date.now(),
        path: normalizedPath,
        name: pathParts[pathParts.length - 1] || normalizedPath,
        addedAt: new Date().toISOString()
      };

      onLogEvent?.('success', `Risorsa aggiunta: ${normalizedPath}`);
      return [newResource, ...prev];
    });
  }, [onLogEvent]);

  // Esponi addResource tramite callback - usa useLayoutEffect per essere sicuri che venga chiamato prima del paint
  useLayoutEffect(() => {
    if (onAddResource && typeof onAddResource === 'function') {
      onAddResource(addResource);
    }
  }, [addResource, onAddResource]);

  // Esponi funzione per ottenere tutte le risorse
  const getResources = useCallback(() => {
    return resources.map(r => r.path);
  }, [resources]);

  useLayoutEffect(() => {
    if (onGetResources && typeof onGetResources === 'function') {
      onGetResources(getResources);
    }
  }, [getResources, onGetResources]);

  const removeResource = (id) => {
    setResources(prev => prev.filter(r => r.id !== id));
    onLogEvent?.('info', 'Risorsa rimossa');
  };

  const handleSelect = (resource) => {
    onSelectResource?.(resource.path);
  };

  return (
    <div className="resource-list">
      <div className="resource-list-header">
        <h4>📚 Risorse Directory ({resources.length})</h4>
        <button
          onClick={() => setExpanded(!expanded)}
          className="toggle-button"
        >
          {expanded ? '▼' : '▶'}
        </button>
      </div>

      {expanded && (
        <div className="resource-list-content">
          {resources.length === 0 ? (
            <p className="empty-message">Nessuna risorsa aggiunta. Usa il pulsante (+) per aggiungere.</p>
          ) : (
            <ul className="resource-items">
              {resources.map((resource) => (
                <li key={resource.id} className="resource-item">
                  <div className="resource-info" onClick={() => handleSelect(resource)}>
                    <span className="resource-name">{resource.name}</span>
                    <span className="resource-path" title={resource.path}>
                      {resource.path}
                    </span>
                  </div>
                  <button
                    onClick={() => removeResource(resource.id)}
                    className="remove-button"
                    title="Rimuovi"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

