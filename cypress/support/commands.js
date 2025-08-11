// ***********************************************
// This example commands.js shows you how to
// create various custom commands and overwrite
// existing commands.
//
// For more comprehensive examples of custom
// commands please read more here:
// https://on.cypress.io/custom-commands
// ***********************************************
//
//
// -- This is a parent command --
// Cypress.Commands.add("login", (email, password) => { ... })
//
//
// -- This is a child command --
// Cypress.Commands.add("drag", { prevSubject: 'element'}, (subject, options) => { ... })
//
//
// -- This is a dual command --
// Cypress.Commands.add("dismiss", { prevSubject: 'optional'}, (subject, options) => { ... })
//
//
// -- This will overwrite an existing command --
// Cypress.Commands.overwrite("visit", (originalFn, url, options) => { ... })
import "cypress-file-upload";

beforeEach(function () {
  cy.log("I run before every test in every spec file!!!!!!");
  cy.exec("docker exec md_django python /app/manage.py flush --noinput");
  cy.exec("docker exec md_django python /app/manage.py migrate --noinput");
  cy.exec(
    "docker exec md_django python /app/manage.py shell -c \"from django.contrib.auth.models import User;user = User.objects.create_user('tester', 'test@example.com', 'abc123');from allauth.account.models import EmailAddress;EmailAddress.objects.create(user=user,email='test@example.com',primary=True,verified=True)\""
  );
});

Cypress.Commands.add("login", () => {
  cy.get('[data-testid="loginBtn"]').click();
  cy.get("#username").type("tester");
  cy.get("#password").type("abc123");
  cy.get('[data-testid="submitLoginBtn"]').click();
});
