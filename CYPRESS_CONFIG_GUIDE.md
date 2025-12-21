# 🔧 Guida: Configurazione Sorgenti Cypress in G2A

## Panoramica

La nuova funzionalità **Configurazione Sorgenti Cypress** permette di configurare i percorsi ai file del progetto Cypress della tua organizzazione, permettendo a G2A di generare test che utilizzano l'infrastruttura esistente.

## Accesso

Clicca sul pulsante **⚙️ Config Cypress** nell'header dell'applicazione.

## Configurazione (Passo per Passo)

### SEZIONE A: Selezione File

Nella pagina di configurazione troverai **6 slot** per configurare i file necessari:

#### 1️⃣ **cypress.config.js** ⭐ (Obbligatorio)
- File delle configurazioni Cypress (tasks, baseUrl, etc.)
- Clicca **📁 Sfoglia File** e seleziona il file `cypress.config.js` dal tuo progetto

#### 2️⃣ **cypress.env.json** (Opzionale)
- File delle credenziali, URL, e variabili d'ambiente
- ⚠️ **Nota**: Questo file è protetto e non sarà visualizzabile per sicurezza

#### 3️⃣ **package.json** ⭐ (Obbligatorio)
- File delle dipendenze del progetto
- Clicca **📁 Sfoglia File** e seleziona il file `package.json`

#### 4️⃣ **commands.js** ⭐ (Obbligatorio)
- File dei comandi custom Cypress
- Percorso tipico: `cypress/support/commands.js`

#### 5️⃣ **e2e.js** (Opzionale)
- File di setup globale E2E
- Percorso tipico: `cypress/support/e2e.js`

#### 6️⃣ **Directory pages/** (Opzionale ma raccomandato)
- Cartella contenente i Page Objects
- Clicca **📂 Sfoglia Cartella** e seleziona la directory `cypress/pages/`
- G2A rileverà automaticamente tutti i Page Objects presenti

### Salvataggio

Quando tutti i file **obbligatori** sono configurati (✅ icona verde):
1. Clicca **💾 Salva Configurazione**
2. G2A scansionerà i file per rilevare:
   - Tasks Cypress disponibili
   - Comandi custom disponibili
   - Page Objects disponibili
   - Dipendenze installate

### SEZIONE B: Visualizzazione File Configurati

Dopo il salvataggio, appare automaticamente la sezione di visualizzazione con **card** per ogni file:

#### Card File
Ogni card mostra:
- 📄 Nome del file
- 📍 Path completo
- ✅ Stato accessibilità
- 📊 Informazioni rilevate (tasks, comandi, etc.)
- 👁️ Bottone **Visualizza Contenuto**

#### Visualizzazione Contenuto
Cliccando **👁️ Visualizza Contenuto**:
- Si apre un modal con il contenuto del file
- Syntax highlighting per codice leggibile
- **Read-only**: Non è possibile modificare i file
- Info aggiuntive: dimensione, ultima modifica

#### File Protetti
Il file **cypress.env.json** è protetto:
- 🔒 Non visualizzabile (contiene credenziali sensibili)
- Bottone disabilitato per sicurezza

## Persistenza

La configurazione viene salvata in:
```
g2a/config/cypress-sources.json
```

E persiste tra le sessioni. Non serve riconfigurare ogni volta!

## Modifica Configurazione

Per modificare la configurazione esistente:
1. Torna alla pagina **⚙️ Config Cypress**
2. I campi mostreranno i path attuali
3. Clicca **📁 Sfoglia** per cambiare un file specifico
4. Clicca **💾 Salva Configurazione** per aggiornare

## Struttura File Rilevati

### Tasks Cypress (da cypress.config.js)
Esempi:
- `saveProjectId`, `getProjectId`
- `saveProjectName`, `getProjectName`
- `getAuthToken`, `saveAuthToken`

### Comandi Custom (da commands.js)
Esempi:
- `cy.loginViaAPI()`
- `cy.enterProject(module)`
- `cy.validateIssueDetails()`

### Page Objects (da pages/)
Esempi:
- `issue_pages.js` → `IssuePage`
- `equipment_pages.js` → `EquipmentPage`
- `observations_pages.js` → `ObservationsPage`

## Utilizzo nei Test Generati

Una volta configurato, G2A genererà test che:
- 📦 Importano i Page Objects corretti
- ⚡ Utilizzano i comandi custom esistenti
- 🔧 Richiamano i tasks Cypress disponibili
- 🔗 Puntano correttamente ai file della tua organizzazione

## Troubleshooting

### ❌ "Mancano file obbligatori"
Assicurati di aver selezionato:
- cypress.config.js
- package.json
- commands.js

### ❌ "File non trovato"
- Verifica che i file esistano nei path selezionati
- Controlla i permessi di lettura

### ⚠️ "Nessun task/comando rilevato"
- Verifica che i file contengano effettivamente tasks/comandi
- Controlla la sintassi (deve seguire il pattern standard Cypress)

## Sicurezza

- ✅ I file vengono **solo letti**, mai modificati
- ✅ Le credenziali (cypress.env.json) non sono mai visualizzate
- ✅ La configurazione è locale, non condivisa
- ✅ `.gitignore` impedisce il commit delle configurazioni

## File Creati

```
g2a/
├── config/
│   ├── .gitignore                 # Protegge configurazioni
│   └── cypress-sources.json       # Configurazione salvata (non committato)
├── backend/
│   ├── services/
│   │   └── cypressConfig.js       # Servizio gestione config
│   └── routes/
│       └── cypressConfig.js       # API endpoints
└── frontend/
    └── src/
        ├── components/
        │   ├── CypressConfigPage.jsx     # Pagina configurazione
        │   └── FilePreviewModal.jsx      # Modal preview file
        └── styles/
            ├── CypressConfigPage.css     # Stili pagina
            └── FilePreviewModal.css      # Stili modal
```

## Prossimi Passi

Dopo aver configurato le sorgenti Cypress:
1. ✅ Torna alle sessioni (**📁 Sessioni**)
2. ✅ Crea o apri una sessione di lavoro
3. ✅ Genera test case che utilizzeranno automaticamente la tua configurazione!

---

**💡 Suggerimento**: Esegui questa configurazione una sola volta per organizzazione. Se lavori con più progetti Cypress, puoi aggiungere funzionalità multi-organizzazione in futuro!

