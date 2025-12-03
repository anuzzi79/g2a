describe('Test Case #2', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"');
    // Visita la pagina di login
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Inserisci l'email
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Clicca sul pulsante di invio dopo aver inserito l'email
    cy.get('input#submit_btn').click();

    // Attendi 1 secondo per assicurarti che la pagina si carichi
    cy.wait(1000);

    // Inserisci la password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Clicca sul pulsante di login dopo aver inserito la password
    cy.get('input#submit_btn').click();

    // Attendi 1 secondo per assicurarti che la pagina si carichi
    cy.wait(1000);

    // Clicca sull'elemento del menu "Facility Grid - Load Test"
    cy.contains('span', 'Facility Grid - Load Test').click();

    // Attendi fino a 40 secondi che il campo "Watched Projects" sia visibile
    cy.get('input[placeholder="Watched Projects"]', { timeout: 40000 }).should('be.visible');

    // Clicca sull'icona della lista progetti
    cy.get('img[title="Show Project List"]').click();

    // Clicca sull'icona del filtro e attendi che il testo "Showing 1" sia visibile
    cy.get('img[title="Filter Results"]').click();
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible');

    // Digita "la havana" nel campo di input del filtro
    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    // Attendi un secondo, poi scorri la griglia orizzontalmente fino all'estrema destra
    cy.wait(1000);
    cy.get('div.ag-center-cols-viewport')
      .scrollTo('right');

    // Clicca sul pulsante "Actions" e poi su "Copy"
    cy.get('p[data-type="actions-menu"]')
      .click();
    cy.get('p#action_menuitem_3')
      .click();

    // Assicurati che "Save As" sia impostato su "Active"
    cy.get('#mat-radio-4')
      .should('have.class', 'mat-radio-checked');
  });
});