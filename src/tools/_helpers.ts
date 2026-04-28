export function textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text" as const, text }] };
  if (structured) result.structuredContent = structured;
  return result;
}

/**
 * Returns text + an inline screenshot the LLM can visually inspect.
 * Mirrors Maestro's take_screenshot pattern: PNG bytes → JPEG base64 → ImageContent.
 * Falls back to textResult if screenshotBase64 is absent.
 */
export function textAndImageResult(
  text: string,
  screenshotBase64: string | undefined,
  structured?: Record<string, unknown>
) {
  const content: any[] = [{ type: "text" as const, text }];
  if (screenshotBase64?.trim()) {
    content.push({
      type: "image" as const,
      data: screenshotBase64,
      mimeType: "image/png",
    });
  }
  const result: any = { content };
  if (structured) result.structuredContent = structured;
  return result;
}


const CHARACTER_LIMIT = 25_000;
export function truncate(text: string, tip?: string): string {
  if (text.length <= CHARACTER_LIMIT) return text;
  const suffix = tip
    ? `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. Tip: ${tip}. Use array.slice, array.map, or filter options to reduce output.]`
    : `\n\n... [TRUNCATED — response exceeded ${CHARACTER_LIMIT} chars. Use pagination (array.slice) or mapping to reduce the returned payload volume.]`;
  return text.slice(0, CHARACTER_LIMIT) + suffix;
}

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

 // Helper to reliably find skills directory whether running from src/ or dist/
 function getSkillPath(skillFileName: string) {
   // First try relative to __dirname (bundled / dist scenario)
   const dirPath = path.join(__dirname, '../skills', skillFileName);
   if (fs.existsSync(dirPath)) return dirPath;
 
   // Then try workspace-level 'skills' (preferred for repo root)
   const rootSkill = path.join(process.cwd(), 'skills', skillFileName);
   if (fs.existsSync(rootSkill)) return rootSkill;
 
   // Finally fall back to legacy src/skills for dev setups
   return path.join(process.cwd(), 'src', 'skills', skillFileName);
 }

const ANDROID_SKILL = fs.existsSync(getSkillPath('android.md')) 
  ? fs.readFileSync(getSkillPath('android.md'), 'utf-8') 
  : '';
const IOS_SKILL = fs.existsSync(getSkillPath('ios.md'))
  ? fs.readFileSync(getSkillPath('ios.md'), 'utf-8')
  : '';

export function detectPlatformFromPath(filePath: string): 'android' | 'ios' | null {
  if (!filePath) return null;
  const lower = filePath.toLowerCase();
  if (lower.includes('android') || lower.includes('apk')) return 'android';
  if (lower.includes('ios') || lower.includes('ipa') || lower.includes('xctest')) return 'ios';
  return null;
}

export function getPlatformSkill(args: any): string {
  const pathHints = [
    args?.filePath, args?.testPath, args?.screenName, args?.appPath,
    args?.projectRoot, args?.testName, args?.testOutput
  ].filter(Boolean).join(' ');

  const platform = detectPlatformFromPath(pathHints);
  if (platform === 'android' && ANDROID_SKILL) return `\n\n---\n${ANDROID_SKILL}`;
  if (platform === 'ios' && IOS_SKILL) return `\n\n---\n${IOS_SKILL}`;
  return '';
}

/**
 * Platform-detection guard — call at the top of any AppForge tool that reads
 * mobile-specific files (XML hierarchies, Appium sessions, coverage reports).
 *
 * If the projectRoot is a Playwright/TestForge project, returns a clear error
 * object the tool can return immediately. Returns null if safe to continue.
 *
 * This prevents the EOF crashes seen when Gemini Flash 3 (or any LLM) invokes
 * AppForge tools against a web project because it didn't distinguish the servers.
 *
 * Usage in a tool handler:
 *   const guard = assertNotPlaywrightProject(projectRoot);
 *   if (guard) return guard;
 */
export function assertNotPlaywrightProject(projectRoot: string | undefined): { content: { type: 'text'; text: string }[]; isError: true } | null {
  if (!projectRoot) return null;
  const playwrightConfigs = [
    'playwright.config.ts',
    'playwright.config.js',
    'playwright.config.mjs',
    'playwright.config.cjs',
  ];
  for (const cfg of playwrightConfigs) {
    if (fs.existsSync(path.join(projectRoot, cfg))) {
      return {
        content: [{
          type: 'text' as const,
          text: [
            `🚫 WRONG MCP SERVER`,
            ``,
            `This project contains \`${cfg}\` — it is a Playwright/TestForge project.`,
            `AppForge tools are for Appium (iOS/Android) mobile automation only.`,
            ``,
            `Switch to the TestForge MCP server and use the equivalent tool there:`,
            `  AppForge: suggest_refactorings    → TestForge: suggest_refactorings`,
            `  AppForge: audit_mobile_locators   → TestForge: audit_locators`,
            `  AppForge: check_environment       → TestForge: check_environment`,
            `  AppForge: get_token_budget        → TestForge: get_token_budget`,
            ``,
            `Project root detected: ${projectRoot}`,
          ].join('\n'),
        }],
        isError: true,
      };
    }
  }
  return null;
}
