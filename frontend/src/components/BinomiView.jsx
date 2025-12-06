import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import '../styles/BinomiView.css';

export function BinomiView({ sessionId, onBack, onLogEvent, onBinomioDeleted }) {
  const [binomi, setBinomi] = useState([]);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTestCase, setFilterTestCase] = useState('');
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    const loadData = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const [binomiResult, objectsResult] = await Promise.all([
          api.getBinomi(sessionId),
          api.getECObjects(sessionId)
        ]);
        setBinomi(binomiResult.binomi || []);
        setObjects(objectsResult.objects || []);
        onLogEvent?.('info', `Caricati ${binomiResult.binomi?.length || 0} binomi`);
      } catch (error) {
        console.error('Errore caricamento binomi:', error);
        onLogEvent?.('error', `Errore caricamento binomi: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [sessionId, onLogEvent]);

  // Trova oggetto per ID
  const findObject = (objectId) => {
    return objects.find(obj => obj.id === objectId);
  };

  // Filtra e ordina binomi
  const filteredAndSortedBinomi = useMemo(() => {
    let filtered = binomi;

    // Filtro per testo (cerca negli ID oggetti)
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(b => 
        b.id?.toLowerCase().includes(searchLower) ||
        b.fromObjectId?.toLowerCase().includes(searchLower) ||
        b.toObjectId?.toLowerCase().includes(searchLower)
      );
    }

    // Filtro per test case
    if (filterTestCase) {
      filtered = filtered.filter(b => b.testCaseId === filterTestCase);
    }

    // Ordinamento
    filtered.sort((a, b) => {
      let aVal = a[sortColumn];
      let bVal = b[sortColumn];
      
      if (sortColumn === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });

    return filtered;
  }, [binomi, searchText, filterTestCase, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getUniqueTestCases = () => {
    const testCases = new Set(binomi.map(b => b.testCaseId).filter(Boolean));
    return Array.from(testCases).sort();
  };

  const handleDeleteAllBinomi = async () => {
    if (!sessionId) return;
    
    const confirmed = window.confirm(
      `Sei sicuro di voler cancellare TUTTI i ${binomi.length} binomi di questa sessione? Questa azione non può essere annullata.`
    );
    
    if (!confirmed) return;
    
    try {
      onLogEvent?.('info', '🗑️ Eliminazione di tutti i binomi in corso...');
      
      // Cancella tutti i binomi uno per uno
      for (const binomio of binomi) {
        await api.deleteBinomio(sessionId, binomio.id);
      }
      
      // Ricarica i dati
      const [binomiResult, objectsResult] = await Promise.all([
        api.getBinomi(sessionId),
        api.getECObjects(sessionId)
      ]);
      setBinomi(binomiResult.binomi || []);
      setObjects(objectsResult.objects || []);
      
      // Notifica che tutti i binomi sono stati eliminati
      if (onBinomioDeleted) {
        // Chiama la callback per ogni binomio eliminato
        binomi.forEach(b => onBinomioDeleted(b.id));
      }
      
      onLogEvent?.('success', `✅ Tutti i ${binomi.length} binomi sono stati eliminati`);
    } catch (error) {
      console.error('Errore eliminazione binomi:', error);
      onLogEvent?.('error', `❌ Errore eliminazione binomi: ${error.message}`);
    }
  };

  if (loading) {
    return (
      <div className="binomi-view">
        <div className="loading">Caricamento binomi...</div>
      </div>
    );
  }

  return (
    <div className="binomi-view">
      <div className="binomi-header">
        <h2>🔗 Binomi Fondamentali</h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button 
            onClick={handleDeleteAllBinomi}
            className="delete-all-button"
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '14px'
            }}
            disabled={binomi.length === 0}
          >
            🗑️ Cancella Tutti i Binomi
          </button>
          <button onClick={onBack} className="back-button">
            ← Torna indietro
          </button>
        </div>
      </div>

      <div className="binomi-filters">
        <div className="filter-group">
          <label>Ricerca:</label>
          <input
            type="text"
            placeholder="Cerca per ID binomio o oggetti..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="search-input"
          />
        </div>

        <div className="filter-group">
          <label>Test Case:</label>
          <select
            value={filterTestCase}
            onChange={(e) => setFilterTestCase(e.target.value)}
            className="filter-select"
          >
            <option value="">Tutti</option>
            {getUniqueTestCases().map(tcId => (
              <option key={tcId} value={tcId}>TC {tcId}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="binomi-stats">
        <span>Totale: {binomi.length} | Visualizzati: {filteredAndSortedBinomi.length}</span>
      </div>

      <div className="binomi-table-container">
        <table className="binomi-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')} className="sortable">
                ID Binomio {sortColumn === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('testCaseId')} className="sortable">
                Test Case {sortColumn === 'testCaseId' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Oggetto From</th>
              <th>Oggetto To</th>
              <th>Punto From</th>
              <th>Punto To</th>
              <th onClick={() => handleSort('createdAt')} className="sortable">
                Data Creazione {sortColumn === 'createdAt' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedBinomi.length === 0 ? (
              <tr>
                <td colSpan="7" className="no-data">
                  Nessun binomio trovato
                </td>
              </tr>
            ) : (
              filteredAndSortedBinomi.map((b) => {
                const fromObj = findObject(b.fromObjectId);
                const toObj = findObject(b.toObjectId);
                
                return (
                  <tr key={b.id}>
                    <td className="id-cell">{b.id}</td>
                    <td>TC {b.testCaseId}</td>
                    <td className="object-cell">
                      <div className="object-id">{b.fromObjectId}</div>
                      {fromObj && (
                        <div className="object-text" title={fromObj.text}>
                          {fromObj.text || '-'}
                        </div>
                      )}
                    </td>
                    <td className="object-cell">
                      <div className="object-id">{b.toObjectId}</div>
                      {toObj && (
                        <div className="object-text" title={toObj.text}>
                          {toObj.text || '-'}
                        </div>
                      )}
                    </td>
                    <td className="point-cell">
                      {b.fromPoint ? `(${b.fromPoint.x.toFixed(2)}, ${b.fromPoint.y.toFixed(2)})` : '-'}
                    </td>
                    <td className="point-cell">
                      {b.toPoint ? `(${b.toPoint.x.toFixed(2)}, ${b.toPoint.y.toFixed(2)})` : '-'}
                    </td>
                    <td className="date-cell">
                      {b.createdAt
                        ? new Date(b.createdAt).toLocaleString('it-IT')
                        : '-'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}



