#!/usr/bin/env node
// Smoke test de conectividade com a API OPA Suite (não usa Supabase).
// Valida credenciais de UM cliente e conta registros por recurso.
//
// Uso:
//   OPA_BASE_URL=https://empresa.opasuite.net.br OPA_TOKEN='Bearer eyJ...' \
//     node scripts/smoke.mjs [recurso] [pageSize]
//
// recurso (opcional): etiqueta | usuario | contato | atendimento | ... (default: etiqueta)
import https from "node:https";
import http from "node:http";
import { URL } from "node:url";

const BASE = process.env.OPA_BASE_URL;
const TOKEN = (process.env.OPA_TOKEN || "").replace(/^Bearer\s+/i, "");
if (!BASE || !TOKEN) {
  console.error("Defina OPA_BASE_URL e OPA_TOKEN. Ex:");
  console.error("  OPA_BASE_URL=https://empresa.opasuite.net.br OPA_TOKEN='eyJ...' node scripts/smoke.mjs");
  process.exit(1);
}

const PATHS = {
  etiqueta: "/api/v1/etiqueta",
  usuario: "/api/v1/usuario",
  departamento: "/api/v1/departamento",
  contato: "/api/v1/contato",
  cliente: "/api/v1/cliente",
  atendimento: "/api/v1/atendimento",
  mensagem: "/api/v1/atendimento/mensagem",
};

const recurso = process.argv[2] || "etiqueta";
const pageSize = Number(process.argv[3] || 100);
const path = PATHS[recurso];
if (!path) {
  console.error(`Recurso inválido: ${recurso}. Use: ${Object.keys(PATHS).join(", ")}`);
  process.exit(1);
}

function getPage(skip) {
  const url = new URL(BASE.replace(/\/+$/, "") + path);
  const body = JSON.stringify({ filter: {}, options: { limit: pageSize, skip } });
  const transport = url.protocol === "http:" ? http : https;
  const opts = {
    method: "GET",
    hostname: url.hostname,
    port: url.port || (url.protocol === "http:" ? 80 : 443),
    path: url.pathname,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body),
    },
    timeout: 30000,
  };
  return new Promise((resolve, reject) => {
    const req = transport.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        if ((res.statusCode ?? 0) > 299) return reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
        try {
          const json = JSON.parse(text);
          resolve(Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : []);
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

(async () => {
  console.log(`→ ${BASE}${path} (pageSize=${pageSize})`);
  let skip = 0;
  let total = 0;
  for (;;) {
    const items = await getPage(skip);
    if (items.length === 0) break;
    total += items.length;
    process.stdout.write(`\r  ${total} registros...`);
    if (items.length < pageSize) break;
    skip += pageSize;
  }
  console.log(`\n✓ OK — ${total} registros em "${recurso}".`);
})().catch((e) => {
  console.error(`\n✗ Falhou: ${e.message}`);
  process.exit(1);
});
