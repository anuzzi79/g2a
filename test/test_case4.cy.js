describe('Test Case #4', () => {
  it('GIVEN the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given the user is at path "WEB FG/ListofProject /Active_tab/" AND Copy Modal is open AND Save as is set "Active"');
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

    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    cy.wait(1000);
    cy.get('div.ag-center-cols-viewport')
      .scrollTo('right');

    cy.get('p[data-type="actions-menu"]').click();
    cy.get('p#action_menuitem_3').click();

    // Ensure "Save As" is set to "Active"
    cy.get('#mat-radio-4')
      .should('have.class', 'mat-radio-checked');

    // ===== WHEN PHASE =====
    cy.log('🟡 WHEN: When the user sets "Save as" = Template');
    // Click on the "Template" option in the modal
    cy.get('span.fs-16.option').contains('Template').click();

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then the status dropdown is hidden');
    // Verify that the status dropdown is hidden
    cy.get('#id_project_status_field').should('not.be.visible');
  });
});