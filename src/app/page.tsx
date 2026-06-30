"use client";

import { useCallback, useEffect, useState } from "react";

type Client = {
  id: string; slug: string; name: string; base_url: string; company_id: string | null; active: boolean; archived: boolean;
  insecure_tls: boolean; page_size: number | null; timeout_ms: number | null;
  lookback_days: number; sync_interval_minutes: number;
  blocked_resources: string[]; disabled_resources: string[]; resource_access: Record<string, { ok: boolean; code: number; at: string }>;
  last_sync_status: string | null; last_sync_error: string | null; last_synced_at: string | null;
};
type ResourceMeta = { key: string; filters: string[] };
type ApiToken = { id: string; name: string; client_id: string | null; token_prefix: string; scopes: string[]; active: boolean; created_at: string; last_used_at: string | null };
type SyncLog = { id: string; client_id: string; resource: string; status: string; records_upserted: number; error: string | null; started_at: string; finished_at: string | null };
type View = "dashboard" | "clientes" | "dados" | "filtros" | "query" | "views" | "tokens" | "historico" | "config" | "usuarios" | "docs";

const fmt = (d: string | null) => (d ? new Date(d).toLocaleString("pt-BR") : "—");
const fmtDur = (ms: number | null) => (ms == null ? "—" : ms < 1000 ? `${ms}ms` : ms < 60000 ? `${(ms / 1000).toFixed(1)}s` : `${(ms / 60000).toFixed(1)}min`);

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [restored, setRestored] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [me, setMe] = useState("");
  const [role, setRole] = useState("admin");
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
  const [newTokClient, setNewTokClient] = useState("");
  const [revealed, setRevealed] = useState("");

  // histórico
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [logClient, setLogClient] = useState("");

  // dashboard
  const [overview, setOverview] = useState<any>(null);

  // configurações
  const [settings, setSettings] = useState<any>(null);

  // query SQL
  const [qSql, setQSql] = useState("select slug, name, last_sync_status, last_synced_at from opa_clients order by created_at limit 20");
  const [qResult, setQResult] = useState<any>(null);
  const [qRunning, setQRunning] = useState(false);
  // Views SQL entregues ao cliente via token.
  const [viewsList, setViewsList] = useState<any[]>([]);
  const [vForm, setVForm] = useState({ slug: "", name: "", sql: "select client_id, count(*) total\nfrom opa_atendimentos\ngroup by client_id", materialized: false, refresh_interval_minutes: 60 });

  // testar filtros
  const [ftRes, setFtRes] = useState("atendimentos");
  const [ftClient, setFtClient] = useState("");
  const [ftRows, setFtRows] = useState<{ field: string; op: string; value: string }[]>([{ field: "status", op: "eq", value: "aberto" }]);
  const [ftOut, setFtOut] = useState<any>(null);

  // usuários
  const [users, setUsers] = useState<any[]>([]);
  const [nu, setNu] = useState({ username: "", password: "", role: "gestor" });

  const notify = (msg: string, ok = true) => { setToast({ msg, ok }); setTimeout(() => setToast(null), 4000); };

  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`/api${path}`, { ...opts, headers: { "Content-Type": "application/json", ...(opts.headers || {}) } });
    if (res.status === 401) { setAuthed(false); throw new Error("Sessão expirada."); }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }, []);

  const [showArchived, setShowArchived] = useState(false);
  const loadClients = useCallback(async () => setClients(await api(`/clients${showArchived ? "?include_archived=true" : ""}`)), [api, showArchived]);
  const loadResources = useCallback(async () => setResources((await api("/sync/resources")).resources), [api]);
  const loadTokens = useCallback(async () => setTokens((await api("/tokens")).tokens), [api]);
  const loadLogs = useCallback(async (clientId = "") => {
    const qs = clientId ? `?client_id=${clientId}` : "";
    const [l, r] = await Promise.all([api(`/sync/logs${qs}`), api(`/sync/runs${qs}`)]);
    setLogs(l.logs);
    setRuns(r.runs);
  }, [api]);
  const loadOverview = useCallback(async () => setOverview(await api("/stats/overview")), [api]);
  const loadSettings = useCallback(async () => setSettings(await api("/settings")), [api]);
  const loadUsers = useCallback(async () => setUsers((await api("/users")).users), [api]);
  const runQuery = async () => {
    setQRunning(true);
    try { setQResult(await api("/query", { method: "POST", body: JSON.stringify({ sql: qSql }) })); }
    catch (e) { setQResult(null); notify((e as Error).message, false); }
    finally { setQRunning(false); }
  };
  const loadViews = useCallback(async () => { setViewsList(await api("/views")); }, [api]);
  const createView = async () => {
    if (!vForm.slug.trim() || !vForm.sql.trim()) return notify("Informe slug e SQL", false);
    try { await api("/views", { method: "POST", body: JSON.stringify(vForm) }); notify("View criada"); setVForm({ ...vForm, slug: "", name: "" }); loadViews(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const deleteView = async (slug: string) => {
    try { await api(`/views/${slug}`, { method: "DELETE" }); notify("View removida"); loadViews(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const refreshViewNow = async (slug: string) => {
    try { const r = await api(`/views/${slug}/refresh`, { method: "POST" }); notify(`Atualizada ${r.last_refreshed_at ? new Date(r.last_refreshed_at).toLocaleTimeString() : ""}`); loadViews(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const runFilterTest = async () => {
    const qs = new URLSearchParams({ limit: "20" });
    if (ftClient) qs.set("client_id", ftClient);
    ftRows.filter((r) => r.field && r.value).forEach((r) => qs.append("filter", `${r.field}:${r.op}:${r.value}`));
    const url = `/api/data/${ftRes}?${qs}`;
    try { const r = await api(`/data/${ftRes}?${qs}`); setFtOut({ url, total: r.pagination.total, returned: r.pagination.returned, data: r.data }); }
    catch (e) { setFtOut({ url, error: (e as Error).message }); }
  };
  const createUserFn = async () => {
    if (!nu.username || nu.password.length < 6) return notify("Usuário e senha (≥6)", false);
    try { await api("/users", { method: "POST", body: JSON.stringify(nu) }); notify("Usuário criado"); setNu({ username: "", password: "", role: "gestor" }); loadUsers(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const delUser = async (id: string) => { if (!confirm("Remover usuário?")) return; try { await api(`/users/${id}`, { method: "DELETE" }); loadUsers(); } catch (e) { notify((e as Error).message, false); } };
  const saveSettings = async (patch: any) => {
    try { setSettings(await api("/settings", { method: "PUT", body: JSON.stringify(patch) })); notify("Configurações salvas"); }
    catch (e) { notify((e as Error).message, false); }
  };
  const loadDocList = useCallback(async () => { const r = await api("/docs"); setDocList(r.docs); return r.docs as { slug: string; title: string }[]; }, [api]);
  const openDoc = useCallback(async (slug: string) => {
    setDocLoading(true); setDocSlug(slug);
    try { const r = await api(`/docs/${slug}`); setDocHtml(r.html); } catch (e) { setDocHtml(`<p>Erro: ${(e as Error).message}</p>`); } finally { setDocLoading(false); }
  }, [api]);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => { if (d?.authenticated) { setAuthed(true); setMe(d.username || "API"); setRole(d.role || "admin"); } }).finally(() => setBooting(false));
  }, []);

  // Restaura o estado do painel (onde você estava) após F5.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem("opa_ui") || "{}");
      if (s.view) setView(s.view);
      if (s.dRes) setDRes(s.dRes);
      if (s.dClient) setDClient(s.dClient);
      if (typeof s.dLimit === "number") setDLimit(s.dLimit);
      if (typeof s.dPage === "number") setDPage(s.dPage);
      if (typeof s.dFilter === "string") setDFilter(s.dFilter);
      if (s.logClient) setLogClient(s.logClient);
      if (s.newTokClient) setNewTokClient(s.newTokClient);
    } catch { /* ignora */ }
    setRestored(true);
  }, []);

  // Salva o estado a cada mudança (depois de restaurar, p/ não sobrescrever).
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem("opa_ui", JSON.stringify({ view, dRes, dClient, dLimit, dPage, dFilter, logClient, newTokClient }));
    } catch { /* ignora */ }
  }, [restored, view, dRes, dClient, dLimit, dPage, dFilter, logClient, newTokClient]);

  useEffect(() => { if (authed) { loadClients().catch((e) => notify(e.message, false)); loadResources().catch(() => {}); } }, [authed, loadClients, loadResources]);
  useEffect(() => { if (authed && view === "tokens") loadTokens().catch((e) => notify(e.message, false)); }, [authed, view, loadTokens]);
  useEffect(() => { if (authed && view === "dashboard") { loadTokens().catch(() => {}); loadOverview().catch((e) => notify(e.message, false)); } }, [authed, view, loadTokens, loadOverview]);
  useEffect(() => { if (authed && view === "config") loadSettings().catch((e) => notify(e.message, false)); }, [authed, view, loadSettings]);
  useEffect(() => { if (authed && view === "usuarios") loadUsers().catch((e) => notify(e.message, false)); }, [authed, view, loadUsers]);
  useEffect(() => { if (authed && view === "views") loadViews().catch((e) => notify(e.message, false)); }, [authed, view, loadViews]);
  useEffect(() => { if (authed && view === "historico") loadLogs(logClient).catch((e) => notify(e.message, false)); }, [authed, view, logClient, loadLogs]);
  useEffect(() => { if (authed && view === "docs" && docList.length === 0) loadDocList().then((d) => d[0] && openDoc(d[0].slug)).catch(() => {}); }, [authed, view, docList.length, loadDocList, openDoc]);

  const login = async () => {
    if (!username.trim() || !password) return notify("Informe usuário e senha", false);
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: username.trim(), password }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha no login");
      setMe(body.user?.username || username.trim()); setRole(body.user?.role || "admin"); setPassword(""); setAuthed(true);
    } catch (e) { notify((e as Error).message, false); } finally { setSigningIn(false); }
  };
  const logout = async () => { await fetch("/api/auth/logout", { method: "POST" }).catch(() => {}); setAuthed(false); setUsername(""); setPassword(""); setMe(""); };

  const createClient = async () => {
    try { await api("/clients", { method: "POST", body: JSON.stringify(form) }); notify("Cliente criado"); setForm({ ...form, slug: "", name: "", base_url: "", token: "", company_id: "", insecure_tls: false }); loadClients(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const toggle = async (id: string, action: "activate" | "deactivate") => { try { await api(`/clients/${id}/${action}`, { method: "POST" }); loadClients(); } catch (e) { notify((e as Error).message, false); } };
  const saveEdit = async (patch: any) => {
    if (!editing) return;
    try { await api(`/clients/${editing.id}`, { method: "PATCH", body: JSON.stringify(patch) }); notify("Configurações salvas"); setEditing(null); loadClients(); }
    catch (e) { notify((e as Error).message, false); }
  };
  const archive = async (id: string, slug: string) => { if (!confirm(`Arquivar "${slug}"? Some das listas e para de sincronizar, mas o histórico é mantido.`)) return; try { await api(`/clients/${id}/archive`, { method: "POST" }); notify("Arquivado"); loadClients(); } catch (e) { notify((e as Error).message, false); } };
  const unarchive = async (id: string) => { try { await api(`/clients/${id}/unarchive`, { method: "POST" }); notify("Desarquivado (inativo)"); loadClients(); } catch (e) { notify((e as Error).message, false); } };
  const syncNow = async (id: string, full = false) => {
    notify(full ? "Full sync enfileirado" : "Sync enfileirado");
    try { await api(`/sync/clients/${id}${full ? "?full=true" : ""}`, { method: "POST" }); setTimeout(loadClients, 1500); setTimeout(loadClients, 5000); } catch (e) { notify((e as Error).message, false); }
  };
  const seeErrors = (id: string) => { setLogClient(id); setView("historico"); };
  const cancelSync = async (id: string) => { try { await api(`/clients/${id}/cancel`, { method: "POST" }); notify("Cancelamento solicitado — para no próximo checkpoint"); setTimeout(loadClients, 1500); setTimeout(loadClients, 5000); } catch (e) { notify((e as Error).message, false); } };
  const cancelAll = async () => { if (!confirm("KILL SWITCH: cancelar TODOS os syncs em andamento e esvaziar a fila?")) return; try { const r = await api("/sync/cancel-all", { method: "POST" }); notify(`Cancelado: ${r.clients_flagged} cliente(s) sinalizados, ${r.jobs_drained} job(s) removidos`); setTimeout(loadClients, 1500); } catch (e) { notify((e as Error).message, false); } };
  const revalidate = async (id: string) => {
    notify("Revalidando token em cada rota…");
    try {
      const r = await api(`/clients/${id}/revalidate`, { method: "POST" });
      const ok = Object.values(r.access).filter((a: any) => a.ok).length;
      notify(`Revalidado: ${ok}/${Object.keys(r.access).length} rotas acessíveis · ${r.blocked.length} bloqueadas`);
      loadClients();
    } catch (e) { notify((e as Error).message, false); }
  };

  const loadData = async () => {
    const qs = new URLSearchParams({ limit: String(dLimit), page: String(dPage) });
    if (dClient) qs.set("client_id", dClient);
    dFilter.split(",").map((s) => s.trim()).filter(Boolean).forEach((f) => qs.append("filter", f));
    try { const r = await api(`/data/${dRes}?${qs}`); const p = r.pagination; setDMeta(`pág ${p.page} · ${p.returned} de ${p.total} · ${p.has_more ? "há mais" : "fim"}`); setDOut(JSON.stringify(r.data, null, 2)); }
    catch (e) { notify((e as Error).message, false); }
  };

  const genToken = async () => {
    if (!newTokName.trim()) return notify("Dê um nome ao token", false);
    if (!newTokClient) return notify("Escolha o cliente do token", false);
    try { const r = await api("/tokens", { method: "POST", body: JSON.stringify({ name: newTokName.trim(), client_id: newTokClient }) }); setRevealed(r.token); setNewTokName(""); loadTokens(); }
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

  const isAdmin = role === "admin";
  const NAV: { v: View; ico: string; label: string }[] = [
    { v: "dashboard", ico: "📊", label: "Dashboard" },
    { v: "clientes", ico: "🏢", label: "Clientes" },
    { v: "dados", ico: "🔎", label: "Explorar dados" },
    { v: "filtros", ico: "🧪", label: "Testar filtros" },
    { v: "query", ico: "📐", label: "Query SQL" },
    { v: "views", ico: "🧩", label: "Views (API)" },
    { v: "tokens", ico: "🔑", label: "Tokens de API" },
    { v: "historico", ico: "🕑", label: "Histórico de sync" },
    ...(isAdmin ? [{ v: "config" as View, ico: "⚙️", label: "Configurações" }, { v: "usuarios" as View, ico: "👤", label: "Usuários" }] : []),
    { v: "docs", ico: "📚", label: "Documentação" },
  ];
  const titles: Record<View, string> = { dashboard: "Dashboard", clientes: "Clientes", dados: "Explorar dados", filtros: "Testar filtros", query: "Query SQL", views: "Views (API)", tokens: "Tokens de API", historico: "Histórico de sincronização", config: "Configurações", usuarios: "Usuários", docs: "Documentação" };
  const subs: Record<View, string> = {
    dashboard: "Visão geral por cliente — status, tokens e rotas acessíveis",
    clientes: "Tenants OPA Suite — criar, editar, sincronizar",
    dados: "Leitura paginada e filtrável dos dados extraídos",
    filtros: "Monte e teste filtros visualmente — veja como funciona",
    query: "Rode SELECTs no banco (somente leitura)",
    views: "Views SQL (normal/materialized) entregues ao cliente via token",
    tokens: "Tokens por cliente para acesso à API",
    historico: "Status e motivos de erro por recurso",
    config: "Agendador — re-sync automático e revalidação de token",
    usuarios: "Gerenciar usuários do painel (admin/gestor)",
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
          {view === "dashboard" && <DashboardView {...{ overview, clients, setView, setEditing, revalidate, syncNow, loadOverview }} />}
          {view === "clientes" && <ClientesView {...{ form, setForm, clients, syncNow, toggle, archive, unarchive, seeErrors, revalidate, cancelSync, cancelAll, loadClients, createClient, editing, setEditing, saveEdit, showArchived, setShowArchived }} />}
          {view === "dados" && <DadosView {...{ resources, clients, dRes, setDRes, dClient, setDClient, dLimit, setDLimit, dPage, setDPage, dFilter, setDFilter, dMeta, dOut, loadData }} />}
          {view === "tokens" && <TokensView {...{ tokens, clients, newTokName, setNewTokName, newTokClient, setNewTokClient, genToken, revealed, setRevealed, revokeToken, toggleToken, loadTokens }} />}
          {view === "filtros" && <FilterTesterView {...{ resources, clients, ftRes, setFtRes, ftClient, setFtClient, ftRows, setFtRows, ftOut, runFilterTest }} />}
          {view === "query" && <QueryView {...{ qSql, setQSql, qResult, qRunning, runQuery }} />}
          {view === "views" && <ViewsView {...{ viewsList, vForm, setVForm, createView, deleteView, refreshViewNow, loadViews }} />}
          {view === "historico" && <HistoricoView {...{ logs, runs, clients, logClient, setLogClient, loadLogs }} />}
          {view === "config" && <ConfigView {...{ settings, saveSettings }} />}
          {view === "usuarios" && <UsersView {...{ users, nu, setNu, createUserFn, delUser, loadUsers }} />}
          {view === "docs" && <DocsView {...{ docList, docSlug, docHtml, docLoading, openDoc }} />}
        </div>
      </div>
      {toast && <Toast {...toast} />}
    </div>
  );
}

/* ── Views ─────────────────────────────────────────────────────────────── */
const RESOURCE_LIST = ["etiquetas","usuarios","departamentos","motivos","canais","templates","clientes","contatos","periodos","atendimentos","mensagens"];

function DashboardView(p: any) {
  const { overview: o, clients, setView, setEditing, revalidate, syncNow, loadOverview } = p;
  if (!o) return <div className="empty card">Carregando estatísticas…</div>;
  const slugOf = (id: string) => clients.find((c: Client) => c.id === id)?.slug || "—";
  const editClient = (id: string) => { const c = clients.find((x: Client) => x.id === id); if (c) { setEditing(c); setView("clientes"); } };
  const maxRec = Math.max(1, ...Object.values(o.records.by_resource as Record<string, number>));
  const q = o.queue || {};
  return (
    <>
      {/* KPIs */}
      <div className="kpi-grid">
        <Stat label="Clientes" value={o.clients.total} />
        <Stat label="Ativos" value={o.clients.active} />
        <Stat label={`Ativos em ${o.month.label}`} value={o.active_clients_this_month} />
        <Stat label="Syncs (total)" value={o.syncs.total} />
        <Stat label={`Syncs em ${o.month.label}`} value={o.syncs.this_month} />
        <Stat label="Registros (total)" value={Number(o.records.total).toLocaleString("pt-BR")} />
        <Stat label="Tempo médio sync" value={fmtDur(o.syncs.avg_ms)} />
        <Stat label="Tokens ativos" value={o.tokens.active} />
        <Stat label="Com erro" value={o.clients.with_errors} />
        <Stat label="Com rota bloqueada" value={o.clients.blocked} />
        <Stat label="Fila (espera+ativos)" value={(q.waiting ?? 0) + (q.active ?? 0)} />
      </div>

      {/* Relatório do mês */}
      <section className="card">
        <div className="card-head"><h2>Relatório de {o.month.label}</h2><span className="sp" /><button className="ghost xs" onClick={() => loadOverview()}>↻ Atualizar</button></div>
        <div className="row">
          <Stat label="Clientes ativos no mês" value={`${o.active_clients_this_month} de ${o.clients.total}`} small />
          <Stat label="Syncs no mês" value={o.syncs.this_month} small />
          <Stat label="Sucesso no mês" value={o.syncs.ok_this_month} small />
          <Stat label="Erros no mês" value={o.syncs.error_this_month} small />
        </div>
        <p className="muted" style={{ marginTop: 10 }}>
          <b>{o.active_clients_this_month}</b> cliente(s) tiveram pelo menos um sync em <b>{o.month.label}</b>.
          Fila agora: {q.waiting ?? 0} esperando · {q.active ?? 0} ativos · {q.completed ?? 0} concluídos · {q.failed ?? 0} falhos.
        </p>
      </section>

      {/* Registros por recurso */}
      <section className="card">
        <div className="card-head"><h2>Registros por recurso</h2><span className="sp" /><span className="muted">{Number(o.records.total).toLocaleString("pt-BR")} no total</span></div>
        {RESOURCE_LIST.map((r) => {
          const n = (o.records.by_resource as any)[r] ?? 0;
          return (
            <div key={r} className="bar-row">
              <span className="bar-label">{r}</span>
              <div className="bar-track"><div className="bar-fill" style={{ width: `${(n / maxRec) * 100}%` }} /></div>
              <span className="bar-val mono">{Number(n).toLocaleString("pt-BR")}</span>
            </div>
          );
        })}
      </section>

      {/* Por cliente */}
      <section className="card">
        <div className="card-head"><h2>Por cliente</h2></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Cliente</th><th>Status</th><th>Syncs</th><th>No mês</th><th>Registros</th><th>Sucesso</th><th>Tempo méd.</th><th>Bloq.</th><th>Tokens</th><th>Último sync</th><th></th></tr></thead>
            <tbody>
              {o.per_client.map((c: any) => (
                <tr key={c.id}>
                  <td><b>{c.slug}</b>{!c.active && <span className="muted"> (inativo)</span>}</td>
                  <td><StatusPill status={c.last_sync_status} /></td>
                  <td>{c.sync_count}</td>
                  <td>{c.syncs_this_month}</td>
                  <td className="mono">{Number(c.total_upserted).toLocaleString("pt-BR")}</td>
                  <td>{c.ok_rate === null ? <span className="muted">—</span> : <span style={{ color: c.ok_rate >= 80 ? "var(--ok)" : c.ok_rate >= 50 ? "var(--warn)" : "var(--danger)" }}>{c.ok_rate}%</span>}</td>
                  <td className="muted">{fmtDur(c.avg_ms)}</td>
                  <td>{c.blocked > 0 ? <span className="pill off">{c.blocked}</span> : "—"}</td>
                  <td>{c.tokens}</td>
                  <td className="muted">{fmt(c.last_synced_at)}</td>
                  <td className="actions">
                    <button className="sec xs" onClick={() => syncNow(c.id)}>Sync</button>
                    <button className="ghost xs" onClick={() => revalidate(c.id)}>Revalidar</button>
                    <button className="ghost xs" onClick={() => editClient(c.id)}>Editar</button>
                    <button className="ghost xs" onClick={() => setView("tokens")}>Tokens</button>
                  </td>
                </tr>
              ))}
              {o.per_client.length === 0 && <tr><td colSpan={10} className="empty">Nenhum cliente.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Runs recentes */}
      <section className="card">
        <div className="card-head"><h2>Syncs recentes</h2></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Quando</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Recursos</th><th>OK / Erro</th><th>Upserted</th></tr></thead>
            <tbody>
              {o.recent_runs.map((r: any) => (
                <tr key={r.id}>
                  <td className="muted">{fmt(r.started_at)}</td>
                  <td>{slugOf(r.client_id)}</td>
                  <td>{r.is_full ? <span className="pill running">full</span> : <span className="muted">incr.</span>}</td>
                  <td><StatusPill status={r.status} /></td>
                  <td>{r.resources_count}</td>
                  <td><span style={{ color: "var(--ok)" }}>{r.ok_count}</span> / <span style={{ color: r.error_count ? "var(--danger)" : "var(--muted)" }}>{r.error_count}</span></td>
                  <td className="mono">{Number(r.total_upserted).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
              {o.recent_runs.length === 0 && <tr><td colSpan={7} className="empty">Nenhum sync ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ClientesView(p: any) {
  const { form, setForm, clients, syncNow, toggle, archive, unarchive, seeErrors, revalidate, cancelSync, cancelAll, loadClients, createClient, editing, setEditing, saveEdit, showArchived, setShowArchived } = p;
  if (editing) return <EditClient client={editing} onCancel={() => setEditing(null)} onSave={saveEdit} />;
  const anyRunning = clients.some((c: Client) => c.last_sync_status === "running" || c.last_sync_status === "queued");
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
        <div className="card-head"><h2>Clientes</h2><span className="sp" />{anyRunning && <button className="danger xs" onClick={cancelAll}>⛔ Parar todos os syncs</button>}<label className="chk" style={{ marginRight: 10 }}><input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setTimeout(loadClients, 0); }} /><span>mostrar arquivados</span></label><button className="ghost xs" onClick={() => loadClients()}>↻ Atualizar</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Slug</th><th>Nome</th><th>Status</th><th>Último sync</th><th>Ações</th></tr></thead>
            <tbody>
              {clients.map((c: Client) => (
                <tr key={c.id} style={c.archived ? { opacity: 0.55 } : undefined}>
                  <td><b>{c.slug}</b>{c.insecure_tls && <span className="muted" title="TLS inseguro"> 🔓</span>}{c.archived && <span className="pill off" style={{ marginLeft: 6 }}>arquivado</span>}</td>
                  <td>{c.name}</td>
                  <td>
                    <StatusPill status={c.last_sync_status} /> {c.last_sync_status === "error" && <button className="ghost xs" onClick={() => seeErrors(c.id)}>ver erro</button>}
                    {c.blocked_resources?.length > 0 && <div style={{ marginTop: 4 }}><span className="pill off" title={c.blocked_resources.join(", ")}>🚫 {c.blocked_resources.length} rota(s) bloqueada(s)</span></div>}
                  </td>
                  <td className="muted">{fmt(c.last_synced_at)}</td>
                  <td className="actions">
                    {c.archived ? (
                      <button className="xs" onClick={() => unarchive(c.id)}>Desarquivar</button>
                    ) : (
                      <>
                        {(c.last_sync_status === "running" || c.last_sync_status === "queued")
                          ? <button className="danger xs" onClick={() => cancelSync(c.id)}>⛔ Cancelar</button>
                          : <button className="sec xs" onClick={() => syncNow(c.id)}>Sync</button>}
                        <button className="sec xs" onClick={() => syncNow(c.id, true)}>Full</button>
                        <button className="ghost xs" onClick={() => revalidate(c.id)}>Revalidar token</button>
                        <button className="ghost xs" onClick={() => setEditing(c)}>Editar</button>
                        {c.active ? <button className="warn xs" onClick={() => toggle(c.id, "deactivate")}>Inativar</button> : <button className="xs" onClick={() => toggle(c.id, "activate")}>Ativar</button>}
                        <button className="danger xs" onClick={() => archive(c.id, c.slug)}>Arquivar</button>
                      </>
                    )}
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
  const { tokens, clients, newTokName, setNewTokName, newTokClient, setNewTokClient, genToken, revealed, setRevealed, revokeToken, toggleToken, loadTokens } = p;
  const slugOf = (cid: string | null) => (cid ? clients.find((c: Client) => c.id === cid)?.slug || "—" : "global");
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Gerar token por cliente</h2></div>
        <p className="card-desc">Cada token é escopo de UM cliente: só lê os dados daquele cliente (Bearer ou Basic auth). O valor aparece uma única vez.</p>
        {revealed && (
          <div className="reveal">
            <b>Token gerado — copie agora (não será mostrado de novo):</b>
            <div className="tok"><code className="mono">{revealed}</code><button className="xs" onClick={() => { navigator.clipboard?.writeText(revealed); }}>Copiar</button><button className="ghost xs" onClick={() => setRevealed("")}>Fechar</button></div>
          </div>
        )}
        <div className="row">
          <Field label="Nome do token" value={newTokName} onChange={setNewTokName} ph="ex: powerbi-financeiro" />
          <div><label>Cliente *</label><select value={newTokClient} onChange={(e) => setNewTokClient(e.target.value)}><option value="">(escolha)</option>{clients.map((c: Client) => <option key={c.id} value={c.id}>{c.slug}</option>)}</select></div>
        </div>
        <div style={{ marginTop: 16 }}><button onClick={genToken}>Gerar token</button></div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Tokens</h2><span className="sp" /><button className="ghost xs" onClick={() => loadTokens()}>↻ Atualizar</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Nome</th><th>Cliente</th><th>Prefixo</th><th>Status</th><th>Criado</th><th>Último uso</th><th>Ações</th></tr></thead>
            <tbody>
              {tokens.map((t: ApiToken) => (
                <tr key={t.id}>
                  <td><b>{t.name}</b></td>
                  <td>{slugOf(t.client_id)}</td>
                  <td className="mono">{t.token_prefix}…</td>
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

function EditClient({ client, onCancel, onSave }: { client: Client; onCancel: () => void; onSave: (patch: any) => void }) {
  const [f, setF] = useState({
    name: client.name, base_url: client.base_url, company_id: client.company_id ?? "",
    lookback_days: client.lookback_days, sync_interval_minutes: client.sync_interval_minutes,
    page_size: client.page_size ?? "", timeout_ms: client.timeout_ms ?? "",
    insecure_tls: client.insecure_tls, token: "",
  });
  const [disabled, setDisabled] = useState<string[]>(client.disabled_resources ?? []);
  const set = (k: string, v: any) => setF({ ...f, [k]: v });
  const toggleRes = (r: string) => setDisabled(disabled.includes(r) ? disabled.filter((x) => x !== r) : [...disabled, r]);
  const submit = () => {
    const patch: any = {
      name: f.name, base_url: f.base_url, company_id: f.company_id || null,
      lookback_days: Number(f.lookback_days), sync_interval_minutes: Number(f.sync_interval_minutes),
      page_size: f.page_size === "" ? null : Number(f.page_size),
      timeout_ms: f.timeout_ms === "" ? null : Number(f.timeout_ms),
      insecure_tls: f.insecure_tls, disabled_resources: disabled,
    };
    if (f.token.trim()) patch.token = f.token.trim();
    onSave(patch);
  };
  return (
    <section className="card">
      <div className="card-head"><h2>Editar — {client.slug}</h2><span className="sp" /><button className="ghost xs" onClick={onCancel}>Cancelar</button></div>
      <div className="row">
        <Field label="Nome" value={f.name} onChange={(v: string) => set("name", v)} />
        <Field label="Base URL" value={f.base_url} onChange={(v: string) => set("base_url", v)} />
        <Field label="company_id" value={f.company_id} onChange={(v: string) => set("company_id", v)} />
        <Field label="Lookback (dias)" type="number" value={String(f.lookback_days)} onChange={(v: string) => set("lookback_days", v)} />
        <Field label="Intervalo sync (min)" type="number" value={String(f.sync_interval_minutes)} onChange={(v: string) => set("sync_interval_minutes", v)} />
        <Field label="Page size (take paginação)" type="number" value={String(f.page_size)} onChange={(v: string) => set("page_size", v)} ph="default (env)" />
        <Field label="Timeout (ms)" type="number" value={String(f.timeout_ms)} onChange={(v: string) => set("timeout_ms", v)} ph="default (env)" />
        <Field label="Trocar token OPA" type="password" value={f.token} onChange={(v: string) => set("token", v)} ph="deixe vazio p/ manter" />
        <div><label>Segurança TLS</label><label className="chk"><input type="checkbox" checked={f.insecure_tls} onChange={(e) => set("insecure_tls", e.target.checked)} /><span>Ignorar certificado</span></label></div>
      </div>
      <div style={{ marginTop: 14 }}>
        <label>Rotas a NÃO sincronizar (desabilitadas)</label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
          {RESOURCE_LIST.map((r) => (
            <label key={r} className="chk" style={{ padding: "4px 8px", border: "1px solid var(--line)", borderRadius: "var(--r2)", background: disabled.includes(r) ? "rgba(244,63,94,.12)" : "transparent" }}>
              <input type="checkbox" checked={disabled.includes(r)} onChange={() => toggleRes(r)} />
              <span>{r}</span>
            </label>
          ))}
        </div>
        <p className="muted" style={{ marginTop: 6 }}>Marcadas não entram na fila de sync deste cliente.</p>
      </div>
      <div style={{ marginTop: 16 }}><button onClick={submit}>Salvar configurações</button></div>
    </section>
  );
}

function HistoricoView(p: any) {
  const { logs, runs, clients, logClient, setLogClient, loadLogs } = p;
  const slugOf = (id: string) => clients.find((c: Client) => c.id === id)?.slug || "—";
  return (
    <>
    <section className="card">
      <div className="card-head">
        <h2>Execuções (status)</h2><span className="sp" />
        <select style={{ width: 200 }} value={logClient} onChange={(e) => setLogClient(e.target.value)}>
          <option value="">(todos os clientes)</option>
          {clients.map((c: Client) => <option key={c.id} value={c.id}>{c.slug}</option>)}
        </select>
        <button className="ghost xs" onClick={() => loadLogs(logClient)}>↻</button>
      </div>
      <div className="tbl-wrap">
        <table>
          <thead><tr><th>Início</th><th>Cliente</th><th>Tipo</th><th>Status</th><th>Recursos</th><th>OK/Erro</th><th>Registros</th><th>Duração</th></tr></thead>
          <tbody>
            {(runs || []).map((r: any) => (
              <tr key={r.id}>
                <td className="muted">{fmt(r.started_at)}</td>
                <td>{slugOf(r.client_id)}</td>
                <td>{r.is_full ? <span className="pill running">full</span> : <span className="muted">incr.</span>}</td>
                <td><StatusPill status={r.status} /></td>
                <td>{r.resources_count}</td>
                <td><span style={{ color: "var(--ok)" }}>{r.ok_count}</span>/<span style={{ color: r.error_count ? "var(--danger)" : "var(--muted)" }}>{r.error_count}</span></td>
                <td className="mono">{Number(r.total_upserted).toLocaleString("pt-BR")}</td>
                <td className="muted">{r.finished_at ? fmtDur((new Date(r.finished_at).getTime() - new Date(r.started_at).getTime())) : "…"}</td>
              </tr>
            ))}
            {(!runs || runs.length === 0) && <tr><td colSpan={8} className="empty">Nenhuma execução.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
    <section className="card">
      <div className="card-head"><h2>Detalhe por recurso</h2></div>
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
    </>
  );
}

const TYPED_COLS: Record<string, string[]> = {
  atendimentos: ["protocolo", "status", "departamento", "canal", "contato_id", "avaliacao", "aberto_em", "encerrado_em"],
  contatos: ["nome", "telefone", "email"], mensagens: ["atendimento_id", "tipo", "conteudo", "enviado_em"],
  clientes: ["nome", "fantasia", "cpf_cnpj", "status"], usuarios: ["nome", "status", "tipo"], canais: ["nome", "status", "canal"],
  etiquetas: ["nome"], departamentos: ["nome"], motivos: ["motivo"], periodos: ["nome", "ativo"], templates: ["atalho", "tipo_mensagem"],
};
const FT_OPS = ["eq", "neq", "like", "ilike", "gt", "gte", "lt", "lte"];

function FilterTesterView(p: any) {
  const { resources, clients, ftRes, setFtRes, ftClient, setFtClient, ftRows, setFtRows, ftOut, runFilterTest } = p;
  const cols = TYPED_COLS[ftRes] || [];
  const setRow = (i: number, k: string, v: string) => setFtRows(ftRows.map((r: any, j: number) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Testar filtros</h2></div>
        <p className="card-desc">Monte filtros e veja a URL gerada + os resultados. Campo pode ser uma <b>coluna tipada</b>, um <b>campo do JSON</b> (ex: <code>prioridade</code>) ou <b>aninhado</b> (ex: <code>contato.nome</code>).</p>
        <div className="row">
          <div><label>Recurso</label><select value={ftRes} onChange={(e) => setFtRes(e.target.value)}>{resources.map((r: ResourceMeta) => <option key={r.key} value={r.key}>{r.key}</option>)}</select></div>
          <div><label>Cliente</label><select value={ftClient} onChange={(e) => setFtClient(e.target.value)}><option value="">(todos)</option>{clients.map((c: Client) => <option key={c.id} value={c.id}>{c.slug}</option>)}</select></div>
        </div>
        <div className="muted" style={{ margin: "12px 0 6px" }}>Colunas tipadas de <b>{ftRes}</b>: {cols.length ? cols.map((c) => <code key={c} style={{ marginRight: 6 }}>{c}</code>) : "—"} <span style={{ marginLeft: 6 }}>+ <code>external_id</code>, <code>synced_at</code>, qualquer campo do <code>raw</code></span></div>

        {ftRows.map((r: any, i: number) => (
          <div key={i} className="row" style={{ marginBottom: 8, gridTemplateColumns: "1fr 130px 1fr 40px" }}>
            <select value={r.field} onChange={(e) => setRow(i, "field", e.target.value)}>
              <option value="">(campo)</option>
              {[...cols, "external_id", "synced_at"].map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <select value={r.op} onChange={(e) => setRow(i, "op", e.target.value)}>{FT_OPS.map((o) => <option key={o} value={o}>{o}</option>)}</select>
            <input placeholder="valor" value={r.value} onChange={(e) => setRow(i, "value", e.target.value)} />
            <button className="ghost xs" onClick={() => setFtRows(ftRows.filter((_: any, j: number) => j !== i))}>✕</button>
          </div>
        ))}
        <div className="actions" style={{ marginTop: 6 }}>
          <button className="ghost xs" onClick={() => setFtRows([...ftRows, { field: "", op: "eq", value: "" }])}>+ filtro</button>
          <button className="sec" onClick={runFilterTest}>Testar</button>
        </div>
      </section>

      {ftOut && (
        <section className="card">
          <div className="card-head"><h2>Resultado</h2></div>
          <div className="muted" style={{ marginBottom: 8 }}>URL:</div>
          <pre style={{ maxHeight: 80 }}>{ftOut.url}</pre>
          {ftOut.error ? <p style={{ color: "var(--danger)" }}>{ftOut.error}</p> : (
            <>
              <p className="muted">{ftOut.returned} de {ftOut.total} registro(s)</p>
              <pre>{JSON.stringify(ftOut.data, null, 2)}</pre>
            </>
          )}
        </section>
      )}
    </>
  );
}

const QUERY_PRESETS: { label: string; sql: string }[] = [
  { label: "Clientes & status", sql: "select slug, name, active, archived, last_sync_status, last_synced_at\nfrom opa_clients order by created_at" },
  { label: "Atendimentos por status", sql: "select status, count(*) as total\nfrom opa_atendimentos group by status order by total desc" },
  { label: "Registros por cliente", sql: "select c.slug, count(*) as atendimentos\nfrom opa_atendimentos a join opa_clients c on c.id = a.client_id\ngroup by c.slug order by atendimentos desc" },
  { label: "Syncs recentes", sql: "select client_id, status, is_full, total_upserted, started_at, finished_at\nfrom sync_runs order by started_at desc limit 20" },
  { label: "Erros de sync recentes", sql: "select client_id, resource, error, started_at\nfrom opa_sync_logs where status = 'error' order by started_at desc limit 20" },
  { label: "Top departamentos", sql: "select departamento, count(*) as total\nfrom opa_atendimentos\nwhere departamento is not null\ngroup by departamento order by total desc limit 10" },
  { label: "Tempo médio de sync por cliente", sql: "select c.slug, round(avg(extract(epoch from (r.finished_at - r.started_at)) * 1000)) as ms\nfrom sync_runs r join opa_clients c on c.id = r.client_id\nwhere r.finished_at is not null group by c.slug order by ms desc" },
];

function ViewsView(p: any) {
  const { viewsList, vForm, setVForm, createView, deleteView, refreshViewNow, loadViews } = p;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inp = { width: "100%", padding: 8, background: "var(--bg)", color: "var(--txt)", border: "1px solid var(--line)", borderRadius: "var(--r2)" } as any;
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Nova view</h2></div>
        <p className="card-desc">Defina uma <b>SELECT</b> sobre as tabelas extraídas. A SQL <b>precisa expor <code>client_id</code></b> — a entrega é escopada pelo token do cliente em <code>GET /api/views/&lt;slug&gt;</code>. Marque <b>materialized</b> p/ pré-computar (atualizada por cron no intervalo).</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
          <label className="fld"><span>slug (URL)</span><input style={inp} value={vForm.slug} onChange={(e) => setVForm({ ...vForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") })} placeholder="atendimentos_resumo" /></label>
          <label className="fld"><span>Nome</span><input style={inp} value={vForm.name} onChange={(e) => setVForm({ ...vForm, name: e.target.value })} placeholder="Resumo de atendimentos" /></label>
        </div>
        <label className="fld"><span>SQL (SELECT … com client_id)</span>
          <textarea value={vForm.sql} onChange={(e) => setVForm({ ...vForm, sql: e.target.value })} rows={6}
            style={{ ...inp, fontFamily: "var(--f-mono)", fontSize: 13 }} />
        </label>
        <div style={{ display: "flex", gap: 16, alignItems: "center", margin: "10px 0" }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={vForm.materialized} onChange={(e) => setVForm({ ...vForm, materialized: e.target.checked })} /> materialized
          </label>
          {vForm.materialized && (
            <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
              refresh a cada <input type="number" min={1} value={vForm.refresh_interval_minutes} onChange={(e) => setVForm({ ...vForm, refresh_interval_minutes: Number(e.target.value) })} style={{ ...inp, width: 80 }} /> min
            </label>
          )}
          <span className="sp" />
          <button onClick={createView}>Criar / Salvar</button>
        </div>
      </section>

      <section className="card">
        <div className="card-head"><h2>Views</h2><span className="sp" /><button className="ghost xs" onClick={loadViews}>↻ Atualizar</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Slug</th><th>Tipo</th><th>Endpoint do cliente</th><th>Refresh</th><th>Último</th><th></th></tr></thead>
            <tbody>
              {viewsList.map((v: any) => (
                <tr key={v.slug}>
                  <td><b>{v.slug}</b><br /><span className="muted">{v.name}</span></td>
                  <td>{v.materialized ? <span className="badge">materialized</span> : "view"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{origin}/api/views/{v.slug}</td>
                  <td>{v.materialized ? `${v.refresh_interval_minutes}min` : "—"}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {v.last_error ? <span style={{ color: "var(--err, #e66)" }}>erro: {String(v.last_error).slice(0, 40)}</span>
                      : v.last_refreshed_at ? new Date(v.last_refreshed_at).toLocaleString() : "—"}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {v.materialized && <button className="ghost xs" onClick={() => refreshViewNow(v.slug)}>↻ refresh</button>}{" "}
                    <button className="ghost xs" onClick={() => { if (confirm(`Remover view ${v.slug}?`)) deleteView(v.slug); }}>🗑</button>
                  </td>
                </tr>
              ))}
              {viewsList.length === 0 && <tr><td colSpan={6} className="empty">Nenhuma view ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function QueryView(p: any) {
  const { qSql, setQSql, qResult, qRunning, runQuery } = p;
  return (
    <>
      <section className="card">
        <div className="card-head"><h2>Query SQL (somente leitura)</h2></div>
        <p className="card-desc">Rode <b>SELECT/WITH</b> no banco. Transação read-only + timeout — escrita/DDL é bloqueada. Tabelas: <code>opa_clients</code>, <code>opa_atendimentos</code>, <code>opa_contatos</code>, <code>opa_mensagens</code>, <code>sync_runs</code>, <code>opa_sync_logs</code>…</p>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {QUERY_PRESETS.map((q) => <button key={q.label} className="ghost xs" onClick={() => setQSql(q.sql)}>{q.label}</button>)}
        </div>
        <textarea value={qSql} onChange={(e) => setQSql(e.target.value)} rows={5}
          style={{ width: "100%", fontFamily: "var(--f-mono)", fontSize: 13, padding: 12, background: "var(--bg)", color: "var(--txt)", border: "1px solid var(--line)", borderRadius: "var(--r2)" }} />
        <div style={{ marginTop: 12 }}><button onClick={runQuery} disabled={qRunning}>{qRunning ? "Rodando…" : "Rodar query"}</button></div>
      </section>
      {qResult && (
        <section className="card">
          <div className="card-head"><h2>Resultado</h2><span className="sp" /><span className="muted">{qResult.rowCount} linha(s) · {qResult.ms}ms</span></div>
          <div className="tbl-wrap">
            <table>
              <thead><tr>{qResult.columns.map((c: string) => <th key={c}>{c}</th>)}</tr></thead>
              <tbody>
                {qResult.rows.map((r: any, i: number) => (
                  <tr key={i}>{qResult.columns.map((c: string) => <td key={c} className="mono" style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}</td>)}</tr>
                ))}
                {qResult.rows.length === 0 && <tr><td colSpan={qResult.columns.length} className="empty">0 linhas.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}

function UsersView(p: any) {
  const { users, nu, setNu, createUserFn, delUser, loadUsers } = p;
  return (
    <>
      <section className="card" style={{ maxWidth: 620 }}>
        <div className="card-head"><h2>Novo usuário</h2></div>
        <p className="card-desc"><b>admin</b>: tudo. <b>gestor</b>: tudo exceto config dos syncs e gestão de usuários.</p>
        <div className="row">
          <Field label="Usuário" value={nu.username} onChange={(v: string) => setNu({ ...nu, username: v })} />
          <Field label="Senha (≥6)" type="password" value={nu.password} onChange={(v: string) => setNu({ ...nu, password: v })} />
          <div><label>Papel</label><select value={nu.role} onChange={(e) => setNu({ ...nu, role: e.target.value })}><option value="gestor">gestor</option><option value="admin">admin</option></select></div>
        </div>
        <div style={{ marginTop: 16 }}><button onClick={createUserFn}>Criar usuário</button></div>
      </section>
      <section className="card">
        <div className="card-head"><h2>Usuários</h2><span className="sp" /><button className="ghost xs" onClick={() => loadUsers()}>↻</button></div>
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Usuário</th><th>Papel</th><th>Criado</th><th>Último login</th><th></th></tr></thead>
            <tbody>
              {users.map((u: any) => (
                <tr key={u.id}>
                  <td><b>{u.username}</b></td>
                  <td><span className={`pill ${u.role === "admin" ? "running" : "on"}`}><span className="dot" />{u.role}</span></td>
                  <td className="muted">{fmt(u.created_at)}</td>
                  <td className="muted">{fmt(u.last_login_at)}</td>
                  <td className="actions"><button className="danger xs" onClick={() => delUser(u.id)}>Excluir</button></td>
                </tr>
              ))}
              {users.length === 0 && <tr><td colSpan={5} className="empty">Nenhum usuário.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function ConfigView(p: any) {
  const { settings: s, saveSettings } = p;
  if (!s) return <div className="empty card">Carregando…</div>;
  return (
    <section className="card" style={{ maxWidth: 620 }}>
      <div className="card-head"><h2>Agendador interno</h2></div>
      <p className="card-desc">O worker roda um tick periódico. Aqui você liga/desliga e ajusta o comportamento — vale na hora.</p>

      <label className="chk" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={!!s.auto_resync_enabled} onChange={(e) => saveSettings({ auto_resync_enabled: e.target.checked })} />
        <span><b>Re-sync automático</b> — re-enfileira clientes ativos quando o sync programado (intervalo por cliente) vence.</span>
      </label>

      <label className="chk" style={{ marginBottom: 14 }}>
        <input type="checkbox" checked={!!s.auto_revalidate_enabled} onChange={(e) => saveSettings({ auto_revalidate_enabled: e.target.checked })} />
        <span><b>Revalidação automática de token</b> — testa cada rota e (des)bloqueia conforme o acesso do token.</span>
      </label>

      <div style={{ maxWidth: 240 }}>
        <label>Revalidar a cada (horas)</label>
        <input type="number" min={1} defaultValue={s.revalidate_hours}
          onBlur={(e) => saveSettings({ revalidate_hours: Number(e.target.value) })} />
        <p className="muted" style={{ marginTop: 6 }}>Intervalo mínimo entre revalidações de um cliente.</p>
      </div>

      <div className="card-head" style={{ marginTop: 22 }}><h2>Cache de dados finais</h2></div>
      <p className="card-desc">Registros que não mudam mais ficam em cache por muito mais tempo: sem atualização há X dias <b>ou</b> (atendimentos) com início e fim preenchidos.</p>
      <div className="row" style={{ maxWidth: 520 }}>
        <div>
          <label>Considerar final após (dias sem atualizar)</label>
          <input type="number" min={1} defaultValue={s.cache_final_days} onBlur={(e) => saveSettings({ cache_final_days: Number(e.target.value) })} />
        </div>
        <div>
          <label>TTL do cache final (horas)</label>
          <input type="number" min={1} defaultValue={s.cache_final_ttl_hours} onBlur={(e) => saveSettings({ cache_final_ttl_hours: Number(e.target.value) })} />
        </div>
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
function Stat({ label, value, small }: { label: string; value: any; small?: boolean }) {
  return (
    <div className="card" style={{ margin: 0, padding: "14px 16px" }}>
      <div className="muted" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".04em" }}>{label}</div>
      <div style={{ fontSize: small ? 14 : 24, fontWeight: 650, marginTop: 4 }}>{value}</div>
    </div>
  );
}
function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="muted">—</span>;
  const cls = status === "ok" ? "ok" : status === "error" || status === "interrupted" ? "error" : status === "cancelled" ? "off" : "running";
  return <span className={`pill ${cls}`}><span className="dot" />{status}</span>;
}
function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return <div className="toast" style={{ borderLeftColor: ok ? "var(--acc)" : "var(--danger)" }}>{msg}</div>;
}
