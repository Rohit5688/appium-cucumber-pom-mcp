import { Project } from "ts-morph";
import * as fs from "fs";

const project = new Project();
project.addSourceFilesAtPaths("src/services/NavigationGraphService.ts");
const sourceFile = project.getSourceFileOrThrow("src/services/NavigationGraphService.ts");
const cls = sourceFile.getClassOrThrow("NavigationGraphService");

const methods = cls.getMethods();
console.log(methods.map(m => m.getName()).join("\n"));
