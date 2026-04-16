/**
 * ISessionVerifier — Narrow interface for selector verification.
 *
 * Decouples OrchestrationService from the concrete AppiumSessionService.
 * Any session service that can verify a selector satisfies this contract
 * (AppiumSessionService does structurally; PlaywrightSessionService can too).
 *
 * Concern 4, Fix 3 from docs/final/concerns.md:
 * Eliminates the `this.sessionManager as any` cast in index.ts.
 */
export interface ISessionVerifier {
  verifySelector(selector: string): Promise<{
    exists: boolean;
    displayed: boolean;
    enabled: boolean;
    tagName?: string;
    text?: string;
  }>;
}
