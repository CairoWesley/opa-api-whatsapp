// Mapeia o documento cru da OPA → colunas TIPADAS de cada tabela de recurso.
// Cada coluna recebe o 1º valor não-vazio dentre nomes prováveis (PT/EN).
// O resto do documento continua em `raw`. Define também a tabela e as colunas
// "promovidas" (para a read API saber filtrar por coluna vs raw->>campo).

type Doc = Record<string, unknown>;
type ColSpec = { keys: string[]; date?: boolean };
type ResourceMap = { table: string; columns: Record<string, ColSpec> };

const DATE_RE = /^\d{4}-\d{2}-\d{2}/; // ISO-ish; senão vira null (evita erro de cast)

function pick(doc: Doc, spec: ColSpec): string | null {
  for (const k of spec.keys) {
    const v = doc[k];
    if (v !== undefined && v !== null && v !== "") {
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      if (spec.date) return DATE_RE.test(s) ? s : null;
      return s;
    }
  }
  return null;
}

// Registro: recurso → tabela + colunas tipadas (com nomes-fonte no doc).
export const MAPPERS: Record<string, ResourceMap> = {
  etiquetas: { table: "opa_etiquetas", columns: { nome: { keys: ["nome", "name"] } } },
  usuarios: {
    table: "opa_usuarios",
    columns: { nome: { keys: ["nome", "name"] }, status: { keys: ["status"] }, tipo: { keys: ["tipo", "type"] } },
  },
  departamentos: { table: "opa_departamentos", columns: { nome: { keys: ["nome", "name"] } } },
  motivos: { table: "opa_motivos", columns: { motivo: { keys: ["motivo", "nome", "name"] } } },
  canais: {
    table: "opa_canais",
    columns: { nome: { keys: ["nome", "name"] }, status: { keys: ["status"] }, canal: { keys: ["canal", "channel"] } },
  },
  templates: {
    table: "opa_templates",
    columns: { atalho: { keys: ["atalho", "shortcut"] }, tipo_mensagem: { keys: ["tipo_mensagem", "tipoMensagem"] } },
  },
  clientes: {
    table: "opa_clientes",
    columns: {
      nome: { keys: ["nome", "name"] },
      fantasia: { keys: ["fantasia", "nomeFantasia"] },
      cpf_cnpj: { keys: ["cpf_cnpj", "cpfCnpj", "documento"] },
      status: { keys: ["status"] },
    },
  },
  contatos: {
    table: "opa_contatos",
    columns: {
      nome: { keys: ["nome", "name"] },
      telefone: { keys: ["telefone", "phone", "fone", "numero"] },
      email: { keys: ["email", "email_principal", "emailPrincipal"] },
    },
  },
  periodos: { table: "opa_periodos", columns: { nome: { keys: ["nome", "name"] }, ativo: { keys: ["ativo", "active"] } } },
  atendimentos: {
    table: "opa_atendimentos",
    columns: {
      protocolo: { keys: ["protocolo", "protocol"] },
      status: { keys: ["status", "situacao"] },
      departamento: { keys: ["departamento", "setor"] },
      canal: { keys: ["canalComunicacao", "canal", "channel_id"] },
      contato_id: { keys: ["contato", "contato_id", "contatoId"] },
      avaliacao: { keys: ["avaliacao", "rating"] },
      aberto_em: { keys: ["dataAbertura", "dataInicialAbertura", "criadoEm", "createdAt"], date: true },
      encerrado_em: { keys: ["dataEncerramento", "dataFinalEncerramento", "finishedAt"], date: true },
    },
  },
  mensagens: {
    table: "opa_mensagens",
    columns: {
      atendimento_id: { keys: ["atendimento", "atendimentoId", "id_rota", "idRota"] },
      tipo: { keys: ["tipo", "direction"] },
      conteudo: { keys: ["mensagem", "conteudo", "content"] },
      enviado_em: { keys: ["data", "criadoEm", "createdAt"], date: true },
    },
  },
};

export function tableFor(resource: string): string {
  const m = MAPPERS[resource];
  if (!m) throw new Error(`Recurso sem tabela: ${resource}`);
  return m.table;
}

// Colunas tipadas (promovidas) de um recurso — usado p/ decidir coluna vs raw.
export function typedColumns(resource: string): string[] {
  return Object.keys(MAPPERS[resource]?.columns ?? {});
}

// Constrói o objeto de colunas tipadas a partir do documento.
export function mapTypedColumns(resource: string, doc: Doc): Record<string, string | null> {
  const m = MAPPERS[resource];
  if (!m) return {};
  const out: Record<string, string | null> = {};
  for (const [col, spec] of Object.entries(m.columns)) out[col] = pick(doc, spec);
  return out;
}
