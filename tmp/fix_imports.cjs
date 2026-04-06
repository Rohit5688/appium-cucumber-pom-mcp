const fs = require('fs');
let c = fs.readFileSync('src/index.ts', 'utf8');
c = c.replace(/import\s*\{\s*CallToolRequestSchema,\s*ListToolsRequestSchema,?\s*\}\s*from\s*"@modelcontextprotocol\/sdk\/types\.js";/g, '');
c = 'import * as fs from "fs";\nimport * as path from "path";\n' + c;
fs.writeFileSync('src/index.ts', c, 'utf8');
console.log("Done");
