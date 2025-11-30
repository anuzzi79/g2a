import { useState, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { api } from '../services/api';
import { CypressRunner } from './CypressRunner';
import '../styles/TestCaseBuilder.css';

/**
 * Componente per costruire un test case con AI
 */
export function TestCaseBuilder({ testCase, context, onBack, onLogEvent }) {
  const [expandedBlocks, setExpandedBlocks] = useState({
    given: false,
    when: false,
    then: false
  });

  const [blockStates, setBlockStates] = useState({
    given: { messages: [], code: '', loading: false, prompt: '' },
    when: { messages: [], code: '', loading: false, prompt: '' },
    then: { messages: [], code: '', loading: false, prompt: '' }
  });

  const [showRunner, setShowRunner] = useState(false);
  const [runnerCode, setRunnerCode] = useState('');
  const [runnerBlockType, setRunnerBlockType] = useState(null);

  const toggleBlock = (blockType) => {
    setExpandedBlocks(prev => ({
      ...prev,
      [blockType]: !prev[blockType]
    }));
  };

  const handleSendPrompt = async (blockType, text) => {
    if (!text.trim() || !testCase || !context) return;

    const blockText = {
      given: testCase.given,
      when: testCase.when,
      then: testCase.then
    }[blockType];

    const currentState = blockStates[blockType];
    const newMessages = [...currentState.messages, { role: 'user', content: text }];
    
    // Aggiorna stato con nuovo messaggio utente
    setBlockStates(prev => ({
      ...prev,
      [blockType]: {
        ...prev[blockType],
        messages: newMessages,
        prompt: '',
        loading: true
      }
    }));

    onLogEvent?.('info', `Invio prompt per ${blockType}: ${text.substring(0, 50)}...`);

    try {
      // Crea actionPart basato sul blocco
      const actionPart = {
        type: blockType,
        description: blockText,
        target: null,
        value: null
      };

      // Ottimizza il contesto: invia solo i dati essenziali
      // Invece dell'intero oggetto context, invia solo i riferimenti
      const optimizedContext = {
        selectorsCount: context.selectors?.length || 0,
        methodsCount: context.methods?.length || 0,
        filesAnalyzed: context.filesAnalyzed?.length || 0,
        // Invia solo i primi 50 selettori e 10 metodi per ridurre il payload
        selectors: context.selectors?.slice(0, 50) || [],
        methods: context.methods?.slice(0, 10) || [],
        groupedSelectors: context.groupedSelectors || {}
      };

      const result = await api.chatWithAI(text, actionPart, optimizedContext, newMessages);
      
      // Estrai codice se presente nella risposta
      const codeMatch = result.response.match(/```(?:javascript|js|cypress)?\n?([\s\S]*?)```/);
      const extractedCode = codeMatch ? codeMatch[1].trim() : '';
      
      // Se non c'è codice in formato markdown, cerca direttamente comandi Cypress
      let finalCode = extractedCode;
      if (!finalCode && result.response.includes('cy.')) {
        // Estrai tutte le righe che contengono cy.
        const lines = result.response.split('\n').filter(line => 
          line.trim().startsWith('cy.') || 
          line.trim().match(/^\s*(cy\.|it\(|describe\(|before\(|after\()/)
        );
        finalCode = lines.join('\n');
      }

      setBlockStates(prev => ({
        ...prev,
        [blockType]: {
          ...prev[blockType],
          messages: [...newMessages, { role: 'assistant', content: result.response }],
          code: finalCode || prev[blockType].code,
          loading: false
        }
      }));

      if (finalCode) {
        onLogEvent?.('success', `Codice Cypress generato per ${blockType}`);
      }
    } catch (error) {
      onLogEvent?.('error', `Errore chat AI per ${blockType}: ${error.message}`);
      setBlockStates(prev => ({
        ...prev,
        [blockType]: {
          ...prev[blockType],
          messages: [...newMessages, { role: 'error', content: `Errore: ${error.message}` }],
          loading: false
        }
      }));
    }
  };

  const handlePromptChange = (blockType, value) => {
    setBlockStates(prev => ({
      ...prev,
      [blockType]: {
        ...prev[blockType],
        prompt: value
      }
    }));
  };

  if (!testCase) {
    return <div>Nessun test case selezionato</div>;
  }

  if (!context) {
    return (
      <div className="test-case-builder">
        <div className="builder-header">
          <button onClick={onBack} className="back-button">← Torna alla lista</button>
          <h2>Costruzione Test Case #{testCase.id}</h2>
        </div>
        <div className="warning-message">
          ⚠️ Contesto non disponibile. Torna alla pagina di setup e estrai il contesto dalle risorse prima di costruire i test case.
        </div>
      </div>
    );
  }

  return (
    <div className="test-case-builder">
      <div className="builder-header">
        <button onClick={onBack} className="back-button">← Torna alla lista</button>
        <h2>Costruzione Test Case #{testCase.id}</h2>
      </div>

      <GherkinBlock
        type="given"
        label="Given"
        text={testCase.given}
        isExpanded={expandedBlocks.given}
        onToggle={() => toggleBlock('given')}
        state={blockStates.given}
        onPromptChange={(value) => handlePromptChange('given', value)}
        onSendPrompt={(text) => handleSendPrompt('given', text)}
        context={context}
        onOpenRunner={() => {
          setRunnerCode(blockStates.given.code || '');
          setRunnerBlockType('given');
          setShowRunner(true);
        }}
      />

      <GherkinBlock
        type="when"
        label="When"
        text={testCase.when}
        isExpanded={expandedBlocks.when}
        onToggle={() => toggleBlock('when')}
        state={blockStates.when}
        onPromptChange={(value) => handlePromptChange('when', value)}
        onSendPrompt={(text) => handleSendPrompt('when', text)}
        context={context}
        onOpenRunner={() => {
          setRunnerCode(blockStates.when.code || '');
          setRunnerBlockType('when');
          setShowRunner(true);
        }}
      />

      <GherkinBlock
        type="then"
        label="Then"
        text={testCase.then}
        isExpanded={expandedBlocks.then}
        onToggle={() => toggleBlock('then')}
        state={blockStates.then}
        onPromptChange={(value) => handlePromptChange('then', value)}
        onSendPrompt={(text) => handleSendPrompt('then', text)}
        context={context}
        onOpenRunner={() => {
          setRunnerCode(blockStates.then.code || '');
          setRunnerBlockType('then');
          setShowRunner(true);
        }}
      />

      {showRunner && (
        <CypressRunner
          code={runnerCode}
          onClose={() => {
            setShowRunner(false);
            setRunnerCode('');
            setRunnerBlockType(null);
          }}
          onLogEvent={onLogEvent}
        />
      )}
    </div>
  );
}

/**
 * Blocco Gherkin espandibile (Given/When/Then)
 */
function GherkinBlock({ type, label, text, isExpanded, onToggle, state, onPromptChange, onSendPrompt, context, onOpenRunner }) {
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      onSendPrompt(state.prompt);
    }
  };

  return (
    <div className={`gherkin-block-container ${type} ${isExpanded ? 'expanded' : ''}`}>
      <div className="gherkin-block-header" onClick={onToggle}>
        <div className="gherkin-label">
          <span className="gherkin-type">{label}</span>
          <span className="gherkin-text">{text}</span>
        </div>
        <button className="toggle-button">{isExpanded ? '▼' : '▶'}</button>
      </div>

      {isExpanded && (
        <div className="gherkin-block-content">
          <div className="construction-panel">
            <div className="chat-section">
              <h4>💬 Dialoga con l'AI</h4>
              <p className="help-text">
                L'AI ha già analizzato il contesto. Chiedi come automatizzare questo step.
                <br />
                <small>Esempio: "Come posso automatizzare il click su Action/Copy?" o "Quale selettore usare per questo elemento?"</small>
              </p>
              
              <div className="messages-container">
                {state.messages.length === 0 ? (
                  <div className="empty-state">
                    <p>💡 Inizia a chiedere all'AI come automatizzare questo step</p>
                    <p className="suggestion-examples">
                      Suggerimenti:
                      <br />• "Come automatizzare questo step?"
                      <br />• "Quale selettore Cypress dovrei usare?"
                      <br />• "Genera il codice Cypress per {text.substring(0, 50)}..."
                    </p>
                  </div>
                ) : (
                  <div className="messages">
                    {state.messages.map((msg, i) => (
                      <div key={i} className={`message ${msg.role}`}>
                        <div className="message-header">
                          <strong>{msg.role === 'user' ? '👤 Tu' : msg.role === 'error' ? '❌ Errore' : '🤖 AI'}</strong>
                        </div>
                        <div className="message-content">{msg.content}</div>
                      </div>
                    ))}
                    {state.loading && (
                      <div className="message assistant">
                        <div className="message-header">
                          <strong>🤖 AI</strong>
                        </div>
                        <div className="message-content">
                          <div className="loading-dots">Pensando</div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="prompt-input-container">
                <textarea
                  className="prompt-input"
                  value={state.prompt}
                  onChange={(e) => onPromptChange(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder="Scrivi qui il tuo prompt per l'AI... (Ctrl+Enter per inviare)"
                  disabled={state.loading}
                  rows="3"
                />
                <button
                  className="send-button"
                  onClick={() => onSendPrompt(state.prompt)}
                  disabled={state.loading || !state.prompt.trim()}
                >
                  {state.loading ? '⏳ Invio...' : '📤 Invia'}
                </button>
              </div>
            </div>

            <div className="code-section">
              <div className="code-section-header">
                <h4>📝 Codice Cypress Generato</h4>
                {state.code && state.code.trim() && onOpenRunner && (
                  <button
                    className="test-runner-button"
                    onClick={() => onOpenRunner()}
                    title="Apri Test Runner per testare il codice"
                  >
                    🧪 Testa Codice
                  </button>
                )}
              </div>
              {state.code ? (
                <div className="code-display">
                  <SyntaxHighlighter
                    language="javascript"
                    style={vscDarkPlus}
                    customStyle={{
                      margin: 0,
                      borderRadius: '8px',
                      padding: '20px'
                    }}
                  >
                    {state.code}
                  </SyntaxHighlighter>
                  <div className="code-actions">
                    <button
                      className="copy-code-button"
                      onClick={() => {
                        navigator.clipboard.writeText(state.code);
                        alert('Codice copiato negli appunti!');
                      }}
                    >
                      📋 Copia Codice
                    </button>
                    {onOpenRunner && (
                      <button
                        className="test-runner-button-inline"
                        onClick={() => onOpenRunner()}
                        title="Apri Test Runner per testare il codice"
                      >
                        ▶️ Testa Codice
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="no-code">
                  <p>Il codice Cypress apparirà qui dopo che l'AI lo genererà.</p>
                  <p className="hint">💡 Chiedi all'AI di generare il codice Cypress per questo step</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

