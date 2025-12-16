import { useState, useEffect, useMemo } from 'react';
import { api } from '../services/api';
import '../styles/BinomiView.css';

export function BinomiView({ sessionId, onBack, onLogEvent, onBinomioDeleted }) {
  const [binomi, setBinomi] = useState([]);
  const [objects, setObjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [filterTestCase, setFilterTestCase] = useState('');
  const [filterStatus, setFilterStatus] = useState(''); // 'all' | 'active' | 'disabled'
  const [sortColumn, setSortColumn] = useState('createdAt');
  const [sortDirection, setSortDirection] = useState('desc');
  const [showModal, setShowModal] = useState(false);
  const [selectedBinomio, setSelectedBinomio] = useState(null);
  const [modalAction, setModalAction] = useState(null); // 'disable' | 'enable'
  const [modalReason, setModalReason] = useState('');

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

  // Helper per appendere testo al Documento di Contesto
  const appendToContextDocument = async (textToAppend) => {
    try {
      const dcResult = await api.getContextDocument(sessionId);
      const currentText = dcResult.document?.text || '';
      const separator = currentText.trim() ? '\n\n' : '';
      const timestamp = new Date().toISOString();
      const newText = currentText + separator + `[${timestamp}] BINOMIO_STATUS_CHANGE\n${textToAppend}`;
      await api.saveContextDocument(sessionId, newText);
    } catch (error) {
      console.error('Errore append al DC:', error);
      onLogEvent?.('warning', `Impossibile aggiornare Documento di Contesto: ${error.message}`);
    }
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

    // Filtro per status
    if (filterStatus === 'active') {
      filtered = filtered.filter(b => (b.status || 'active') === 'active');
    } else if (filterStatus === 'disabled') {
      filtered = filtered.filter(b => b.status === 'disabled');
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
  }, [binomi, searchText, filterTestCase, filterStatus, sortColumn, sortDirection]);

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

  const handleStatusChange = (binomio, action) => {
    setSelectedBinomio(binomio);
    setModalAction(action);
    setModalReason('');
    setShowModal(true);
  };

  const handleModalConfirm = async () => {
    if (!modalReason.trim()) {
      alert('Inserisci una motivazione');
      return;
    }

    if (!selectedBinomio || !modalAction) return;

    try {
      const newStatus = modalAction === 'disable' ? 'disabled' : 'active';
      await api.updateBinomioStatus(sessionId, selectedBinomio.id, newStatus, modalReason.trim());
      
      // Appendi al DC
      const fromObj = findObject(selectedBinomio.fromObjectId);
      const toObj = findObject(selectedBinomio.toObjectId);
      const fromText = fromObj?.text || selectedBinomio.fromObjectId;
      const toText = toObj?.text || selectedBinomio.toObjectId;
      
      const dcText = `Binomio: ${selectedBinomio.id}\nDa: ${selectedBinomio.status || 'active'}\nA: ${newStatus}\nMotivo: ${modalReason.trim()}\nOggetto From: ${fromText}\nOggetto To: ${toText}`;
      await appendToContextDocument(dcText);
      
      // Ricarica i dati
      const [binomiResult, objectsResult] = await Promise.all([
        api.getBinomi(sessionId),
        api.getECObjects(sessionId)
      ]);
      setBinomi(binomiResult.binomi || []);
      setObjects(objectsResult.objects || []);
      
      setShowModal(false);
      setSelectedBinomio(null);
      setModalAction(null);
      setModalReason('');
      
      onLogEvent?.('success', `Binomio ${newStatus === 'disabled' ? 'disattivato' : 'riattivato'} con successo`);
    } catch (error) {
      console.error('Errore aggiornamento status binomio:', error);
      onLogEvent?.('error', `Errore aggiornamento status: ${error.message}`);
    }
  };

  const handleModalCancel = () => {
    setShowModal(false);
    setSelectedBinomio(null);
    setModalAction(null);
    setModalReason('');
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

        <div className="filter-group">
          <label>Status:</label>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="filter-select"
          >
            <option value="">Tutti</option>
            <option value="active">Attivi</option>
            <option value="disabled">Disattivati</option>
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
              <th onClick={() => handleSort('status')} className="sortable">
                Status {sortColumn === 'status' && (sortDirection === 'asc' ? '↑' : '↓')}
              </th>
              <th>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filteredAndSortedBinomi.length === 0 ? (
              <tr>
                <td colSpan="9" className="no-data">
                  Nessun binomio trovato
                </td>
              </tr>
            ) : (
              filteredAndSortedBinomi.map((b) => {
                const fromObj = findObject(b.fromObjectId);
                const toObj = findObject(b.toObjectId);
                const status = b.status || 'active';
                const isDisabled = status === 'disabled';
                
                return (
                  <tr key={b.id} className={isDisabled ? 'binomio-disabled' : ''}>
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
                    <td className="status-cell">
                      <span className={`status-badge status-${status}`}>
                        {status === 'disabled' ? 'Disattivato' : 'Attivo'}
                      </span>
                    </td>
                    <td className="actions-cell">
                      {isDisabled ? (
                        <button
                          onClick={() => handleStatusChange(b, 'enable')}
                          className="action-button enable-button"
                          title="Riattiva binomio"
                        >
                          ✓ Riattiva
                        </button>
                      ) : (
                        <button
                          onClick={() => handleStatusChange(b, 'disable')}
                          className="action-button disable-button"
                          title="Disattiva binomio"
                        >
                          ✗ Disattiva
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal per motivazione */}
      {showModal && (
        <div className="modal-overlay" onClick={handleModalCancel}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>
              {modalAction === 'disable' ? 'Disattiva Binomio' : 'Riattiva Binomio'}
            </h3>
            <p>
              Binomio: <strong>{selectedBinomio?.id}</strong>
            </p>
            <label>
              Motivazione (obbligatoria):
              <textarea
                value={modalReason}
                onChange={(e) => setModalReason(e.target.value)}
                placeholder="Inserisci la motivazione per questa azione..."
                rows={4}
                className="modal-textarea"
              />
            </label>
            <div className="modal-actions">
              <button onClick={handleModalCancel} className="modal-button cancel-button">
                Annulla
              </button>
              <button onClick={handleModalConfirm} className="modal-button confirm-button">
                Conferma
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



