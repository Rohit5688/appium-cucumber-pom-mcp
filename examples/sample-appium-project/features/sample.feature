@smoke
Feature: Sample Login Flow
  As a user
  I want to log into the application
  So that I can access my account

  @android @ios
  Scenario: Successful login with valid credentials
    Given the app is launched
    When I enter username "testuser" and password "pass123"
    And I tap the login button
    Then I should see the home screen
