describe('Test Case #1', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" | When he click Action/Copy | Then mod', () => {
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

    // Passo 1: Clicca sull'icona del filtro e attendi che il testo "Showing 1" sia visibile
    cy.get('img[title="Filter Results"]').click();
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible');

    // Passo 2: Scrivi "la havana" nel campo di input del filtro flottante
    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    // Passo 3: Attendi 1 secondo, quindi scorri la griglia orizzontalmente al massimo a destra
    cy.wait(1000);
    cy.get('div.ag-center-cols-viewport')
      .scrollTo('right');

    // Passo 4: Clicca sul pulsante "Actions" e poi clicca su "Copy"
    cy.get('p[data-type="actions-menu"]')
      .click();
    cy.get('p#action_menuitem_3')
      .click();

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then modal opens and "Save As" defaults to "Active"');

    // Verifica che il radio button "Active" sia selezionato
    cy.get('#mat-radio-4')
      .should('have.class', 'mat-radio-checked');
  });
});