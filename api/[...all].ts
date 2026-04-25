// Vercel serverless functions run Node ESM; bundling the backend avoids ESM
// import-specifier issues and keeps the API self-contained in `api/_server.cjs`.
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const serverModule = require("./_server.cjs");

const app = (serverModule as any)?.default ?? serverModule;

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
