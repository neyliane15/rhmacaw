import { fs } from './node.js';
export default fs;
export const { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync, mkdtempSync } = fs;
