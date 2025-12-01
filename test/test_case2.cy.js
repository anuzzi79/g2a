describe('Test Case #2', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is ', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"');
    cy.log('Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"');
    
    // Usa i passi esistenti per arrivare al punto di conferma
    performLoginAndNavigateToActiveTab();
    completeSetupToOpenModal();
    
    // Funzione per completare il setup necessario e aprire il modale
    function completeSetupToOpenModal() {
      // Esegui i passi specifici citati nel test case esistente per aprire il modale
      cy.get('button').contains('Specific Setup Step').click();
      // Aggiungi altri passi se necessario
      cy.get('button').contains('Open Copy Modal').click();
      cy.get('.mat-dialog-container').should('be.visible');
    }
    
    // Verifica che "Save as" sia impostato su "Active"
    verifySaveAsIsActive();
    
    // Verifica dettagliata del modale
    function verifySaveAsIsActive() {
      cy.get('#mat-dialog-3').within(() => {
        cy.get('button').contains('Save as').should('have.text', 'Active');
        // Verifica il colore o altri aspetti visivi
        cy.get('.save-as-control').should('have.css', 'color', 'expected-color'))}}

  });
});