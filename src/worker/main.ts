// Worker dedicado (container separado). Consome a fila BullMQ e roda a extração.
// Rodado por: node_modules/.bin/tsx src/worker/main.ts
import { Worker, type Job } from "bullmq";
import { SYNC_QUEUE, connectionOpts, scheduleTick, type SyncJobData } from "../lib/queue";
import { syncClient } from "../lib/extractor";
import { runScheduler } from "../lib/scheduler";
import { config } from "../lib/config";
import * as repo from "../lib/repo";

// Em container (stdout = pipe, não-TTY) o Node BUFFERIZA os logs → parecem
// sumir. setBlocking força escrita síncrona = logs aparecem na hora.
for (const s of [process.stdout, process.stderr] as any[]) {
  if (s?._handle?.setBlocking) s._handle.setBlocking(true);
}
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);

const concurrency = Number(process.env.WORKER_CONCURRENCY || 8);

const worker = new Worker<SyncJobData>(
  SYNC_QUEUE,
  async (job: Job<SyncJobData>) => {
    // Tick do agendador interno (sem log de ruído).
    if (job.name === "tick") {
      const r = await runScheduler();
      if (r.enqueued.length || r.revalidated.length)
        log(`[scheduler] enfileirados=[${r.enqueued.join(",")}] revalidados=[${r.revalidated.join(",")}]`);
      return r;
    }
    const { clientId, resources, full } = job.data;
    const t0 = Date.now();
    const result = await syncClient(clientId, resources, undefined, full);
    // Log de execução = status simples: extraídos + erros + motivo.
    const errs = result.resources.filter((r) => r.status === "error");
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    log(`[${result.client_slug}] ${full ? "full" : "inc"} (${secs}s) — Dados extraídos: ${result.total_upserted} registros`);
    if (errs.length) {
      log(`[${result.client_slug}] Error: ${errs.length} erro(s)`);
      for (const e of errs) log(`  ${e.resource}: ${e.error}`);
    }
    return result;
  },
  { connection: connectionOpts(), concurrency },
);

// Agenda o tick repetível (re-sync automático + revalidação dos ativos).
if (config.schedulerEnabled()) {
  scheduleTick(config.schedulerIntervalSec())
    .then(() => log(`[scheduler] tick a cada ${config.schedulerIntervalSec()}s (revalida a cada ${config.revalidateHours()}h)`))
    .catch((e) => log(`[scheduler] falha ao agendar: ${e?.message}`));
}

// Loga só falhas de SYNC (o tick repetível não polui o log).
worker.on("failed", (job, err) => { if (job?.name !== "tick") log(`✖ job ${job?.id} FAILED: ${err?.message}`); });
worker.on("error", (err) => log(`worker error: ${err?.message}`));

log(`[worker] up — queue=${SYNC_QUEUE} concurrency=${concurrency}`);

// Na subida, nada está realmente rodando: marca execuções/clientes presos em
// "running" como "interrupted" (worker reiniciou no meio).
repo.reconcileStuck(0).then(() => log("[worker] reconcile: presos em running → interrupted")).catch((e) => log(`[worker] reconcile falhou: ${e?.message}`));

async function shutdown() {
  log("[worker] shutting down…");
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
