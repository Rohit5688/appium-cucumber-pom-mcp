import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";

const project = new Project();
const backupPath = "backups-pre-refactor/TestGenerationService.ts";
const sourceFile = project.addSourceFileAtPath(backupPath);
const cls = sourceFile.getClassOrThrow("TestGenerationService");

const destDir = "src/services/generation";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const plan = {
  AppiumPromptBuilder: ['generateAppiumPrompt', 'getArchitectureRules', 'estimateTokens'],
  NavigationContextBuilder: ['generateNavigationContext', 'generateBasicNavigationGuidance', 'inferTargetScreen', 'isNavigationStep', 'buildKnownScreenMap', 'resolvePagesDir']
};

const methodToOwner = {};
for (const [owner, methods] of Object.entries(plan)) {
  for (const m of methods) {
    methodToOwner[m] = owner;
  }
}

const ownerToProp = {
  AppiumPromptBuilder: 'promptBuilder',
  NavigationContextBuilder: 'navContextBuilder'
};

const baseImports = `import fs from 'fs';
import path from 'path';
import { McpConfigService, type McpConfig } from '../McpConfigService.js';
import type { CodebaseAnalysisResult } from '../CodebaseAnalyzerService.js';
import { NavigationGraphService } from '../NavigationGraphService.js';
import { Logger } from '../../utils/Logger.js';
`;

for (const [className, methodNames] of Object.entries(plan)) {
  const outPath = `src/services/generation/${className}.ts`;
  
  const sf = project.createSourceFile(outPath, baseImports + `\n\nexport class ${className} {
  constructor(protected facade: any) {}
}`, { overwrite: true });

  const newCls = sf.getClassOrThrow(className);

  for (const mName of methodNames) {
    const method = cls.getMethod(mName);
    if (method) {
      let structure = method.getStructure();
      structure.scope = "public"; // make all public since they are called cross-delegate
      newCls.addMethod(structure);
    }
  }

  // Patch this. calls
  newCls.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression).forEach(propAccess => {
    if (propAccess.getExpression().getKind() === SyntaxKind.ThisKeyword) {
      const methodName = propAccess.getName();
      const owner = methodToOwner[methodName];
      // If the method is owned by another class, redirect through facade
      if (owner && owner !== className) {
        const propName = ownerToProp[owner];
        propAccess.replaceWithText(`this.facade.${propName}.${methodName}`);
      } else if (methodName === "hybridEngine") {
        propAccess.replaceWithText(`this.facade.hybridEngine`);
      }
    }
  });

  sf.saveSync();
  console.log(`Created ${className}`);
}

console.log("TestGen delegates generated and patched.");
