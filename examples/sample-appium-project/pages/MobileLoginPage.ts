import { BasePage } from './BasePage.js';

/**
 * MobileLoginPage — Page Object for Mobile Login
 */
export class MobileLoginPage extends BasePage {
    // Selectors using standard mobile locators (~ for accessibility ID, id= for resource ID)
    private readonly usernameInput = '~username-input'; // Resource ID on Android, Access-ID on iOS
    private readonly passwordInput = '~password-input';
    private readonly loginButton = '~login-button';

    async enterCredentials(user: string, pass: string) {
        await this.type(this.usernameInput, user);
        await this.type(this.passwordInput, pass);
    }

    async tapLogin() {
        await this.click(this.loginButton);
    }

    async isAt() {
        return await this.isDisplayed(this.usernameInput);
    }
}

/**
 * MobileHomeScreen — Page Object for Post-Login
 */
export class MobileHomeScreen extends BasePage {
    private readonly welcomeHeader = 'id=com.sample.app:id/welcome_text';

    async isVisible() {
        return await this.isDisplayed(this.welcomeHeader);
    }
}
