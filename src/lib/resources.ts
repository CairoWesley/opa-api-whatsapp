// Catálogo de recursos da API OPA Suite (paths/filtros da collection Postman oficial).
// Listagem via GET com body { filter, options:{ skip, limit } }; grava raw por _id.

export type Resource = {
  key: string; // nome lógico (coluna resource no Supabase)
  path: string; // path relativo à base_url do cliente
  filters: string[]; // filtros aceitos no body
  // Campos de data p/ a janela incremental. CADA campo vira uma passada
  // separada (a OPA combina filtros com AND num mesmo request), e os
  // resultados são mesclados por upsert (_id). Ex: abertura (criado) +
  // encerramento (fechado) → pega tudo que abriu OU fechou na janela.
  incrementalDates?: string[];
};

// Ordem: dimensões primeiro, fatos (atendimentos/mensagens) por último.
export const RESOURCES: Resource[] = [
  { key: "etiquetas", path: "/api/v1/etiqueta", filters: ["nome", "id_criador", "empresa"] },
  { key: "usuarios", path: "/api/v1/usuario", filters: ["nome", "status", "tipo"] },
  { key: "departamentos", path: "/api/v1/departamento", filters: ["nome", "token", "cod_pabx", "realizaAtendimento"] },
  { key: "motivos", path: "/api/v1/atendimento/motivo", filters: ["motivo", "departamentos"] },
  { key: "canais", path: "/api/v1/canal-comunicacao", filters: ["nome", "id_atendente", "status", "canal", "integracao"] },
  { key: "templates", path: "/api/v1/template", filters: ["atalho", "tipo_mensagem"] },
  { key: "clientes", path: "/api/v1/cliente", filters: ["id", "id_fornecedor", "id_filial", "nome", "fantasia", "cpf_cnpj", "status", "prospect", "cliente", "fornecedor"] },
  { key: "contatos", path: "/api/v1/contato", filters: ["nome", "email_principal", "fones.numero", "classificacao", "cli_emp"] },
  { key: "periodos", path: "/api/v1/atendimento/periodo", filters: ["nome", "departamento", "ativo", "periodos.nome"] },
  {
    key: "atendimentos",
    path: "/api/v1/atendimento",
    filters: ["protocolo", "dataInicialAbertura", "dataFinalAbertura", "dataInicialEncerramento", "dataFinalEncerramento"],
    // Incremental por 2 janelas: abertura (criado) e encerramento (fechado).
    incrementalDates: ["dataInicialAbertura", "dataInicialEncerramento"],
  },
  { key: "mensagens", path: "/api/v1/atendimento/mensagem", filters: ["id_rota"] },
];

export const RESOURCE_KEYS = RESOURCES.map((r) => r.key);
const BY_KEY = new Map(RESOURCES.map((r) => [r.key, r]));

export function getResource(key: string): Resource {
  const r = BY_KEY.get(key);
  if (!r) throw new Error(`Recurso desconhecido: ${key}. Válidos: ${RESOURCE_KEYS.join(", ")}`);
  return r;
}

export function isValidResource(key: string): boolean {
  return BY_KEY.has(key);
}
