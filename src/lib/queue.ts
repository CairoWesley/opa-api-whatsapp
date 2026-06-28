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
  removeOnComplete: 200,
  removeOnFail: 500,
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
