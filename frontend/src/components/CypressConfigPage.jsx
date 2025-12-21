import React, { useState, useEffect } from 'react';
import '../styles/CypressConfigPage.css';

const CypressConfigPage = () => {
  const [config, setConfig] = useState({
    cypressConfig: '',
    envFile: '',
    packageFile: '',
    commandsFile: '',
    e2eFile: '',
    pagesDirectory: ''
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  // Carica configurazione esistente al mount
  useEffect(() => {
    loadExistingConfig();
  }, []);

  const loadExistingConfig = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/cypress-config');
      const data = await response.json();
      
      if (data.success && data.config) {
        setConfig({
          cypressConfig: data.config.cypressConfig || '',
          envFile: data.config.envFile || '',
          packageFile: data.config.packageFile || '',
          commandsFile: data.config.commandsFile || '',
          e2eFile: data.config.e2eFile || '',
          pagesDirectory: data.config.pagesDirectory || ''
        });
      }
    } catch (error) {
      console.error('Error loading config:', error);
    }
  };

  const handleSelectFile = async (fieldName) => {
    try {
      setLoading(true);
      // Usa l'API dialog del backend per ottenere il path completo
      const response = await fetch('http://localhost:3001/api/dialog/select-file', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Seleziona File',
          filters: 'File JavaScript|*.js|File JSON|*.json|Tutti i file|*.*'
        })
      });

      const data = await response.json();
      console.log('File dialog response:', data);

      if (data.canceled) {
        setLoading(false);
        return; // Utente ha annullato
      }

      if (data.path) {
        console.log('Setting file path:', data.path);
        setConfig(prev => ({ ...prev, [fieldName]: data.path }));
      } else {
        setMessage({ type: 'error', text: 'Nessun percorso ricevuto dal dialog' });
      }
    } catch (error) {
      console.error('Error selecting file:', error);
      setMessage({ type: 'error', text: `Errore nella selezione del file: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectDirectory = async (fieldName) => {
    try {
      setLoading(true);
      // Usa l'API dialog del backend per ottenere il path completo della directory
      const response = await fetch('http://localhost:3001/api/dialog/select-directory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: 'Seleziona Directory'
        })
      });

      const data = await response.json();
      console.log('Directory dialog response:', data);

      if (data.canceled) {
        setLoading(false);
        return; // Utente ha annullato
      }

      if (data.path) {
        console.log('Setting directory path:', data.path);
        setConfig(prev => ({ ...prev, [fieldName]: data.path }));
      } else {
        setMessage({ type: 'error', text: 'Nessun percorso ricevuto dal dialog' });
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
      setMessage({ type: 'error', text: `Errore nella selezione della directory: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  const validateAndSave = async () => {
    // Verifica che i file obbligatori siano configurati
    if (!config.cypressConfig || !config.packageFile || !config.commandsFile) {
      setMessage({
        type: 'error',
        text: 'Mancano file obbligatori: cypress.config.js, package.json, commands.js'
      });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch('http://localhost:3001/api/cypress-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });

      const data = await response.json();

      if (data.success) {
        setMessage({ type: 'success', text: '✅ Configurazione salvata con successo!' });
        // Nascondi il messaggio dopo 3 secondi
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: `Errore: ${data.error}` });
      }
    } catch (error) {
      console.error('Error saving config:', error);
      setMessage({ type: 'error', text: 'Errore nel salvataggio della configurazione' });
    } finally {
      setLoading(false);
    }
  };


  const isConfigured = (field) => {
    return config[field] && config[field].length > 0;
  };

  const canSave = () => {
    return isConfigured('cypressConfig') && 
           isConfigured('packageFile') && 
           isConfigured('commandsFile');
  };

  return (
    <div className="cypress-config-page">
      <div className="config-header">
        <h1>🔧 Configurazione Sorgenti Cypress</h1>
        <p>Configura i percorsi ai file del tuo progetto Cypress esistente</p>
      </div>

      {message && (
        <div className={`message message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* SEZIONE A: Configurazione */}
      <div className="config-section">
        <h2>📁 Seleziona File di Configurazione</h2>
        
        {/* Slot 1: cypress.config.js */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('cypressConfig') ? 'configured' : ''}`}>
              {isConfigured('cypressConfig') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova il file delle configurazioni Cypress?
              <span className="required">*</span>
              <span className="example">(es. cypress.config.js)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.cypressConfig}
              onChange={(e) => setConfig(prev => ({ ...prev, cypressConfig: e.target.value }))}
              placeholder="Percorso completo del file cypress.config.js"
            />
            <button type="button" onClick={() => handleSelectFile('cypressConfig')}>
              📁 Sfoglia File
            </button>
          </div>
        </div>

        {/* Slot 2: cypress.env.json */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('envFile') ? 'configured' : ''}`}>
              {isConfigured('envFile') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova il file delle credenziali, URL, ecc.?
              <span className="example">(es. cypress.env.json)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.envFile}
              onChange={(e) => setConfig(prev => ({ ...prev, envFile: e.target.value }))}
              placeholder="Percorso completo del file cypress.env.json"
            />
            <button type="button" onClick={() => handleSelectFile('envFile')}>
              📁 Sfoglia File
            </button>
          </div>
        </div>

        {/* Slot 3: package.json */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('packageFile') ? 'configured' : ''}`}>
              {isConfigured('packageFile') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova il file delle dipendenze del progetto?
              <span className="required">*</span>
              <span className="example">(es. package.json)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.packageFile}
              onChange={(e) => setConfig(prev => ({ ...prev, packageFile: e.target.value }))}
              placeholder="Percorso completo del file package.json"
            />
            <button type="button" onClick={() => handleSelectFile('packageFile')}>
              📁 Sfoglia File
            </button>
          </div>
        </div>

        {/* Slot 4: commands.js */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('commandsFile') ? 'configured' : ''}`}>
              {isConfigured('commandsFile') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova il file dei comandi custom?
              <span className="required">*</span>
              <span className="example">(es. cypress/support/commands.js)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.commandsFile}
              onChange={(e) => setConfig(prev => ({ ...prev, commandsFile: e.target.value }))}
              placeholder="Percorso completo del file commands.js"
            />
            <button type="button" onClick={() => handleSelectFile('commandsFile')}>
              📁 Sfoglia File
            </button>
          </div>
        </div>

        {/* Slot 5: e2e.js */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('e2eFile') ? 'configured' : ''}`}>
              {isConfigured('e2eFile') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova il file di setup e2e?
              <span className="example">(es. cypress/support/e2e.js)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.e2eFile}
              onChange={(e) => setConfig(prev => ({ ...prev, e2eFile: e.target.value }))}
              placeholder="Percorso completo del file e2e.js"
            />
            <button type="button" onClick={() => handleSelectFile('e2eFile')}>
              📁 Sfoglia File
            </button>
          </div>
        </div>

        {/* Slot 6: pages directory */}
        <div className="config-slot">
          <div className="slot-header">
            <span className={`status-icon ${isConfigured('pagesDirectory') ? 'configured' : ''}`}>
              {isConfigured('pagesDirectory') ? '✅' : '⚪'}
            </span>
            <label>
              Dove si trova la cartella dei Page Objects?
              <span className="example">(es. cypress/pages/)</span>
            </label>
          </div>
          <div className="slot-input">
            <input
              type="text"
              value={config.pagesDirectory}
              onChange={(e) => setConfig(prev => ({ ...prev, pagesDirectory: e.target.value }))}
              placeholder="Percorso completo della cartella pages"
            />
            <button type="button" onClick={() => handleSelectDirectory('pagesDirectory')}>
              📂 Sfoglia Cartella
            </button>
          </div>
        </div>

        <div className="config-actions">
          <button
            type="button"
            className="save-button"
            onClick={validateAndSave}
            disabled={!canSave() || loading}
          >
            {loading ? '⏳ Salvataggio...' : '💾 Salva Configurazione'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CypressConfigPage;

