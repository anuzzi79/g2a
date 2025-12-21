# 📝 Guida al Codice Preliminare

## Cos'è il Codice Preliminare?

Il **Codice Preliminare** è la sezione di codice che viene inserita all'inizio del file Cypress, prima di tutti i test case ("it"). Include:

- 📦 **Import** di Page Objects, librerie e utilities
- 🔧 **Dichiarazioni** di costanti e variabili condivise
- 🎯 **Istanze** di Page Objects utilizzati nei test
- ⚙️ **Configurazioni** iniziali

## Come Funziona?

### 1. **Nella Lista dei Test Cases**

Nella sezione "📄 Genera File Cypress" troverai un **campo editor nero** dove puoi inserire il codice preliminare:

```javascript
// Esempio di codice preliminare
import { EquipmentPage } from "../../../pages/equipment_pages";
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage();
const imageTitle = "Teste.png";
```

- Scrivi il codice nell'editor
- Clicca **💾 Salva** per salvarlo nella sessione
- Il codice viene **validato automaticamente** per correggere errori di sintassi

### 2. **Nel Test Case Builder**

Quando apri un test case per costruirlo, vedrai il codice preliminare in modalità **visualizzazione/modifica**:

- Il codice è visibile come riferimento durante la costruzione degli "it"
- Puoi modificarlo direttamente anche dal builder
- Le modifiche si sincronizzano automaticamente con la lista

### 3. **Nella Generazione del File**

Quando clicchi su **🚀 Genera File Cypress**:

1. Il codice preliminare viene inserito all'inizio del file
2. Sostituisce gli import automatici (se presente)
3. Viene posizionato prima del `describe()` principale
4. Gli "it" vengono generati subito dopo

## 🤖 Validazione Automatica

Il sistema include un **agente di validazione** che:

### ✅ Corregge Automaticamente

- **Parentesi mancanti**: Aggiunge parentesi di chiusura mancanti `( ) { } [ ]`
- **Punto e virgola**: Aggiunge `;` dove necessario (import, const, let, var)
- **Formattazione**: Normalizza spazi e indentazione
- **Quote**: Rileva stringhe non chiuse

### 📊 Report di Validazione

Quando salvi, il sistema mostra:

- ⚠️ **Errori rilevati**: Problemi di sintassi gravi
- 💡 **Correzioni applicate**: Modifiche automatiche eseguite
- ✨ **Codice corretto**: Il codice viene aggiornato automaticamente

## 📋 Esempio Completo

### Input nell'Editor:

```javascript
import { EquipmentPage } from "../../../pages/equipment_pages"
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage()
const imageTitle = "Teste.png"
```

### Dopo la Validazione:

```javascript
import { EquipmentPage } from "../../../pages/equipment_pages";
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage();
const imageTitle = "Teste.png";
```

**Correzioni applicate:**
- Aggiunto `;` dopo il primo import
- Aggiunto `;` dopo `new EquipmentPage()`
- Aggiunto `;` dopo la dichiarazione di `imageTitle`

## 🎯 File Generato

Il file finale avrà questa struttura:

```javascript
// 1. CODICE PRELIMINARE (quello che hai scritto)
import { EquipmentPage } from "../../../pages/equipment_pages";
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage();
const imageTitle = "Teste.png";

// 2. DESCRIBE E BEFORE
describe('Nome della Suite', () => {
  before(() => {
    cy.loginViaAPI();
    cy.enterProject();
  });

  // 3. GLI "IT" GENERATI (uno per ogni test case)
  it('Test Case #1', () => {
    // Given: [testo Gherkin]
    // TODO: Implementare con Wide Reasoning
    
    // When: [testo Gherkin]
    // TODO: Implementare con Wide Reasoning
    
    // Then: [testo Gherkin]
    // TODO: Implementare con Wide Reasoning
  });

  // ... altri it
});
```

## 💡 Best Practices

1. **Import relativi**: Usa percorsi relativi corretti per i tuoi Page Objects
2. **Nomi chiari**: Usa nomi descrittivi per costanti e variabili
3. **Raggruppamento**: Raggruppa import simili insieme
4. **Commenti**: Aggiungi commenti per spiegare variabili complesse
5. **Riutilizzo**: Dichiara qui tutte le variabili usate in più test

## 🔧 Troubleshooting

### Il codice non viene salvato?
- Controlla che ci sia una sessione attiva
- Verifica la console per eventuali errori di validazione

### Gli errori non vengono corretti?
- Alcuni errori complessi potrebbero richiedere correzione manuale
- Controlla il log degli eventi per i dettagli

### Il file generato è vuoto?
- Assicurati di aver caricato almeno un test case dal CSV
- Verifica che il nome del file e la directory siano corretti

## 🚀 Workflow Completo

1. **Crea una sessione** o selezionane una esistente
2. **Carica il CSV** con i test cases
3. **Scrivi il codice preliminare** nell'editor nero
4. **Salva** il codice (validazione automatica)
5. **Compila i test cases** nel builder (opzionale)
6. **Genera il file Cypress** con lo scheletro completo
7. **Esegui i test** o continua a implementarli

---

✨ **Il codice preliminare rende i tuoi file Cypress più organizzati e pronti all'uso!**

