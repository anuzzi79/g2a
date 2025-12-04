import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import '../styles/ECObjectsView.css';

export function ECObjectsView({ sessionId, onBack, onLogEvent }) {
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTestCase, setFilterTestCase] = useState('');
  const [filterBoxType, setFilterBoxType] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');

  useEffect(() => {
    const loadObjects = async () => {
      if (!sessionId) {
        setLoading(false);
        return;
      }
      
      try {
        setLoading(true);
        const result = await api.getECObjects(sessionId);
        setObjects(result.objects || []);
        onLogEvent?.('info', `Caricati ${result.objects?.length || 0} oggetti EC`);
      } catch (error) {
        console.error('Errore caricamento oggetti EC:', error);
        onLogEvent?.('error', `Errore caricamento oggetti EC: ${error.message}`);
      } finally {
        setLoading(false);
      }
    };
    
    loadObjects();
  }, [sessionId, onLogEvent]);

  // Filtra e ordina oggetti
  const filteredAndSortedObjects = useMemo(() => {
    let filtered = objects;

    // Filtro per testo
    if (searchText) {
      const searchLower = searchText.toLowerCase();
      filtered = filtered.filter(obj => 
        obj.text?.toLowerCase().includes(searchLower) ||
        obj.id?.toLowerCase().includes(searchLower)
      );
    }

    // Filtro per test case
    if (filterTestCase) {
      filtered = filtered.filter(obj => obj.testCaseId === filterTestCase);
    }

    // Filtro per box type
    if (filterBoxType) {
      filtered = filtered.filter(obj => obj.boxType === filterBoxType);
    }

    // Filtro per location
    if (filterLocation) {
      filtered = filtered.filter(obj => obj.location === filterLocation);
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
  }, [objects, searchText, filterTestCase, filterBoxType, filterLocation, sortColumn, sortDirection]);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getUniqueTestCases = () => {
    const testCases = new Set(objects.map(obj => obj.testCaseId).filter(Boolean));
    return Array.from(testCases).sort();
  };

  if (loading) {
    return (
      <div className="ec-objects-view">
        <div className="loading">Caricamento oggetti EC...</div>
      </div>
    );
  }

  return (
    <div className="ec-objects-view">
      <div className="ec-objects-header">
        <h2>📊 Oggetti EC</h2>
        <button onClick={onBack} className="back-button">
          ← Torna indietro
        </button>
      </div>

      <div className="ec-objects-filters">
        <div className="filter-group">
          <label>Ricerca:</label>
          <input
            type="text"
            placeholder="Cerca per testo o ID..."
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

        <div className="filter-group">
          <label>Box Type:</label>
          <select
            value={filterBoxType}
            onChange={(e) => setFilterBoxType(e.target.value)}
            className="filter-select"
          >
            <option value="">Tutti</option>
            <option value="given">GIVEN</option>
            <option value="when">WHEN</option>
            <option value="then">THEN</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Location:</label>
          <select
            value={filterLocation}
            onChange={(e) => setFilterLocation(e.target.value)}
            className="filter-select"
          >
            <option value="">Tutte</option>
            <option value="header">Header</option>
            <option value="content">Content</option>
          </select>
        </div>
      </div>

      <div className="ec-objects-stats">
        <span>Totale: {objects.length} | Visualizzati: {filteredAndSortedObjects.length}</span>
      </div>

      <div className="ec-objects-table-container">
        <table className="ec-objects-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')} className="sortable">
                ID {sortColumn === 'id' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('testCaseId')} className="sortable">
                Test Case {sortColumn === 'testCaseId' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('boxType')} className="sortable">
                Box Type {sortColumn === 'boxType' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('boxNumber')} className="sortable">
                Box # {sortColumn === 'boxNumber' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('text')} className="sortable">
                Testo {sortColumn === 'text' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th onClick={() => handleSort('location')} className="sortable">
                Location {sortColumn === 'location' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Indici</th>
              <th onClick={() => handleSort('createdAt')} className="sortable">
                Data Creazione {sortColumn === 'createdAt' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedObjects.length === 0 ? (
              <tr>
                <td colSpan="8" className="no-data">
                  Nessun oggetto EC trovato
                </td>
              </tr>
            ) : (
              filteredAndSortedObjects.map((obj) => (
                <tr key={obj.id}>
                  <td className="id-cell">{obj.id}</td>
                  <td>TC {obj.testCaseId}</td>
                  <td>
                    <span className={`box-type-badge ${obj.boxType}`}>
                      {obj.boxType?.toUpperCase()}
                    </span>
                  </td>
                  <td>{obj.boxNumber}</td>
                  <td className="text-cell" title={obj.text}>
                    {obj.text || '-'}
                  </td>
                  <td>
                    <span className={`location-badge ${obj.location}`}>
                      {obj.location}
                    </span>
                  </td>
                  <td className="indices-cell">
                    {obj.startIndex !== undefined && obj.endIndex !== undefined
                      ? `${obj.startIndex}-${obj.endIndex}`
                      : '-'}
                  </td>
                  <td className="date-cell">
                    {obj.createdAt
                      ? new Date(obj.createdAt).toLocaleString('it-IT')
                      : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

