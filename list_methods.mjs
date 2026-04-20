import { Project } from "ts-morph";
import * as fs from "fs";

const project = new Project();
project.addSourceFilesAtPaths("src/services/ProjectSetupService.ts");
const sourceFile = project.getSourceFileOrThrow("src/services/ProjectSetupService.ts");
const cls = sourceFile.getClassOrThrow("ProjectSetupService");

const methods = cls.getMethods();
console.log(methods.map(m => m.getName()).join("\n"));
