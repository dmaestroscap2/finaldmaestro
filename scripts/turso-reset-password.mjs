import process from "node:process";
import { createClient } from "@libsql/client";
import bcrypt from "bcryptjs";

const email = String(process.argv[2] ?? "").trim().toLowerCase();
const newPassword = String(process.argv[3] ?? "").trim();
const role = process.argv[4] ? String(process.argv[4]).trim().toLowerCase() : null;

if (!email || !newPassword) {
  console.error("Usage: node scripts/turso-reset-password.mjs <email> <newPassword> [student|instructor]");
  process.exit(1);
}

const tursoUrl = String(process.env.TURSO_DATABASE_URL ?? process.env.LIBSQL_URL ?? "").trim();
const tursoToken = String(process.env.TURSO_AUTH_TOKEN ?? process.env.LIBSQL_AUTH_TOKEN ?? "").trim();

if (!tursoUrl || !tursoToken) {
  console.error("Missing TURSO_DATABASE_URL and/or TURSO_AUTH_TOKEN in environment.");
  process.exit(1);
}

const client = createClient({ url: tursoUrl, authToken: tursoToken });

const whereRole = role === "student" || role === "instructor" ? " AND lower(role) = ?" : "";
const args = role === "student" || role === "instructor" ? [email, role] : [email];
const userRes = await client.execute({
  sql: `SELECT id, email, role FROM users WHERE lower(email) = ?${whereRole} ORDER BY id DESC LIMIT 1`,
  args,
});

const user = userRes.rows?.[0];
if (!user) {
  console.error("User not found for:", email, role ? `(role=${role})` : "");
  process.exit(2);
}

const hash = bcrypt.hashSync(newPassword, 10);
await client.execute({
  sql: "UPDATE users SET password = ? WHERE id = ?",
  args: [hash, Number(user.id)],
});

console.log("Password updated for:", String(user.email), `(role=${String(user.role)})`, `id=${Number(user.id)}`);

