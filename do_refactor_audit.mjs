import { Project, SyntaxKind } from "ts-morph";
import * as fs from "fs";

const project = new Project();
const backupPath = "backups-pre-refactor/AuditLocatorService.ts";
const sourceFile = project.addSourceFileAtPath(backupPath);
const cls = sourceFile.getClassOrThrow("AuditLocatorService");

const destDir = "src/services/audit";
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

const plan = {
  "audit/YamlLocatorParser": {
    className: "YamlLocatorParser",
    methods: ['parseYamlLocators', 'classifyEntry']
  },
  "audit/TypeScriptLocatorParser": {
    className: "TypeScriptLocatorParser",
    methods: ['parseTypeScriptLocators', 'detectArchitecture', 'findFilesRecursive', 'listFiles']
  },
  "../utils/LocatorReportGenerator": {
    className: "LocatorReportGenerator",
    methods: ['generateMarkdownReport']
  }
};

const methodToOwner = {};
for (const [pathKey, def] of Object.entries(plan)) {
  for (const m of def.methods) {
    methodToOwner[m] = def.className;
  }
}

const propMap = {
  YamlLocatorParser: "yamlParser",
  TypeScriptLocatorParser: "tsParser",
  LocatorReportGenerator: "reportGenerator"
};

const baseImports = `import path from 'path';
import { Project, SyntaxKind } from 'ts-morph';
import fs from 'fs/promises';
import fsSync from 'fs';
import { McpConfigService } from '../McpConfigService.js';
import type { LocatorAuditEntry, LocatorAuditReport } from '../AuditLocatorService.js';
`;

const utilImports = `import path from 'path';
import type { LocatorAuditEntry } from '../services/AuditLocatorService.js';
`;

for (const [pathKey, def] of Object.entries(plan)) {
  const className = def.className;
  const outPath = `src/services/${pathKey}.ts`;
  
  const importsText = outPath.includes("LocatorReportGenerator") ? utilImports : baseImports;

  const sf = project.createSourceFile(outPath, importsText + "\n\nexport class " + className + " {\n  constructor(protected facade: any) {}\n}", { overwrite: true });

  const newCls = sf.getClassOrThrow(className);

  for (const mName of def.methods) {
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
      if (owner && owner !== className) {
        const propName = propMap[owner];
        propAccess.replaceWithText(`this.facade.${propName}.${methodName}`);
      }
    }
  });

  sf.saveSync();
  console.log(`Created ${className}`);
}

console.log("Audit delegates generated and patched.");
