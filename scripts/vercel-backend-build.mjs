import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const outdir = path.join(process.cwd(), "api");
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [path.join(process.cwd(), "server", "index.ts")],
  outfile: path.join(outdir, "_server.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: ["node18"],
  sourcemap: false,
  external: ["better-sqlite3"],
});

