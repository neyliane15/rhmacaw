export { fileURLToPath } from './node.js';
export default { fileURLToPath: (u: string | URL): string => String(u).replace(/^file:\/\//, '') };
