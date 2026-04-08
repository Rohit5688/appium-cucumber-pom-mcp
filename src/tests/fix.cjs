const fs = require('fs');
const files = [
  'src/services/AppiumSessionService.ts',
  'src/services/FileWriterService.ts',
  'src/services/McpConfigService.ts',
  'src/services/NavigationGraphService.ts',
  'src/services/SessionManager.ts',
  'src/tests/SessionManager.stress.test.ts'
];
files.forEach(f => {
  if (fs.existsSync(f)) {
    let content = fs.readFileSync(f, 'utf8');
    content = content.replace(/import \{ AppForgeError, ErrorCode \} from '(\.\.\/)*utils\/ErrorCodes\.js';/g, 'import { AppForgeError } from \'$1utils/ErrorFactory.js\';');
    content = content.replace(/import \{ AppForgeError \} from '(\.\.\/)*utils\/ErrorCodes\.js';/g, 'import { AppForgeError } from \'$1utils/ErrorFactory.js\';');
    content = content.replace(/ErrorCode\.(E\d+_[A-Z_]+)/g, '"$1"');
    fs.writeFileSync(f, content);
    console.log('Fixed ', f);
  } else {
    console.log('Not found: ', f);
  }
});
