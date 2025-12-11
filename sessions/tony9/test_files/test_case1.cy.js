describe('Test Case #1', () => {
  it('Given the user is at path "WEB FG/ListofProject /Active_tab/" | When he clicks Action/Copy | Then modal opens and "Save As" defaults to "Active"', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: User is at path "WEB FG/ListofProject /Active_tab/"');

    // Step 1: Visit the login page
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Step 2: Enter the email address
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Step 3: Click the Proceed button
    cy.get('input#submit_btn').click();

    // Step 4: Wait for the password field to appear
    cy.get('input#user_pass', { timeout: 10000 }).should('be.visible');

    // Step 5: Enter the password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Step 6: Wait for and click the "Connect to" option
    cy.contains('p', 'Connect to:').should('be.visible');
    cy.contains('span', 'Facility Grid - Load Test').click();

    // Step 7: Wait for the "WATCHED PROJECTS" section to appear
    cy.contains('span', 'WATCHED PROJECTS', { timeout: 10000 }).should('be.visible');

    // Step 8: Click the button to show the project list
    cy.get('img[title="Show Project List"]').click();

    // ===== WHEN PHASE =====
    cy.log('🔵 WHEN: User clicks Action/Copy');

    // Action: Click Action/Copy
    // This step needs to be implemented based on the specific element for Action/Copy

    // ===== THEN PHASE =====
    cy.log('🔵 THEN: Modal opens and "Save As" defaults to "Active"');

    // Assertion: Check if the modal opens and "Save As" defaults to "Active"
    // This step needs to be implemented based on the modal and "Save As" default state
  });
});