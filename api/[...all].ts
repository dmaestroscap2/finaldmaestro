// Vercel serverless functions run Node ESM; bundling the backend avoids ESM
// import-specifier issues and keeps the API self-contained in `api/_server.cjs`.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const serverModule = require("./_server.cjs");

const app = (serverModule as any)?.default ?? serverModule;

export default function handler(req: any, res: any) {
  return (app as any)(req, res);
}
