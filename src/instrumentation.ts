// Roda 1x quando o servidor Next sobe (processo do APP). Mantém o cache do
// dashboard SEMPRE quente: reconstrói "stats:overview" em background a cada
// STATS_REFRESH_SEC (< TTL de 30s) — assim o painel nunca espera o rebuild.
export async function register() {
  // Só no runtime Node (não no edge, não no build).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Evita múltiplos timers em HMR/duplo-import.
  const g = globalThis as any;
  if (g.__statsRefresher) return;
  g.__statsRefresher = true;

  const { buildOverview } = await import("./lib/stats");
  const sec = Math.max(Number(process.env.STATS_REFRESH_SEC ?? 25), 5);

  const tick = async () => {
    try { await buildOverview(true); } catch { /* silencioso: não derruba o server */ }
  };
  // Aquece já na subida + agenda o refresh contínuo.
  void tick();
  setInterval(tick, sec * 1000).unref?.();
}
