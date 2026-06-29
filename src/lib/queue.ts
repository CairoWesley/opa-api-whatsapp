// Fila de sincronização (BullMQ + Redis). A API ENFILEIRA jobs; o container
// `worker` os processa. Decouple total: extrações longas não dependem da request.
import { Queue, type JobsOptions, type ConnectionOptions } from "bullmq";

export const SYNC_QUEUE = "opa-sync";
export type SyncJobData = { clientId: string; resources?: string[]; full?: boolean };

// BullMQ cria/gerencia a conexão a partir destas opções (host/port).
export function connectionOpts(): ConnectionOptions {
  const url = new URL(process.env.REDIS_URL || "redis://localhost:6379");
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    tls: url.protocol === "rediss:" ? {} : undefined,
    maxRetriesPerRequest: null,
  };
}

let _queue: Queue<SyncJobData> | null = null;
function queue(): Queue<SyncJobData> {
  if (!_queue) _queue = new Queue<SyncJobData>(SYNC_QUEUE, { connection: connectionOpts() });
  return _queue;
}

const DEFAULT_OPTS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 5000 },
  // Remove ao terminar p/ LIBERAR o jobId estável — assim re-syncs do mesmo
  // cliente voltam a rodar. O id só dedupa enquanto o job está na fila/ativo.
  removeOnComplete: true,
  removeOnFail: true,
};

// Enfileira o sync de um cliente. jobId estável evita duplicar o mesmo cliente
// enquanto um job dele ainda está na fila.
export async function enqueueSync(data: SyncJobData): Promise<string> {
  const job = await queue().add("sync", data, {
    ...DEFAULT_OPTS,
    jobId: `sync:${data.clientId}:${data.full ? "full" : "inc"}`,
  });
  return job.id ?? "";
}

// Agenda o tick do scheduler (job repetível). Cluster-safe: o BullMQ dispara
// só 1 tick por intervalo mesmo com vários workers.
export async function scheduleTick(everySec: number): Promise<void> {
  // limpa repetíveis antigos (intervalos trocados) p/ não acumular
  const reps = await queue().getRepeatableJobs().catch(() => []);
  for (const r of reps) if (r.name === "tick") await queue().removeRepeatableByKey(r.key).catch(() => {});
  await queue().add("tick", {} as SyncJobData, {
    repeat: { every: everySec * 1000 },
    removeOnComplete: true,
    removeOnFail: true,
  });
}

export async function getJobStatus(id: string) {
  const job = await queue().getJob(id);
  if (!job) return null;
  return {
    id: job.id,
    data: job.data,
    state: await job.getState(),
    attempts: job.attemptsMade,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
    finishedOn: job.finishedOn,
  };
}

export async function queueCounts() {
  return queue().getJobCounts("waiting", "active", "completed", "failed", "delayed");
}

// clientIds dos jobs de sync ATUALMENTE em execução. Usado pelo reaper p/ NÃO
// marcar como "interrupted" uma run que ainda está rodando de verdade (full
// grande passa de 15min sem estar travado).
export async function activeSyncClientIds(): Promise<string[]> {
  const jobs = await queue().getActive().catch(() => []);
  const ids = new Set<string>();
  for (const j of jobs) if (j.name === "sync" && j.data?.clientId) ids.add(j.data.clientId);
  return [...ids];
}

// Remove jobs de SYNC que ainda não começaram (espera/atrasados). Não mata os
// ativos — esses param via flag de cancelamento (checkpoint). Preserva o tick.
export async function drainQueue(): Promise<number> {
  const q = queue();
  const jobs = [...(await q.getWaiting()), ...(await q.getDelayed())];
  let n = 0;
  for (const j of jobs) {
    if (j.name === "sync") { await j.remove().catch(() => {}); n++; }
  }
  return n;
}
