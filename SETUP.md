# Setup Guide - G2A

## Prerequisiti

- Node.js 18+ installato
- npm o yarn
- Windows OS (per dialog nativo)

## Installazione

1. **Installa le dipendenze:**
```bash
npm install
```

2. **Configura le variabili d'ambiente:**
```bash
# Copia env.example come .env
cp env.example .env

# Edita .env e aggiungi la tua OpenAI API Key
# OPENAI_API_KEY=sk-...
```

## Avvio

```bash
npm run dev
```

Questo avvierà:
- **Frontend**: http://localhost:5173
- **Backend**: http://localhost:3001

## Test

1. Apri http://localhost:5173 nel browser
2. Nella sezione "Setup Contesto LLM":
   - (Opzionale) Carica documenti/specifiche
   - Clicca "Sfoglia..." per selezionare directory progetto Cypress
   - Clicca "Estrai Contesto" per analizzare Page Objects
3. Nella sezione "Upload CSV Test Cases":
   - Carica un file CSV con colonne: Data/Given, Action/When, Expected Result/Then
4. Una volta caricati CSV e contesto, vedrai i test cases estratti

## Note

- Il backend deve essere in esecuzione per:
  - Selezione directory (dialog Windows)
  - Estrazione contesto Cypress
- Il frontend funziona anche senza backend per:
  - Upload CSV
  - Visualizzazione test cases











