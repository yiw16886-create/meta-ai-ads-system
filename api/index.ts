console.log("⚡ Vercel Function: api/index.ts initialized");

// @ts-ignore - The dist folder is generated at build time
import app from '../dist/server.cjs';

// Ensure we export the actual Express application instance directly
const serverApp = (app && typeof app === 'object' && 'default' in app) ? (app as any).default : app;

export default serverApp;
