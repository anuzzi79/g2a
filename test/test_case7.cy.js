describe('Test Case #7', () => {
  it('Given Copy Modal is open AND "Save As" = Active (no matter if starting project is a Template or Active)', () => {
    // ===== GIVEN PHASE =====
    cy.log('🔵 GIVEN: Given Copy Modal is open AND "Save As" = Active (no matter if starting project is a Template or Active)');
    // Visita la pagina di login
    cy.visit('https://loadtest.facilitygrid.net/login');

    // Inserisci l'email
    cy.get('input#user_login').type('antonio.nuzzi@brilliantmachine.com.br');

    // Clicca sul pulsante submit dopo aver inserito l'email
    cy.get('input#submit_btn').click();

    // Aspetta 1 secondo per assicurarti che la pagina si carichi
    cy.wait(1000);

    // Inserisci la password
    cy.get('input#user_pass').type('@Nuzzi79FA');

    // Clicca sul pulsante login dopo aver inserito la password
    cy.get('input#submit_btn').click();

    // Aspetta 1 secondo per assicurarti che la pagina si carichi
    cy.wait(1000);

    // Clicca sulla voce di menu "Facility Grid - Load Test"
    cy.contains('span', 'Facility Grid - Load Test').click();

    // Clicca sull'icona della lista dei progetti
    cy.get('img[title="Show Project List"]').click();

    // Apri la finestra di dialogo Copy nel tab attivo
    cy.get('img[title="Filter Results"]').click();
    cy.get('div.d-table-cell.align-middle.w-25.text-right > span')
      .contains('Showing 1')
      .should('be.visible');

    // Applica un filtro per trovare il progetto desiderato
    cy.get('div.ag-header-cell[style*="left: 76px"] div[ref="eFloatingFilterBody"] input[ref="eFloatingFilterText"]')
      .type('la havana');

    // Assicurati che il progetto sia visibile
    cy.get('div.d-table-cell.align-middle.w-25.text-right')
      .contains('span', 'Showing 1 - 1 of 1')
      .should('be.visible');

    // Aspetta ulteriori 2 secondi
    cy.wait(2000);

    // Controlla se il pulsante del menu delle azioni è visibile e, se necessario, scorri verso destra
    cy.get('p[data-type="actions-menu"]').then(($actionsMenu) => {
      if ($actionsMenu.is(':visible')) {
        cy.log('Actions menu is visible, skipping scroll');
      } else {
        cy.log('Actions menu is not visible, attempting to scroll');
        cy.get('div.ag-center-cols-viewport').scrollTo('right');
      }
    });

    // Continua con le azioni del test
    cy.get('p[data-type="actions-menu"]').click();
    cy.get('p#action_menuitem_3').click(); // Usa il selettore corretto per "Copy"

    // Assicurati che "Save As" sia impostato su "Active"
    cy.get('#mat-radio-4')
      .should('have.class', 'mat-radio-checked');

    // ===== WHEN PHASE =====
    cy.log('🟡 WHEN: When opening the status dropdown');

    // ===== THEN PHASE =====
    cy.log('🟢 THEN: Then the option "Archived" is not available');
    // Verifica che il dropdown di stato sia visibile
    cy.get('#id_project_status_field').should('be.visible');

    // Verifica che il dropdown contenga le opzioni desiderate e che "Archived" non sia presente
    cy.get('#id_project_status_field')
      .find('option')
      .then(options => {
        const actualOptions = [...options].map(option => option.text);
        expect(actualOptions).to.include.members([
          'Not Defined',
          'Proposed',
          'In Planning',
          'In Progress',
          // Include other expected options if necessary
        ]);
        expect(actualOptions).to.not.include('Archived');
      });
  });
});