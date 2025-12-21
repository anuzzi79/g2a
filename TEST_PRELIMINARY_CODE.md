# 🧪 Come Testare la Funzionalità Codice Preliminare

## 🎯 Obiettivo del Test

Verificare che:
1. Il campo codice preliminare sia editabile nella lista e nel builder
2. La validazione automatica corregga errori di sintassi
3. Il file Cypress venga generato correttamente con lo scheletro degli "it"

## 📋 Prerequisiti

1. Server backend avviato: `npm run dev` (dalla root del progetto)
2. Frontend avviato: `npm run dev` (dalla cartella frontend)
3. Una sessione attiva con almeno 1 test case caricato da CSV

## 🚀 Passi del Test

### Passo 1: Preparazione Sessione

1. Avvia l'applicazione
2. Vai in **Gestione Sessioni**
3. Crea una nuova sessione (es. "test-preliminare")
4. Carica un file CSV con almeno 1 test case

**Esempio CSV minimo:**
```csv
Data/Given,Action/When,Expected Result/Then
Given that I'm in equipment detail screen,When I click to create an observation,Then the observation should be listed
```

### Passo 2: Test Campo Editabile nella Lista

1. Dalla lista dei test cases, scorri fino alla sezione **📄 Genera File Cypress**
2. Dovresti vedere un **campo editor nero** con placeholder
3. Inserisci questo codice (con errori intenzionali):

```javascript
import { EquipmentPage } from "../../../pages/equipment_pages"
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage()
const imageTitle = "Teste.png"
```

4. Clicca **💾 Salva**
5. **Verifica nei log eventi** (in basso):
   - `🔍 Validazione codice preliminare...`
   - `💡 Correzioni applicate:` (elenca i `;` aggiunti)
   - `✨ Codice corretto automaticamente`
   - `✅ Codice preliminare salvato`

6. **Verifica nell'editor**: Il codice dovrebbe essere aggiornato con i `;` mancanti

### Passo 3: Test Campo nel Builder

1. Clicca su un test case per aprire il **Builder**
2. Subito dopo l'header, dovresti vedere:
   - Box con bordo viola
   - Titolo: **📝 Codice Preliminare (Dichiarazioni Iniziali)**
   - Il codice che hai salvato visualizzato nell'editor
3. **Modifica il codice** aggiungendo una nuova costante:

```javascript
const testVar = "test";
```

4. Torna alla lista (bottone "← Torna alla lista")
5. **Verifica**: Il codice modificato dovrebbe essere ancora presente nell'editor della lista

### Passo 4: Test Generazione File Cypress

1. Nella sezione **📄 Genera File Cypress**, compila:
   - **Nome File**: `test-preliminare.cy.js`
   - **Directory**: `test_cases` (o lascia default)

2. Clicca **🚀 Genera File Cypress**

3. **Verifica popup di successo**:
   - Mostra il percorso del file generato
   - Mostra il numero di test cases
   - Fornisce il comando per eseguirlo

4. **Apri il file generato** (il percorso è mostrato nel popup)

5. **Verifica la struttura** del file:

```javascript
// 1. Il tuo codice preliminare dovrebbe essere all'inizio
import { EquipmentPage } from "../../../pages/equipment_pages";
import { faker } from "@faker-js/faker";

const equipmentPage = new EquipmentPage();
const imageTitle = "Teste.png";
const testVar = "test";

// 2. Seguita dal describe
describe('test-preliminare', () => {
  before(() => {
    cy.loginViaAPI();
    cy.enterProject();
  });

  // 3. Gli "it" con lo scheletro
  it('Test Case #1', () => {
    // Given: Given that I'm in equipment detail screen
    // GIVEN - TODO: Implementare con Wide Reasoning
    // 1. Given that I'm in equipment detail screen
    // TODO: Cypress code here

    // When: When I click to create an observation
    // WHEN - TODO: Implementare con Wide Reasoning
    // 1. When I click to create an observation
    // TODO: Cypress code here

    // Then: Then the observation should be listed
    // THEN - TODO: Implementare con Wide Reasoning
    // 1. Then the observation should be listed
    // TODO: Cypress code here
  });
});
```

### Passo 5: Test Validazione con Errori Complessi

1. Nell'editor del codice preliminare, inserisci codice con errori gravi:

```javascript
import { EquipmentPage } from "../../../pages/equipment_pages
const equipmentPage = new EquipmentPage(
const unclosedString = "test
```

2. Clicca **💾 Salva**

3. **Verifica nei log**:
   - Dovrebbero apparire **⚠️ Errori rilevati** con dettagli
   - Il sistema tenterà di correggerli automaticamente
   - Potrebbero esserci correzioni parziali

4. **Risultato atteso**: 
   - Parentesi e quote mancanti aggiunte automaticamente
   - Log dettagliati degli errori e correzioni

## ✅ Checklist di Verifica

### Funzionalità di Base
- [ ] Campo editabile nella lista dei test cases
- [ ] Campo editabile nel test case builder  
- [ ] Salvataggio persiste tra navigazioni
- [ ] Sincronizzazione tra lista e builder

### Validazione
- [ ] Parentesi tonde `()` vengono corrette
- [ ] Parentesi graffe `{}` vengono corrette
- [ ] Parentesi quadre `[]` vengono corrette
- [ ] Punto e virgola `;` mancanti vengono aggiunti
- [ ] Import senza `;` vengono corretti
- [ ] Quote non chiuse vengono rilevate
- [ ] Log dettagliati mostrano correzioni

### Generazione File
- [ ] Codice preliminare appare all'inizio del file
- [ ] `describe()` e `before()` sono generati correttamente
- [ ] Ogni test case ha il suo `it()`
- [ ] I testi Gherkin sono inclusi come commenti
- [ ] Lo scheletro con TODO è generato
- [ ] Il file è valido sintatticamente

## 🐛 Problemi Comuni

### "Nessuna sessione attiva"
**Soluzione**: Assicurati di aver creato/selezionato una sessione prima di salvare

### "File Cypress non generato"
**Possibili cause:**
- Nome file mancante o invalido
- Directory non specificata
- Nessun test case caricato
**Soluzione**: Verifica tutti i campi e riprova

### "Errori di validazione non corretti"
**Spiegazione**: Alcuni errori complessi potrebbero richiedere correzione manuale
**Soluzione**: Correggi manualmente gli errori evidenziati nei log

### "Codice non salvato"
**Possibili cause:**
- Backend non avviato
- Errore di rete
**Soluzione**: Verifica che il backend sia in esecuzione su `http://localhost:3001`

## 🎬 Video Tutorial (da creare)

1. Creazione sessione e caricamento CSV
2. Scrittura codice preliminare con errori
3. Validazione automatica e correzioni
4. Generazione file Cypress
5. Visualizzazione del risultato

## 📊 Metriche di Successo

Il test è **superato** se:
- ✅ Tutti gli elementi della checklist sono verificati
- ✅ Il file generato è sintatticamente corretto
- ✅ Il codice preliminare è presente e formattato correttamente
- ✅ Gli "it" hanno la struttura attesa
- ✅ La validazione corregge almeno 80% degli errori comuni

---

## 🎉 Test Completato!

Se tutti i passi sono stati completati con successo, la funzionalità è pronta per l'uso in produzione!

### Prossimi Passi:
1. Testare con casi d'uso reali e CSV complessi
2. Verificare l'integrazione con Wide Reasoning (quando disponibile)
3. Raccogliere feedback dagli utenti

