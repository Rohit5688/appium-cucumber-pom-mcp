import { TestJob } from '../../types/ExecutionTypes.js';
import { SessionManager } from '../execution/SessionManager.js';

export class SharedExecState {
  public jobs = new Map<string, TestJob>();
  
  constructor(public readonly sessionManager?: SessionManager) {}
}
