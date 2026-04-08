const fs = require('fs');
const path = require('path');

const dir = './src/tools';
const suffix = '\n\nOUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (≤10 words), then proceed to next step.';

const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== '_helpers.ts');
let count = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  let content = fs.readFileSync(filePath, 'utf8');
  let original = content;

  // For backticks
  content = content.replace(/(description:\s*`)([\s\S]*?)(`)/, (match, prefix, body, end) => {
    if (body.includes('OUTPUT INSTRUCTIONS')) return match;
    return prefix + body + suffix + end;
  });

  // For double quotes
  content = content.replace(/(description:\s*")([\s\S]*?)(")/, (match, prefix, body, end) => {
    if (body.includes('OUTPUT INSTRUCTIONS')) return match;
    // double quotes might not support multiline without \n literals, but in JS AST `\n` in string is fine,
    // though the actual source code needs a literal `\n`. Wait, if it's double quotes,
    // we should append `\\n\\nOUTPUT INSTRUCTIONS...` so that the generated code is valid syntactically?
    // Actually, template literals are preferred. Let's convert double quotes to template literals.
    return 'description: `' + body + suffix + '`';
  });

  if (content !== original) {
    fs.writeFileSync(filePath, content, 'utf8');
    count++;
  }
}

console.log('Updated ' + count + ' files.');
