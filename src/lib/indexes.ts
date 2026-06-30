// Garante índices nas colunas de FILTRO de cada tabela. Roda no boot do worker
// (server-side) com CREATE INDEX CONCURRENTLY — não trava writes e não depende
// de HTTP (Cloudflare não corta). Idempotente (IF NOT EXISTS). Tabelas grandes
// (atendimentos 3.6M, mensagens 29M) levam minutos — por isso fora da request.
import { exec } from "./db";

// Cada item é um CREATE INDEX CONCURRENTLY independente (autocommit obrigatório).
const INDEX_DDL: string[] = [
  // atendimentos (grande)
  "create index concurrently if not exists idx_atend_client_synced on opa_atendimentos (client_id, synced_at desc)",
  "create index concurrently if not exists idx_atend_client_aberto on opa_atendimentos (client_id, aberto_em)",
  "create index concurrently if not exists idx_atend_aberto on opa_atendimentos (aberto_em)",
  "create index concurrently if not exists idx_atend_encerrado on opa_atendimentos (encerrado_em)",
  "create index concurrently if not exists idx_atend_status on opa_atendimentos (client_id, status)",
  "create index concurrently if not exists idx_atend_protocolo on opa_atendimentos (client_id, protocolo)",
  "create index concurrently if not exists idx_atend_departamento on opa_atendimentos (client_id, departamento)",
  "create index concurrently if not exists idx_atend_canal on opa_atendimentos (client_id, canal)",
  "create index concurrently if not exists idx_atend_contato on opa_atendimentos (client_id, contato_id)",
  "create index concurrently if not exists idx_atend_avaliacao on opa_atendimentos (client_id, avaliacao)",
  // mensagens (muito grande)
  "create index concurrently if not exists idx_msg_client_synced on opa_mensagens (client_id, synced_at desc)",
  "create index concurrently if not exists idx_msg_client_atend on opa_mensagens (client_id, atendimento_id)",
  "create index concurrently if not exists idx_msg_atend on opa_mensagens (atendimento_id)",
  "create index concurrently if not exists idx_msg_tipo on opa_mensagens (client_id, tipo)",
  "create index concurrently if not exists idx_msg_enviado on opa_mensagens (enviado_em)",
  // demais (pequenas) — por completude/idempotência
  "create index concurrently if not exists idx_etiq_nome on opa_etiquetas (client_id, nome)",
  "create index concurrently if not exists idx_usu_nome on opa_usuarios (client_id, nome)",
  "create index concurrently if not exists idx_usu_status on opa_usuarios (client_id, status)",
  "create index concurrently if not exists idx_usu_tipo on opa_usuarios (client_id, tipo)",
  "create index concurrently if not exists idx_dep_nome on opa_departamentos (client_id, nome)",
  "create index concurrently if not exists idx_mot_motivo on opa_motivos (client_id, motivo)",
  "create index concurrently if not exists idx_can_nome on opa_canais (client_id, nome)",
  "create index concurrently if not exists idx_can_status on opa_canais (client_id, status)",
  "create index concurrently if not exists idx_can_canal on opa_canais (client_id, canal)",
  "create index concurrently if not exists idx_tpl_atalho on opa_templates (client_id, atalho)",
  "create index concurrently if not exists idx_tpl_tipo on opa_templates (client_id, tipo_mensagem)",
  "create index concurrently if not exists idx_cli_nome on opa_clientes (client_id, nome)",
  "create index concurrently if not exists idx_cli_fantasia on opa_clientes (client_id, fantasia)",
  "create index concurrently if not exists idx_cli_cnpj on opa_clientes (client_id, cpf_cnpj)",
  "create index concurrently if not exists idx_cli_status on opa_clientes (client_id, status)",
  "create index concurrently if not exists idx_cont_nome on opa_contatos (client_id, nome)",
  "create index concurrently if not exists idx_cont_fone on opa_contatos (client_id, telefone)",
  "create index concurrently if not exists idx_cont_email on opa_contatos (client_id, email)",
  "create index concurrently if not exists idx_per_nome on opa_periodos (client_id, nome)",
  "create index concurrently if not exists idx_per_ativo on opa_periodos (client_id, ativo)",
];

let started = false;
// Roda uma vez. Sequencial (CONCURRENTLY um por vez). Best-effort por índice.
export async function ensureIndexes(log: (m: string) => void = () => {}): Promise<void> {
  if (started) return;
  started = true;
  let ok = 0, fail = 0;
  for (const ddl of INDEX_DDL) {
    try {
      await exec(ddl);
      ok++;
    } catch (e) {
      fail++;
      log(`[idx] falhou: ${ddl.split(" on ")[1] || ddl} — ${e instanceof Error ? e.message : e}`);
    }
  }
  log(`[idx] índices garantidos: ${ok} ok, ${fail} falhas`);
}
