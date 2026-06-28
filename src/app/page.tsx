"use client";

import { useCallback, useEffect, useState } from "react";

type Client = {
  id: string;
  slug: string;
  name: string;
  base_url: string;
  active: boolean;
  last_sync_status: string | null;
  last_synced_at: string | null;
};

type ResourceMeta = { key: string; filters: string[] };

export default function AdminPage() {
  const [authed, setAuthed] = useState(false);
  const [booting, setBooting] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [me, setMe] = useState<string>("");
  const [tab, setTab] = useState<"painel" | "docs">("painel");
  const [clients, setClients] = useState<Client[]>([]);
  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

  // documentação
  const [docList, setDocList] = useState<{ slug: string; title: string }[]>([]);
  const [docSlug, setDocSlug] = useState("");
  const [docHtml, setDocHtml] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docLoading, setDocLoading] = useState(false);

  // form novo cliente
  const [form, setForm] = useState({
    slug: "", name: "", base_url: "", token: "", company_id: "", lookback_days: 30, sync_interval_minutes: 30,
  });

  // explorar dados
  const [dRes, setDRes] = useState("atendimentos");
  const [dClient, setDClient] = useState("");
  const [dLimit, setDLimit] = useState(20);
  const [dPage, setDPage] = useState(1);
  const [dMeta, setDMeta] = useState("");
  const [dOut, setDOut] = useState("");

  const notify = (msg: string, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 4000);
  };

  // Chamadas à API usam o cookie de sessão (same-origin) — sem Authorization.
  const api = useCallback(async (path: string, opts: RequestInit = {}) => {
    const res = await fetch(`/api${path}`, {
      ...opts,
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
    });
    if (res.status === 401) {
      setAuthed(false);
      throw new Error("Sessão expirada. Faça login novamente.");
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    return body;
  }, []);

  const loadClients = useCallback(async () => {
    setClients(await api("/clients"));
  }, [api]);

  const loadResources = useCallback(async () => {
    const r = await api("/sync/resources");
    setResources(r.resources);
  }, [api]);

  const loadDocList = useCallback(async () => {
    const r = await api("/docs");
    setDocList(r.docs);
    return r.docs as { slug: string; title: string }[];
  }, [api]);

  const openDoc = useCallback(
    async (slug: string) => {
      setDocLoading(true);
      setDocSlug(slug);
      try {
        const r = await api(`/docs/${slug}`);
        setDocTitle(r.title);
        setDocHtml(r.html);
      } catch (e) {
        setDocHtml(`<p>Erro ao carregar: ${(e as Error).message}</p>`);
      } finally {
        setDocLoading(false);
      }
    },
    [api],
  );

  // Bootstrap: já tem sessão válida (cookie)?
  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.authenticated) {
          setAuthed(true);
          setMe(d.username || "API");
        }
      })
      .finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    if (authed) {
      loadClients().catch((e) => notify(e.message, false));
      loadResources().catch(() => {});
    }
  }, [authed, loadClients, loadResources]);

  // Ao abrir a aba Documentação: carrega a lista e abre o 1º doc.
  useEffect(() => {
    if (authed && tab === "docs" && docList.length === 0) {
      loadDocList()
        .then((docs) => docs[0] && openDoc(docs[0].slug))
        .catch((e) => notify(e.message, false));
    }
  }, [authed, tab, docList.length, loadDocList, openDoc]);

  const login = async () => {
    if (!username.trim() || !password) return notify("Informe usuário e senha", false);
    setSigningIn(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Falha no login");
      setMe(body.user?.username || username.trim());
      setPassword("");
      setAuthed(true);
    } catch (e) {
      notify((e as Error).message, false);
    } finally {
      setSigningIn(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    setAuthed(false);
    setUsername("");
    setPassword("");
    setMe("");
  };

  const createClient = async () => {
    try {
      await api("/clients", { method: "POST", body: JSON.stringify(form) });
      notify("Cliente criado");
      setForm({ ...form, slug: "", name: "", base_url: "", token: "", company_id: "" });
      loadClients();
    } catch (e) {
      notify((e as Error).message, false);
    }
  };

  const toggle = async (id: string, action: "activate" | "deactivate") => {
    try {
      await api(`/clients/${id}/${action}`, { method: "POST" });
      loadClients();
    } catch (e) {
      notify((e as Error).message, false);
    }
  };

  const del = async (id: string, slug: string) => {
    if (!confirm(`Excluir "${slug}" e TODOS os dados? Irreversível.`)) return;
    try {
      await api(`/clients/${id}`, { method: "DELETE" });
      notify("Removido");
      loadClients();
    } catch (e) {
      notify((e as Error).message, false);
    }
  };

  const syncNow = async (id: string) => {
    notify("Sincronizando em background...");
    try {
      await api(`/sync/clients/${id}?wait=false`, { method: "POST" });
      setTimeout(loadClients, 2000);
    } catch (e) {
      notify((e as Error).message, false);
    }
  };

  const loadData = async () => {
    const qs = new URLSearchParams({ limit: String(dLimit), page: String(dPage) });
    if (dClient) qs.set("client_id", dClient);
    try {
      const r = await api(`/data/${dRes}?${qs}`);
      const p = r.pagination;
      setDMeta(`página ${p.page} · ${p.returned} de ${p.total} · ${p.has_more ? "há mais" : "fim"}`);
      setDOut(JSON.stringify(r.data, null, 2));
    } catch (e) {
      notify((e as Error).message, false);
    }
  };

  if (booting) {
    return <div className="login-wrap"><div className="muted">Carregando…</div></div>;
  }

  if (!authed) {
    return (
      <div className="login-wrap">
        <form
          className="login-card"
          onSubmit={(e) => {
            e.preventDefault();
            login();
          }}
        >
          <div className="login-brand">
            <span className="login-logo">🟢</span>
            <div>
              <h1>OPA Dashboard</h1>
              <p className="muted">Painel gerencial — WhatsApp / OPA Suite</p>
            </div>
          </div>

          <label htmlFor="u">Usuário</label>
          <input
            id="u"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="seu usuário"
          />

          <label htmlFor="p">Senha</label>
          <input
            id="p"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />

          <button className="login-btn" type="submit" disabled={signingIn}>
            {signingIn ? "Entrando…" : "Entrar"}
          </button>

          <p className="muted login-foot">
            Acesso via API é por token (Bearer). Este painel usa login e senha.
          </p>
        </form>
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  return (
    <>
      <header>
        <h1>🟢 OPA API WhatsApp — Admin</h1>
        <nav className="tabs">
          <button className={tab === "painel" ? "tab on" : "tab"} onClick={() => setTab("painel")}>Painel</button>
          <button className={tab === "docs" ? "tab on" : "tab"} onClick={() => setTab("docs")}>Documentação</button>
        </nav>
        <span className="spacer" />
        <span className="muted">{me ? `olá, ${me}` : "autenticado"}</span>
        <button className="ghost" onClick={logout}>Sair</button>
      </header>

      {tab === "docs" ? (
        <main>
          <section className="card docs-layout">
            <aside className="docs-nav">
              <h2>Documentação</h2>
              {docList.map((d) => (
                <button
                  key={d.slug}
                  className={d.slug === docSlug ? "doc-link on" : "doc-link"}
                  onClick={() => openDoc(d.slug)}
                >
                  {d.title}
                </button>
              ))}
            </aside>
            <article className="docs-body">
              {docLoading ? (
                <p className="muted">Carregando…</p>
              ) : (
                <>
                  {docTitle && <div className="docs-title muted">{docTitle}</div>}
                  <div className="markdown" dangerouslySetInnerHTML={{ __html: docHtml }} />
                </>
              )}
            </article>
          </section>
        </main>
      ) : (
      <main>
        {/* NOVO CLIENTE */}
        <section className="card">
          <h2>Novo cliente (tenant OPA)</h2>
          <div className="row">
            <Field label="Slug *" value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} ph="empresa-x" />
            <Field label="Nome *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} ph="Empresa X" />
            <Field label="Base URL *" value={form.base_url} onChange={(v) => setForm({ ...form, base_url: v })} ph="https://empresa.opasuite.net.br" />
            <Field label="Token OPA *" type="password" value={form.token} onChange={(v) => setForm({ ...form, token: v })} ph="JWT da OPA" />
            <Field label="company_id" value={form.company_id} onChange={(v) => setForm({ ...form, company_id: v })} ph="opcional" />
            <Field label="Lookback (dias)" type="number" value={String(form.lookback_days)} onChange={(v) => setForm({ ...form, lookback_days: Number(v) })} />
            <Field label="Intervalo sync (min)" type="number" value={String(form.sync_interval_minutes)} onChange={(v) => setForm({ ...form, sync_interval_minutes: Number(v) })} />
          </div>
          <div style={{ marginTop: 12 }}>
            <button onClick={createClient}>Criar cliente</button>
          </div>
        </section>

        {/* CLIENTES */}
        <section className="card">
          <h2>
            Clientes
            <button className="ghost" style={{ float: "right" }} onClick={() => loadClients()}>↻ Atualizar</button>
          </h2>
          <table>
            <thead>
              <tr><th>Slug</th><th>Nome</th><th>Status</th><th>Último sync</th><th>Ações</th></tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id}>
                  <td>{c.slug}</td>
                  <td>{c.name}</td>
                  <td>
                    <span className={`pill ${c.active ? "on" : "off"}`}>{c.active ? "ativo" : "inativo"}</span>
                    {c.last_sync_status && <span className="muted"> · {c.last_sync_status}</span>}
                  </td>
                  <td className="muted">{c.last_synced_at ? new Date(c.last_synced_at).toLocaleString("pt-BR") : "—"}</td>
                  <td className="actions">
                    <button className="sec" onClick={() => syncNow(c.id)}>Sync</button>
                    {c.active ? (
                      <button className="warn" onClick={() => toggle(c.id, "deactivate")}>Inativar</button>
                    ) : (
                      <button onClick={() => toggle(c.id, "activate")}>Ativar</button>
                    )}
                    <button className="danger" onClick={() => del(c.id, c.slug)}>Excluir</button>
                  </td>
                </tr>
              ))}
              {clients.length === 0 && (
                <tr><td colSpan={5} className="muted">Nenhum cliente ainda.</td></tr>
              )}
            </tbody>
          </table>
        </section>

        {/* DADOS */}
        <section className="card">
          <h2>Explorar dados (paginado)</h2>
          <div className="row">
            <div>
              <label>Recurso</label>
              <select value={dRes} onChange={(e) => setDRes(e.target.value)}>
                {resources.map((r) => <option key={r.key} value={r.key}>{r.key}</option>)}
              </select>
            </div>
            <div>
              <label>Cliente</label>
              <select value={dClient} onChange={(e) => setDClient(e.target.value)}>
                <option value="">(todos)</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.slug}</option>)}
              </select>
            </div>
            <Field label="Limite" type="number" value={String(dLimit)} onChange={(v) => setDLimit(Number(v))} />
            <Field label="Página" type="number" value={String(dPage)} onChange={(v) => setDPage(Number(v))} />
          </div>
          <div style={{ marginTop: 12 }} className="actions">
            <button className="sec" onClick={loadData}>Consultar</button>
            <span className="muted">{dMeta}</span>
          </div>
          {dOut && <pre>{dOut}</pre>}
        </section>
      </main>
      )}
      {toast && <Toast {...toast} />}
    </>
  );
}

function Field(props: {
  label: string; value: string; onChange: (v: string) => void; ph?: string; type?: string;
}) {
  return (
    <div>
      <label>{props.label}</label>
      <input
        type={props.type || "text"}
        value={props.value}
        placeholder={props.ph}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

function Toast({ msg, ok }: { msg: string; ok: boolean }) {
  return <div className="toast" style={{ borderColor: ok ? "#16a34a" : "#ef4444" }}>{msg}</div>;
}
