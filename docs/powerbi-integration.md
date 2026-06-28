# Integração com Power BI — Avaliação

> Objetivo: avaliar a viabilidade de consumir os dados extraídos da OPA Suite
> no Power BI. **Conclusão: totalmente viável**, com 3 caminhos possíveis.
> Recomendado o **caminho A (conector PostgreSQL nativo)**.

## Contexto

Os dados da OPA Suite são extraídos por este app e gravados no **Supabase
(Postgres)**, na tabela `opa_documents` (raw `jsonb`) e expostos em **views
tipadas** (`vw_atendimentos`, `vw_contatos`, `vw_mensagens`). Power BI lê
Postgres nativamente, então a integração é direta.

---

## Caminho A — Conector PostgreSQL nativo (recomendado)

Power BI Desktop → **Obter Dados → Banco de Dados PostgreSQL**.

**Como configurar**
1. No Supabase: *Project Settings → Database → Connection string*. Use o host
   de **Session pooler** (porta `5432`) ou o direto.
2. No Power BI: servidor `db.<ref>.supabase.co`, banco `postgres`.
   - Usuário: crie um usuário **somente-leitura** dedicado ao BI (ver SQL abaixo).
3. Selecione as views `vw_atendimentos`, `vw_contatos`, `vw_mensagens`.
4. Modo **Import** (recomendado para dashboards) ou **DirectQuery** (tempo real).

**Usuário read-only para o Power BI** (rode no SQL Editor do Supabase):

```sql
create role bi_readonly login password 'TROQUE_POR_SENHA_FORTE';
grant connect on database postgres to bi_readonly;
grant usage on schema public to bi_readonly;
grant select on public.vw_atendimentos, public.vw_contatos, public.vw_mensagens to bi_readonly;
-- NÃO conceda select em opa_clients (contém token criptografado).
```

✅ **Prós:** nativo, performático, suporta Import e DirectQuery, refresh agendado
no Power BI Service via Gateway.
⚠️ **Contras:** expõe credenciais de banco ao BI — por isso o usuário read-only
restrito às views.

---

## Caminho B — Conector Web / REST (via este app)

Power BI → **Obter Dados → Web**, apontando para o read API paginado deste app:

```
GET https://<seu-deploy>/api/data/atendimentos?limit=1000&page=1
Header: Authorization: Bearer <APP_ADMIN_TOKEN>
```

A resposta traz `pagination.has_more`; use uma função M (Power Query) que itera
as páginas até `has_more = false`. Esqueleto:

```m
let
  token = "Bearer " & APP_ADMIN_TOKEN,
  fetch = (page as number) =>
    let
      url = "https://<deploy>/api/data/atendimentos?limit=1000&page=" & Text.From(page),
      resp = Json.Document(Web.Contents(url, [Headers=[Authorization=token]]))
    in resp,
  // itera enquanto has_more = true ...
in
  ...
```

✅ **Prós:** não expõe o Postgres; reaproveita auth/cache do app.
⚠️ **Contras:** paginação manual em M; menos performático que SQL para grandes volumes.

---

## Caminho C — Supabase Data API (PostgREST)

Supabase expõe PostgREST. Daria para consumir via Web connector, **porém** as
tabelas estão com **RLS habilitado sem policies públicas** (segurança), então a
`anon key` não lê nada. Seria preciso criar policies/Views específicas para o BI.
**Não recomendado** frente ao caminho A.

---

## Recomendação final

| Critério | A (PostgreSQL) | B (REST app) | C (PostgREST) |
|---|:--:|:--:|:--:|
| Performance volume alto | ✅ | ⚠️ | ⚠️ |
| Tempo real (DirectQuery) | ✅ | ❌ | ⚠️ |
| Esforço de setup | baixo | médio | alto |
| Segurança (sem expor token) | ✅ (role restrita) | ✅ | ⚠️ |

➡️ **Use o Caminho A** com o usuário `bi_readonly` restrito às views.
Para tempo real eventual, B complementa via DirectQuery no app.

## Próximos passos sugeridos

- Criar mais views por necessidade do BI (ex: `vw_atendimentos_diario` agregada).
- Agendar refresh no Power BI Service (Gateway apontando ao Supabase).
- Se o volume crescer muito, materializar views (`materialized view`) e refresh
  pós-sync.
