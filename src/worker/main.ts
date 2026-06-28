// Worker dedicado (container separado). Consome a fila BullMQ e roda a extração.
// Rodado por: node_modules/.bin/tsx src/worker/main.ts
import { Worker, type Job } from "bullmq";
import { SYNC_QUEUE, connectionOpts, scheduleTick, type SyncJobData } from "../lib/queue";
import { syncClient } from "../lib/extractor";
import { runScheduler } from "../lib/scheduler";
import { config } from "../lib/config";

const concurrency = Number(process.env.WORKER_CONCURRENCY || 8);

const worker = new Worker<SyncJobData>(
  SYNC_QUEUE,
  async (job: Job<SyncJobData>) => {
    // Tick do agendador interno.
    if (job.name === "tick") {
      const r = await runScheduler();
      if (r.enqueued.length || r.revalidated.length)
        console.log(`[scheduler] enfileirados=[${r.enqueued.join(",")}] revalidados=[${r.revalidated.join(",")}]`);
      return r;
    }
    const { clientId, resources, full } = job.data;
    console.log(`[worker] sync start client=${clientId} full=${!!full} resources=${resources?.join(",") || "all"}`);
    const result = await syncClient(clientId, resources, undefined, full);
    console.log(`[worker] sync done client=${clientId} upserted=${result.total_upserted} status=${result.status}`);
    return result;
  },
  { connection: connectionOpts(), concurrency },
);

// Agenda o tick repetível (re-sync automático + revalidação dos ativos).
if (config.schedulerEnabled()) {
  scheduleTick(config.schedulerIntervalSec())
    .then(() => console.log(`[scheduler] tick a cada ${config.schedulerIntervalSec()}s (revalida a cada ${config.revalidateHours()}h)`))
    .catch((e) => console.error("[scheduler] falha ao agendar:", e?.message));
}

worker.on("completed", (job) => console.log(`[worker] job ${job.id} completed`));
worker.on("failed", (job, err) => console.error(`[worker] job ${job?.id} failed: ${err?.message}`));
worker.on("error", (err) => console.error(`[worker] error: ${err?.message}`));

console.log(`[worker] up — queue=${SYNC_QUEUE} concurrency=${concurrency}`);

async function shutdown() {
  console.log("[worker] shutting down…");
  await worker.close();
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
