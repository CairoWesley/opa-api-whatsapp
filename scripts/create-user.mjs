// Cria/atualiza um usuário do DASHBOARD (login usuário/senha). Direto no Postgres.
//
// Uso (com DATABASE_URL no ambiente):
//   node scripts/create-user.mjs <usuario> <senha>
//
// Em Docker:
//   docker compose exec app node scripts/create-user.mjs maria 'senhaForte'
import { scryptSync, randomBytes } from "node:crypto";
import pg from "pg";

const [, , username, password] = process.argv;
if (!username || !password) {
  console.error("Uso: node scripts/create-user.mjs <usuario> <senha>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) { console.error("Defina DATABASE_URL no ambiente."); process.exit(1); }

function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString("base64")}$${hash.toString("base64")}`;
}

const client = new pg.Client({ connectionString: url });
await client.connect();
await client.query(
  `insert into dashboard_users (username, password_hash, active) values ($1,$2,true)
   on conflict (username) do update set password_hash=excluded.password_hash, active=true`,
  [username, hashPassword(password)],
);
await client.end();
console.log(`Usuário "${username}" criado/atualizado com sucesso.`);
