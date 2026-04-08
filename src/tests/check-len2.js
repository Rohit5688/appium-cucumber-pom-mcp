import fs from 'fs';
const src = fs.readFileSync('src/index.ts', 'utf-8');
const OUTPUT_INSTRUCTIONS = '\n\nOUTPUT INSTRUCTIONS: Do NOT repeat file paths or parameters. Do NOT summarize what you just did. Briefly acknowledge completion (\u226410 words), then proceed to next step.';

const toolMatches = [...src.matchAll(/name:\s*'([^']+)'[\s\S]*?description:\s*`([\s\S]*?)`/g)];

toolMatches.forEach((m, i) => {
    const toolName = m[1];
    const originalDesc = m[2];
    let newDesc = originalDesc.replace(/\n*OUTPUT INSTRUCTIONS:[\s\S]*?$/, '').replace(/\s*$/, '');
    
    // Check if instructions already exist
    const finalDesc = newDesc + OUTPUT_INSTRUCTIONS;
    console.log(`Tool ${i + 1}: ${toolName} - ${finalDesc.length} chars`);
    
    if (finalDesc.length > 2048) {
        console.log(`WARNING: ${toolName} length ${finalDesc.length} exceeds 2048 chars!`);
    }
});
console.log(`Total tools found: ${toolMatches.length}`);
