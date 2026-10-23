import { state } from '../server/handlers.mjs';
import { nodeHandler } from '../server/adapter.mjs';
export default nodeHandler(state);
