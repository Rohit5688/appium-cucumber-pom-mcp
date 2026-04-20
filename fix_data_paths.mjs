import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const servicesDir = path.join(__dirname, 'src', 'services');

function walk(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            walk(fullPath);
        } else if (file.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let changed = false;

            if (content.includes("'../data/")) {
                content = content.replaceAll("'../data/", "'../../data/");
                changed = true;
            }
            if (content.includes('"../data/')) {
                content = content.replaceAll('"../data/', '"../../data/');
                changed = true;
            }

            if (changed) {
                fs.writeFileSync(fullPath, content);
                console.log(`Fixed data path in ${fullPath}`);
            }
        }
    }
}

walk(servicesDir);
