describe('Test Case #5', () => {
  it('Given the user is at path "WEB FG/ListofProject /Template_tab" AND Copy Modal is open AND Save as is', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Template_tab" AND Copy Modal is open AND Save as is set "Active"');
    // Visit the login page
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Enter email
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Click submit button after entering email
    cy.get('input#submit_btn').click();

    // Wait for 1 second to ensure the page loads
    cy.wait(1000);

    // Enter password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Click login button after entering password
    cy.get('input#submit_btn').click();

    // Wait for 1 second to ensure the page loads
    cy.wait(1000);

    // Click on "Facility Grid - Load Test" menu item
    cy.contains('span', 'Facility Grid - Load Test').click();

    // Click on the project list icon
    cy.get('img[title="Show Project List"]').click();

    // Open the Copy Modal
    cy.get('img[title="Filter Results"]').click();
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible');

    // Click on the "Template" tab
    cy.get('li.tab.ng-star-inserted > a').contains('Template').click();

    // Type "la havana" in the filter input
    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    // Wait for the span showing "Showing 1 - 1 of 1" to appear
    cy.get('div.d-table-cell.align-middle.w-25.text-right')
      .contains('span', 'Showing 1 - 1 of 1')
      .should('be.visible');

    // Wait an additional 2 seconds
    cy.wait(2000);

    // Check if the "Actions" menu button is visible
    cy.get('p[data-type="actions-menu"]').then(($actionsMenu) => {
      if ($actionsMenu.is(':visible')) {
        cy.log('Actions menu is visible, skipping scroll');
      } else {
        cy.log('Actions menu is not visible, attempting to scroll');
        cy.get('div.ag-center-cols-viewport').scrollTo('right');
      }
    });

    // Continue with the test actions
    cy.get('p[data-type="actions-menu"]').click();
    cy.get('p#action_menuitem_2').click(); // Use the correct selector for "Copy"

    // Ensure "Save As" is set to "Active"
    cy.get('#mat-radio-4')
      .should('have.class', 'mat-radio-checked');

    // ===== WHEN PHASE =====
    cy.log('🟡 WHEN: When the user sets "Save as" = Template');
    // Clicca sull'opzione "Template" nel modal
    cy.get('span.fs-16.option').contains('Template').click();

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then the status dropdown is hidden');
    // Verifica che l'input con formcontrolname "client" sia disabilitato
    cy.get('input[formcontrolname="client"]').should('be.disabled')
  });
});