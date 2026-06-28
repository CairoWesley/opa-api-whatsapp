// Cria/atualiza um usuário do DASHBOARD (login usuário/senha).
//
// Uso (com SUPABASE_URL + SUPABASE_SERVICE_KEY no ambiente):
//   node scripts/create-user.mjs <usuario> <senha>
//
// Em Docker:
//   docker compose exec app node scripts/create-user.mjs maria 'senhaForte'
import { scryptSync, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error("Uso: node scripts/create-user.mjs <usuario> <senha>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) {
  console.error("Defina SUPABASE_URL e SUPABASE_SERVICE_KEY no ambiente.");
  process.exit(1);
}

// Mesmo formato de hash do app (src/lib/session.ts): scrypt$<saltB64>$<hashB64>
function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { error } = await supabase
  .from("dashboard_users")
  .upsert(
    { username, password_hash: hashPassword(password), active: true },
    { onConflict: "username" },
  );

if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}
console.log(`Usuário "${username}" criado/atualizado com sucesso.`);
