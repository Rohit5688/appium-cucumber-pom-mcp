import { Given, When, Then } from '@cucumber/cucumber';
import { MobileLoginPage, MobileHomeScreen } from '../pages/MobileLoginPage.js';

Given('the app is launched', async function () {
    const loginPage = new MobileLoginPage();
    await loginPage.isAt();
});

When('I enter username {string} and password {string}', async function (user: string, pass: string) {
    const loginPage = new MobileLoginPage();
    await loginPage.enterCredentials(user, pass);
});

When('I tap the login button', async function () {
    const loginPage = new MobileLoginPage();
    await loginPage.tapLogin();
});

Then('I should see the home screen', async function () {
    const homeScreen = new MobileHomeScreen();
    await homeScreen.isVisible();
});
