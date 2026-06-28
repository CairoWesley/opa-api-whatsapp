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
  const [token, setToken] = useState<string>("");
  const [authed, setAuthed] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [resources, setResources] = useState<ResourceMeta[]>([]);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);

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

  const api = useCallback(
    async (path: string, opts: RequestInit = {}, tk?: string) => {
      const res = await fetch(`/api${path}`, {
        ...opts,
        headers: {
          Authorization: `Bearer ${tk ?? token}`,
          "Content-Type": "application/json",
          ...(opts.headers || {}),
        },
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
      return body;
    },
    [token],
  );

  const loadClients = useCallback(async () => {
    setClients(await api("/clients"));
  }, [api]);

  const loadResources = useCallback(async () => {
    const r = await api("/sync/resources");
    setResources(r.resources);
  }, [api]);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? sessionStorage.getItem("opa_token") : null;
    if (saved) {
      setToken(saved);
      setAuthed(true);
    }
  }, []);

  useEffect(() => {
    if (authed) {
      loadClients().catch((e) => notify(e.message, false));
      loadResources().catch(() => {});
    }
  }, [authed, loadClients, loadResources]);

  const login = async () => {
    const tk = token.trim();
    if (!tk) return notify("Informe o token", false);
    try {
      await api("/clients", {}, tk);
      sessionStorage.setItem("opa_token", tk);
      setAuthed(true);
    } catch {
      notify("Token inválido", false);
    }
  };

  const logout = () => {
    sessionStorage.removeItem("opa_token");
    setAuthed(false);
    setToken("");
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

  if (!authed) {
    return (
      <>
        <header><h1>🟢 OPA API WhatsApp — Admin</h1></header>
        <main>
          <section className="card" style={{ maxWidth: 460 }}>
            <h2>Acesso</h2>
            <label>Token de admin (APP_ADMIN_TOKEN)</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              placeholder="cole o token..."
            />
            <div style={{ marginTop: 12 }}>
              <button onClick={login}>Entrar</button>
            </div>
            <p className="muted">O token fica só no seu navegador (sessionStorage).</p>
          </section>
        </main>
        {toast && <Toast {...toast} />}
      </>
    );
  }

  return (
    <>
      <header>
        <h1>🟢 OPA API WhatsApp — Admin</h1>
        <span className="spacer" />
        <span className="muted">autenticado</span>
        <button className="ghost" onClick={logout}>Sair</button>
      </header>
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
