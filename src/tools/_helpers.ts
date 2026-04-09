export function textResult(text: string, structured?: Record<string, unknown>) {
  const result: any = { content: [{ type: "text" as const, text }] };
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
