"use client";

import { useCallback, useEffect, useState } from "react";

type Client = {
  id: string; slug: string; name: string; base_url: string; active: boolean;
  insecure_tls: boolean; last_sync_status: string | null; last_sync_error: string | null; last_synced_at: string | null;
};
type ResourceMeta = { key: string; filters: string[] };
type ApiToken = { id: string; name: string; token_prefix: string; scopes: string[]; active: boolean; created_at: string; last_used_at: string | null };
type SyncLog = { id: string; client_id: string; resource: string; status: string; records_upserted: number; error: string | null; started_at: string; finished_at: string | null };
type View = "clientes" | "dados" | "tokens" | "historico" | "docs";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>("clientes");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [me, setMe] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  const [form, setForm] = useState({
    slug: "", name: "", base_url: "", token: "", company_id: "", lookback_days: 30, sync_interval_minutes: 30, insecure_tls: false,
  });

  // dados
  const [dRes, setDRes] = useState("atendimentos");
  const [dClient, setDClient] = useState("");
  const [dLimit, setDLimit] = useState(20);
  const [dPage, setDPage] = useState(1);
  const [dFilter, setDFilter] = useState("");
  const [dMeta, setDMeta] = useState("");
  const [dOut, setDOut] = useState("");

  // docs
  const [docList, setDocList] = useState<{ slug: string; title: string }[]>([]);
  const [docSlug, setDocSlug] = useState("");
  const [docHtml, setDocHtml] = useState("");
  const [docLoading, setDocLoading] = useState(false);

  // tokens
  const [tokens, setTokens] = useState<ApiToken[]>([]);
  const [newTokName, setNewTokName] = useState("");
  const [revealed, setRevealed] = useState("");

  // histórico
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [logClient, setLogClient] = useState("");

  const notify = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 401) { setAuthed(false); throw new Error("Sessão expirada."); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }, []);

  const loadClients = useCallback(async () => setClients(await api("/clients")), [api]);
  const loadResources = useCallback(async () => setResources((await api("/sync/resources")).resources), [api]);
  const loadTokens = useCallback(async () => setTokens((await api("/tokens")).tokens), [api]);
  const loadLogs = useCallback(async (clientId = "") => {
    const qs = clientId ? `?client_id=${clientId}` : "";
    setLogs((await api(`/sync/logs${qs}`)).logs);
  }, [api]);
  const loadDocList = useCallback(async () => { const r = await api("/docs"); setDocList(r.docs); return r.docs as { slug: string; title: string }[]; }, [api]);
  const openDoc = useCallback(async (slug: string) => {
    setDocLoading(true); setDocSlug(slug);
    try { const r = await api(`/docs/${slug}`); setDocHtml(r.html); } catch (e) { setDocHtml(`<p>Erro: ${(e as Error).message}</p>`); } finally { setDocLoading(false); }
  }, [api]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.authenticated) { setAuthed(true); setMe(d.username || "API"); } }).finally(() => setBooting(false));
  }, []);

  useEffect(() => { if (authed) { loadClients().catch((e) => notify(e.message, false)); loadResources().catch(() => {}); } }, [authed, loadClients, loadResources]);
  useEffect(() => { if (authed && view === "tokens") loadTokens().catch((e) => notify(e.message, false)); }, [authed, view, loadTokens]);
  useEffect(() => { if (authed && view === "historico") loadLogs(logClient).catch((e) => notify(e.message, false)); }, [authed, view, logClient, loadLogs]);
  useEffect(() => { if (authed && view === "docs" && docList.length === 0) loadDocList().then((d) => d[0] && openDoc(d[0].slug)).catch(() => {}); }, [authed, view, docList.length, loadDocList, openDoc]);

  const login = async () => {
    if (!username.trim() || !password) return notify("Informe usuário e senha", false);
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha no login");
      setMe(body.user?.username || username.trim()); setPassword(""); setAuthed(true);
    } catch (e) { notify((e as Error).message, false); } finally { setSigningIn(false); }
  };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); setAuthed(false); setUsername(""); setPassword(""); setMe(""); };

  const createClient = async () => {
    try { await api("/clients", { method: "POST", body: JSON.stringify(form) }); notify("Cliente criado"); setForm({ ...form, slug: "", name: "", base_url: "", token: "", company_id: "", insecure_tls: false }); loadClients(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const toggle = async (id: string, action: "activate" | "deactivate") => { try { await api(`/clients/${id}/${action}`, { method: "POST" }); loadClients(); } catch (e) { notify((e as Error).message, false); } };
  const del = async (id: string, slug: string) => { if (!confirm(`Excluir "${slug}" e TODOS os dados? Irreversível.`)) return; try { await api(`/clients/${id}`, { method: "DELETE" }); notify("Removido"); loadClients(); } catch (e) { notify((e as Error).message, false); } };
  const syncNow = async (id: string, full = false) => {
    notify(full ? "Full sync enfileirado" : "Sync enfileirado");
    try { await api(`/sync/clients/${id}${full ? "?full=true" : ""}`, { method: "POST" }); setTimeout(loadClients, 1500); setTimeout(loadClients, 5000); } catch (e) { notify((e as Error).message, false); }
  };
  const seeErrors = (id: string) => { setLogClient(id); setView("historico"); };

  const loadData = async () => {
    const qs = new URLSearchParams({ limit: String(dLimit), page: String(dPage) });
    if (dClient) qs.set("client_id", dClient);
    dFilter.split(",").map((s) => s.trim()).filter(Boolean).forEach((f) => qs.append("filter", f));
    try { const r = await api(`/data/${dRes}?${qs}`); const p = r.pagination; setDMeta(`pág ${p.page} · ${p.returned} de ${p.total} · ${p.has_more ? "há mais" : "fim"}`); setDOut(JSON.stringify(r.data, null, 2)); }
    catch (e) { notify((e as Error).message, false); }
  };

  const genToken = async () => {
    if (!newTokName.trim()) return notify("Dê um nome ao token", false);
    try { const r = await api("/tokens", { method: "POST", body: JSON.stringify({ name: newTokName.trim() }) }); setRevealed(r.token); setNewTokName(""); loadTokens(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const revokeToken = async (id: string) => { if (!confirm("Apagar este token?")) return; try { await api(`/tokens/${id}`, { method: "DELETE" }); loadTokens(); } catch (e) { notify((e as Error).message, false); } };
  const toggleToken = async (id: string, active: boolean) => { try { await api(`/tokens/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }); loadTokens(); } catch (e) { notify((e as Error).message, false); } };

  if (booting) return <div className="login-wrap"><div className="muted">Carregando…</div></div>;

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={(e) => { e.preventDefault(); login(); }}>
          <div className="login-brand"><span className="logo">🟢</span><div><h1>OPA Dashboard</h1><p className="muted">Painel gerencial — WhatsApp / OPA Suite</p></div></div>
          <label htmlFor="u">Usuário</label>
          <input id="u" autoFocus autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="seu usuário" />
          <label htmlFor="p">Senha</label>
          <input id="p" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
          <button className="login-btn" type="submit" disabled={signingIn}>{signingIn ? "Entrando…" : "Entrar"}</button>
          <p className="muted login-foot">API via token (Bearer/Basic). Painel via login.<br /><a href="/api-docs" target="_blank" rel="noreferrer">Documentação da API (Swagger) ↗</a></p>
        </form>
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  const NAV: { v: View; ico: string; label: string }[] = [
    { v: "clientes", ico: "🏢", label: "Clientes" },
    { v: "dados", ico: "🔎", label: "Explorar dados" },
    { v: "tokens", ico: "🔑", label: "Tokens de API" },
    { v: "historico", ico: "🕑", label: "Histórico de sync" },
    { v: "docs", ico: "📚", label: "Documentação" },
  ];
  const titles: Record<View, string> = { clientes: "Clientes", dados: "Explorar dados", tokens: "Tokens de API", historico: "Histórico de sincronização", docs: "Documentação" };
  const subs: Record<View, string> = {
    clientes: "Tenants OPA Suite — criar, sincronizar, ativar/inativar",
    dados: "Leitura paginada e filtrável dos dados extraídos",
    tokens: "Gere e revogue tokens de acesso à API do cliente",
    historico: "Status e motivos de erro por recurso",
    docs: "Documentação do projeto e da API",
  };

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="logo">🟢</span><div><b>OPA Dashboard</b><small>WhatsApp / OPA Suite</small></div></div>
        {NAV.map((n) => (
          <button key={n.v} className={`nav-item ${view === n.v ? "active" : ""}`} onClick={() => setView(n.v)}>
            <span className="ico">{n.ico}</span>{n.label}
          </button>
        ))}
        <a className="nav-item" href="/api-docs" target="_blank" rel="noreferrer"><span className="ico">🔌</span>API — Swagger ↗</a>
        <div className="nav-spacer" />
        <div className="nav-foot">
          <div className="nav-user">Conectado como <b>{me || "—"}</b></div>
          <button className="nav-item" onClick={logout}><span className="ico">↩</span>Sair</button>
        </div>
      </aside>

      <div className="main">
        <div className="topbar">
          <div><h1>{titles[view]}</h1><div className="sub">{subs[view]}</div></div>
        </div>
        <div className="content">
          {view === "clientes" && <ClientesView {...{ form, setForm, clients, syncNow, toggle, del, seeErrors, loadClients, createClient }} />}
          {view === "dados" && <DadosView {...{ resources, clients, dRes, setDRes, dClient, setDClient, dLimit, setDLimit, dPage, setDPage, dFilter, setDFilter, dMeta, dOut, loadData }} />}
          {view === "tokens" && <TokensView {...{ tokens, newTokName, setNewTokName, genToken, revealed, setRevealed, revokeToken, toggleToken, loadTokens }} />}
          {view === "historico" && <HistoricoView {...{ logs, clients, logClient, setLogClient, loadLogs }} />}
          {view === "docs" && <DocsView {...{ docList, docSlug, docHtml, docLoading, openDoc }} />}
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );
}

/* ── Views ─────────────────────────────────────────────────────────────── */
function ClientesView(p: any) {
  const { form, setForm, clients, syncNow, toggle, del, seeErrors, loadClients, createClient } = p;
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Novo cliente (tenant OPA)</h2></div>
        <div className="row">
          <Field label="Slug *" value={form.slug} onChange={(v: string) => setForm({ ...form, slug: v })} ph="empresa-x" />
          <Field label="Nome *" value={form.name} onChange={(v: string) => setForm({ ...form, name: v })} ph="Empresa X" />
          <Field label="Base URL *" value={form.base_url} onChange={(v: string) => setForm({ ...form, base_url: v })} ph="https://empresa.opasuite.net.br" />
          <Field label="Token OPA *" type="password" value={form.token} onChange={(v: string) => setForm({ ...form, token: v })} ph="JWT da OPA" />
          <Field label="company_id" value={form.company_id} onChange={(v: string) => setForm({ ...form, company_id: v })} ph="opcional" />
          <Field label="Lookback (dias)" type="number" value={String(form.lookback_days)} onChange={(v: string) => setForm({ ...form, lookback_days: Number(v) })} />
          <Field label="Intervalo sync (min)" type="number" value={String(form.sync_interval_minutes)} onChange={(v: string) => setForm({ ...form, sync_interval_minutes: Number(v) })} />
          <div><label>Segurança TLS</label><label className="chk"><input type="checkbox" checked={form.insecure_tls} onChange={(e) => setForm({ ...form, insecure_tls: e.target.checked })} /><span>Ignorar certificado</span></label></div>
        </div>
        <div style={{ marginTop: 16 }}><button onClick={createClient}>Criar cliente</button></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Clientes</h2><span className="sp" /><button className="ghost xs" onClick={() => loadClients()}>↻ Atualizar</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Slug</th><th>Nome</th><th>Status</th><th>Último sync</th><th>Ações</th></tr></thead>
            <tbody>
              {clients.map((c: Client) => (
                <tr key={c.id}>
                  <td><b>{c.slug}</b>{c.insecure_tls && <span className="muted" title="TLS inseguro"> 🔓</span>}</td>
                  <td>{c.name}</td>
                  <td><StatusPill status={c.last_sync_status} /> {c.last_sync_status === "error" && <button className="ghost xs" onClick={() => seeErrors(c.id)}>ver erro</button>}</td>
                  <td className="muted">{fmt(c.last_synced_at)}</td>
                  <td className="actions">
                    <button className="sec xs" onClick={() => syncNow(c.id)}>Sync</button>
                    <button className="sec xs" onClick={() => syncNow(c.id, true)}>Full</button>
                    {c.active ? <button className="warn xs" onClick={() => toggle(c.id, "deactivate")}>Inativar</button> : <button className="xs" onClick={() => toggle(c.id, "activate")}>Ativar</button>}
                    <button className="danger xs" onClick={() => del(c.id, c.slug)}>Excluir</button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && <tr><td colSpan={5} className="empty">Nenhum cliente ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function DadosView(p: any) {
  const { resources, clients, dRes, setDRes, dClient, setDClient, dLimit, setDLimit, dPage, setDPage, dFilter, setDFilter, dMeta, dOut, loadData } = p;
  return (
    <section className="card">
      <div className="card-head"><h2>Explorar dados</h2></div>
      <div className="row">
        <div><label>Recurso</label><select value={dRes} onChange={(e) => setDRes(e.target.value)}>{resources.map((r: ResourceMeta) => <option key={r.key} value={r.key}>{r.key}</option>)}</select></div>
        <div><label>Cliente</label><select value={dClient} onChange={(e) => setDClient(e.target.value)}><option value="">(todos)</option>{clients.map((c: Client) => <option key={c.id} value={c.id}>{c.slug}</option>)}</select></div>
        <Field label="Limite" type="number" value={String(dLimit)} onChange={(v: string) => setDLimit(Number(v))} />
        <Field label="Página" type="number" value={String(dPage)} onChange={(v: string) => setDPage(Number(v))} />
        <Field label="Filtros (campo:op:valor, vírgula)" value={dFilter} onChange={setDFilter} ph="status:eq:aberto, protocolo:like:2024" />
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, alignItems: "center" }}><button className="sec" onClick={loadData}>Consultar</button><span className="muted">{dMeta}</span></div>
      {dOut && <pre style={{ marginTop: 14 }}>{dOut}</pre>}
    </section>
  );
}

function TokensView(p: any) {
  const { tokens, newTokName, setNewTokName, genToken, revealed, setRevealed, revokeToken, toggleToken, loadTokens } = p;
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Gerar novo token</h2></div>
        <p className="card-desc">Tokens dão acesso à API de leitura do cliente (Bearer ou Basic auth). O valor aparece uma única vez.</p>
        {revealed && (
          <div className="reveal">
            <b>Token gerado — copie agora (não será mostrado de novo):</b>
            <div className="tok"><code className="mono">{revealed}</code><button className="xs" onClick={() => { navigator.clipboard?.writeText(revealed); }}>Copiar</button><button className="ghost xs" onClick={() => setRevealed("")}>Fechar</button></div>
          </div>
        )}
        <div className="row">
          <Field label="Nome do token" value={newTokName} onChange={setNewTokName} ph="ex: powerbi-financeiro" />
        </div>
        <div style={{ marginTop: 16 }}><button onClick={genToken}>Gerar token</button></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Tokens ativos</h2><span className="sp" /><button className="ghost xs" onClick={() => loadTokens()}>↻ Atualizar</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Prefixo</th><th>Escopos</th><th>Status</th><th>Criado</th><th>Último uso</th><th>Ações</th></tr></thead>
            <tbody>
              {tokens.map((t: ApiToken) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td className="mono">{t.token_prefix}…</td>
                  <td className="muted">{t.scopes.join(", ")}</td>
                  <td><span className={`pill ${t.active ? "on" : "off"}`}><span className="dot" />{t.active ? "ativo" : "revogado"}</span></td>
                  <td className="muted">{fmt(t.created_at)}</td>
                  <td className="muted">{fmt(t.last_used_at)}</td>
                  <td className="actions">
                    {t.active ? <button className="warn xs" onClick={() => toggleToken(t.id, false)}>Revogar</button> : <button className="xs" onClick={() => toggleToken(t.id, true)}>Reativar</button>}
                    <button className="danger xs" onClick={() => revokeToken(t.id)}>Excluir</button>
                  </td>
                </tr>
              ))}
              {tokens.length === 0 && <tr><td colSpan={7} className="empty">Nenhum token. Gere o primeiro acima.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function HistoricoView(p: any) {
  const { logs, clients, logClient, setLogClient, loadLogs } = p;
  const slugOf = (id: string) => clients.find((c: Client) => c.id === id)?.slug || "—";
  return (
    <section className="card">
      <div className="card-head">
        <h2>Histórico de sync</h2><span className="sp" />
        <select style={{ width: 200 }} value={logClient} onChange={(e) => setLogClient(e.target.value)}>
          <option value="">(todos os clientes)</option>
          {clients.map((c: Client) => <option key={c.id} value={c.id}>{c.slug}</option>)}
        </select>
        <button className="ghost xs" onClick={() => loadLogs(logClient)}>↻</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Quando</th><th>Cliente</th><th>Recurso</th><th>Status</th><th>Registros</th><th>Motivo do erro</th></tr></thead>
          <tbody>
            {logs.map((l: SyncLog) => (
              <tr key={l.id}>
                <td className="muted">{fmt(l.started_at)}</td>
                <td>{slugOf(l.client_id)}</td>
                <td><b>{l.resource}</b></td>
                <td><span className={`pill ${l.status === "ok" ? "ok" : "error"}`}><span className="dot" />{l.status}</span></td>
                <td>{l.records_upserted}</td>
                <td style={{ maxWidth: 460 }}>{l.error ? <span style={{ color: "var(--danger)" }} className="mono" title={l.error}>{l.error.length > 120 ? l.error.slice(0, 120) + "…" : l.error}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
            {logs.length === 0 && <tr><td colSpan={6} className="empty">Sem registros de sync ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DocsView(p: any) {
  const { docList, docSlug, docHtml, docLoading, openDoc } = p;
  return (
    <section className="card docs-layout">
      <aside className="docs-nav">
        {docList.map((d: { slug: string; title: string }) => (
          <button key={d.slug} className={`doc-link ${d.slug === docSlug ? "on" : ""}`} onClick={() => openDoc(d.slug)}>{d.title}</button>
        ))}
        <a className="doc-link doc-ext" href="/api-docs" target="_blank" rel="noreferrer">🔌 API — Swagger ↗</a>
      </aside>
      <article className="docs-body">{docLoading ? <p className="muted">Carregando…</p> : <div className="markdown" dangerouslySetInnerHTML={{ __html: docHtml }} />}</article>
    </section>
  );
}

/* ── Átomos ────────────────────────────────────────────────────────────── */
function Field(props: { label: string; value: string; onChange: (v: string) => void; ph?: string; type?: string }) {
  return <div className="field"><label>{props.label}</label><input type={props.type || "text"} value={props.value} placeholder={props.ph} onChange={(e) => props.onChange(e.target.value)} /></div>;
}
function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="muted">—</span>;
  const cls = status === "ok" ? "ok" : status === "error" ? "error" : "running";
  return <span className={`pill ${cls}`}><span className="dot" />{status}</span>;
}
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return <div className="toast" style={{ borderLeftColor: ok ? "var(--acc)" : "var(--danger)" }}>{msg}</div>;
}
