describe('Test Case #1', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" | When he click Action/Copy | Then modal opens', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Active_tab/"');
    cy.log('Given the user is at path "WEB FG/ListofProject /Active_tab/"');

    // Visit the login page
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Enter email
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Click submit button after entering email
    cy.get('input#submit_btn').click();

    // Wait for 1 second
    cy.wait(1000);

    // Enter password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Click login button after entering password
    cy.get('input#submit_btn').click();

    // Wait for 1 second
    cy.wait(1000);

    // Click on "Facility Grid - Load Test" menu item
    cy.contains('span', 'Facility Grid - Load Test').click();

    // Click on the project list icon
    cy.get('img[title="Show Project List"]').click();

    // ===== WHEN PHASE =====
    cy.log('🟡 WHEN: When he click Action/Copy');
    cy.log('🔵 WHEN: When he clicks Action/Copy');

    // Verifica che il componente con il testo 'Showing 1' diventi visibile entro 40 secondi
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible', { timeout: 40000 });

    // Clicca sul pulsante Action/Copy
    cy.get('button')
      .contains('Action/Copy')
      .click();

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then modal opens and "Save As" defaults to "Active"');
    cy.log('🔴 THEN: Then modal opens and "Save As" defaults to "Active"');

    // Verifica che il radio button "Active" sia selezionato
    cy.get('input[type="radio"][value="Active"]').should('be.checked');
  });
});