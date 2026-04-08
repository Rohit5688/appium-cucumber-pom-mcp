const fs = require('fs');
const dir = './src/tools';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts') && f !== '_helpers.ts');
files.forEach(f => {
  const src = fs.readFileSync(dir + '/' + f, 'utf-8');
  const match1 = src.match(/description:\s*\`([\s\S]*?)\`/);
  const match2 = src.match(/description:\s*\"([\s\S]*?)\"/);
  const m = match1 || match2;
  if (m) { 
    console.log(f, ':', m[1].length, 'chars'); 
  } else { 
    console.log(f, 'no match'); 
  }
});
