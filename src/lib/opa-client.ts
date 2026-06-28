// Cliente HTTP para a API OPA Suite.
//
// Contrato confirmado na collection Postman oficial:
//   - Auth: header `Authorization: Bearer <token>`
//   - Listagem: GET com body JSON { filter, options:{ skip, limit } }
//   - Resposta: { data: [ { _id, ... } ] }; pagina até `data` vir vazio.
//
// Usa node:https/http diretamente porque o fetch do Node (undici) PROÍBE
// corpo em requisições GET, que esta API exige.
import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export type OpaDoc = Record<string, unknown> & { _id?: string; id?: string };

export class OpaError extends Error {
  constructor(public statusCode: number, public body: unknown) {
    super(`OPA respondeu ${statusCode}: ${JSON.stringify(body).slice(0, 300)}`);
  }
}

export type OpaClientOptions = {
  baseUrl: string;
  token: string;
  pageSize?: number;
  timeoutMs?: number;
  insecureTls?: boolean; // ignora verificação de cert TLS (hosts com cert inválido)
};

export class OpaClient {
  private baseUrl: string;
  private token: string;
  private pageSize: number;
  private timeoutMs: number;
  private insecureTls: boolean;

  constructor(opts: OpaClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    // Normaliza: aceita token com ou sem prefixo "Bearer ".
    let t = opts.token.trim();
    if (t.toLowerCase().startsWith("bearer ")) t = t.slice(7).trim();
    this.token = t;
    this.pageSize = opts.pageSize ?? 500;
    this.timeoutMs = opts.timeoutMs ?? 30000;
    this.insecureTls = opts.insecureTls ?? false;
  }

  private request(path: string, payload: unknown): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    const body = JSON.stringify(payload);
    const transport = url.protocol === "http:" ? http : https;
    const options: http.RequestOptions = {
      method: "GET", // a API OPA usa GET com body
      hostname: url.hostname,
      port: url.port || (url.protocol === "http:" ? 80 : 443),
      path: url.pathname + url.search,
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: this.timeoutMs,
      // Só afeta HTTPS; ignora cert inválido quando habilitado por cliente.
      ...(url.protocol === "https:" && this.insecureTls ? { rejectUnauthorized: false } : {}),
    };

    return new Promise((resolve, reject) => {
      const req = transport.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed: unknown = text;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            /* mantém texto */
          }
          const status = res.statusCode ?? 0;
          if (status > 299) reject(new OpaError(status, parsed));
          else resolve(parsed);
        });
      });
      req.on("error", reject);
      req.on("timeout", () => req.destroy(new Error(`Timeout após ${this.timeoutMs}ms`)));
      req.write(body);
      req.end();
    });
  }

  private async page(path: string, filter: Record<string, unknown>, skip: number): Promise<OpaDoc[]> {
    const data = await this.request(path, {
      filter,
      options: { limit: this.pageSize, skip },
    });
    const items =
      data && typeof data === "object" && "data" in (data as object)
        ? (data as { data: OpaDoc[] }).data
        : (data as OpaDoc[]);
    return Array.isArray(items) ? items : [];
  }

  // Itera todos os documentos de um recurso, paginando por skip/limit.
  async *iterDocuments(path: string, filter: Record<string, unknown> = {}): AsyncGenerator<OpaDoc> {
    let skip = 0;
    for (;;) {
      const items = await this.page(path, filter, skip);
      if (items.length === 0) break;
      for (const item of items) yield item;
      if (items.length < this.pageSize) break;
      skip += this.pageSize;
    }
  }

  // Valida credenciais buscando 1 etiqueta.
  async ping(): Promise<boolean> {
    try {
      await this.request("/api/v1/etiqueta", { filter: {}, options: { limit: 1, skip: 0 } });
      return true;
    } catch {
      return false;
    }
  }
}
