// frontend/src/services/api.js
// Client API generico

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const api = {
  /**
   * Apre dialog Windows per selezionare directory
   */
  async selectDirectory(description) {
    const response = await fetch(`${API_BASE}/dialog/select-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Estrae contesto da risorse (array di directory/file)
   */
  async extractContextFromResources(resources) {
    const response = await fetch(`${API_BASE}/context/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resources })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Scansiona una directory e trova tutti i file .js
   */
  async scanDirectory(directoryPath) {
    const response = await fetch(`${API_BASE}/resources/scan-directory`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ directoryPath })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Apre dialog Windows per selezionare file
   */
  async selectFile(description, filters) {
    const response = await fetch(`${API_BASE}/dialog/select-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description, filters })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Parsing di una frase Gherkin
   */
  async parseGherkin(sentence, context) {
    const response = await fetch(`${API_BASE}/llm/parse-gherkin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sentence, context })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Suggerisce automazione per una parte di azione
   */
  async suggestAutomation(actionPart, context, conversationHistory) {
    const response = await fetch(`${API_BASE}/llm/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ actionPart, context, conversationHistory })
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Chat interattiva con AI
   */
  async chatWithAI(message, actionPart, context, conversationHistory) {
    const response = await fetch(`${API_BASE}/llm/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        message, 
        actionPart, 
        context, 
        conversationHistory,
        wideReasoning: context.wideReasoning || false,
        similarTestCases: context.similarTestCases || []
      })
    });
    
    if (!response.ok) {
      // Prova a parsare come JSON, ma se fallisce restituisci il testo
      let errorData;
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        try {
          errorData = await response.json();
        } catch (e) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text.substring(0, 200)}`);
        }
      } else {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: La risposta non è JSON ma ${contentType || 'text/html'}. ${text.substring(0, 200)}`);
      }
      throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
    }
    
    // Verifica che la risposta sia JSON
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      const text = await response.text();
      throw new Error(`Risposta non è JSON ma ${contentType}. Contenuto: ${text.substring(0, 200)}`);
    }
    
    return response.json();
  },

  /**
   * Esegue codice Cypress
   */
  async runCypressCode(code, targetUrl, options = {}) {
    const response = await fetch(`${API_BASE}/cypress/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, targetUrl, options })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Ferma l'esecuzione Cypress in corso
   */
  async stopCypressExecution() {
    const response = await fetch(`${API_BASE}/cypress/stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Salva codice Cypress in un file senza eseguirlo
   */
  async saveCypressFile(code, filePath) {
    const response = await fetch(`${API_BASE}/cypress/save-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, filePath })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Parsa un file Cypress e estrae le fasi Given/When/Then
   */
  async parseTestFile(filePath) {
    const response = await fetch(`${API_BASE}/cypress/parse-test-file`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filePath })
    });
    
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    
    return response.json();
  },

  /**
   * Gestione sessioni
   */
  async getSessions() {
    const response = await fetch(`${API_BASE}/sessions`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async createSession(sessionData) {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sessionData)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async updateSession(sessionId, updates) {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async deleteSession(sessionId) {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}`, {
      method: 'DELETE'
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async getDefaultSessionsPath() {
    const response = await fetch(`${API_BASE}/sessions/default-path`);
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  },

  async migrateLegacyData(legacyData) {
    const response = await fetch(`${API_BASE}/sessions/migrate-legacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ legacyData })
    });
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }
    return response.json();
  }
};

