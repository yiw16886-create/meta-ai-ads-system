console.log("⚡ Vercel Function: api/index.ts initialized");

// @ts-ignore - The dist folder is generated at build time
import app from '../dist/server.cjs';

export default app;
