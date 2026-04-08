import { TokenBudgetService } from '../../dist/services/TokenBudgetService.js';
const service = TokenBudgetService.getInstance();
const tokens = service.estimateTokens('Hello, world!');
console.assert(tokens >= 2 && tokens <= 5, 'Token estimate off');
console.log('Token estimate test passed');
