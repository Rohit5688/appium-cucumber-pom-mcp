import fs from 'fs';
import path from 'path';

const toolsDir = path.join('src', 'tools');
const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.ts') && f !== '_helpers.ts');
let exceedCount = 0;

files.forEach(file => {
    const src = fs.readFileSync(path.join(toolsDir, file), 'utf-8');
    const match = src.match(/description:\s*`([\s\S]*?)`/);
    if (match) {
        const descLength = match[1].length;
        if (descLength > 2048) {
            console.log(`WARNING: ${file} length ${descLength} exceeds 2048 chars!`);
            exceedCount++;
        }
    } else {
        const strMatch = src.match(/description:\s*"([\s\S]*?)"/);
        if (strMatch) {
            const descLength = strMatch[1].length;
            if (descLength > 2048) {
                console.log(`WARNING: ${file} length ${descLength} exceeds 2048 chars!`);
                exceedCount++;
            }
        } else {
            console.log(`Could not find description in ${file}`);
        }
    }
});

console.log(`Total files checked: ${files.length}`);
console.log(`Total exceeding 2048 chars: ${exceedCount}`);
