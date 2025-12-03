describe('Test Case #3', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is ', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Template"');
    // Navigate to login page
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Input email
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Submit email
    cy.get('input#submit_btn').click();
    cy.wait(1000);

    // Input password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Submit password
    cy.get('input#submit_btn').click();
    cy.wait(1000);

    // Navigate to the specific project
    cy.contains('span', 'Facility Grid - Load Test').click();
    cy.get('img[title="Show Project List"]').click();

    // Open the Copy Modal
    cy.get('img[title="Filter Results"]').click();
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible');

    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    cy.wait(1000);
    cy.get('div.ag-center-cols-viewport')
      .scrollTo('right');

    cy.get('p[data-type="actions-menu"]').click();
    cy.get('p#action_menuitem_3').click();

    // Clicca sull'opzione "Template" nel modal
    cy.get('span.fs-16.option').contains('Template').click();

    // Ensure "Save As" is set to "Template"
    cy.get('#mat-radio-5') // Assicurati che questo ID corrisponda all'elemento corretto per "Template"
      .should('have.class', 'mat-radio-checked');

    // ===== WHEN PHASE =====
    cy.log('🟡 WHEN: When the user sets "Save as" = Active');
    // Clicca sull'opzione "Active" nel modal
    cy.get('span.fs-16.option').contains('Active').click();

    // Assicurati che l'opzione "Active" sia selezionata
    cy.get('#mat-radio-4') // Assicurati che questo ID corrisponda all'elemento corretto per "Active"
      .should('have.class', 'mat-radio-checked');

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then the status dropdown is visible with allowed statuses');
    // Verifica che il dropdown di stato sia visibile
    cy.get('#id_project_status_field').should('be.visible');

    // Verifica che il dropdown contenga le opzioni desiderate
    const expectedOptions = [
      'Not Defined',
      'Proposed',
      'In Planning',
      'In Progress',
      'On Hold',
      'Completed'
    ];

    cy.get('#id_project_status_field').within(() => {
      expectedOptions.forEach(option => {
        cy.get('option').contains(option).should('exist');
      });
    });
  });
});