import { api } from "@/lib/api"
import { PROBE_HISTORY, type ProbePingPoint } from "@/lib/probeHistory"

export type ProbeHistoryResponse = {
  ping: ProbePingPoint[]
  hourPing: ProbePingPoint[]
  probes: Record<string, string>
  loss: Record<string, number>
}

export type LoadedProbeHistory = {
  response: ProbeHistoryResponse
  loadedAt: number
}

type CacheEntry = LoadedProbeHistory & { bucket: number }

const cache = new Map<number, CacheEntry>()
const pending = new Map<number, Promise<LoadedProbeHistory>>()
const queue: (() => void)[] = []
let active = 0
const MAX_CONCURRENT = 2

function runNext() {
  while (active < MAX_CONCURRENT && queue.length > 0) {
    active++
    queue.shift()!()
  }
}

function limited<T>(task: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    queue.push(() => {
      task().then(resolve, reject).finally(() => {
        active--
        runNext()
      })
    })
    runNext()
  })
}

/** One shared request per node and history bucket, with headroom under the hub's four-query gate. */
export function loadProbeHistory(nodeId: number): Promise<LoadedProbeHistory> {
  const bucketMs = PROBE_HISTORY.bucketSeconds * 1_000
  const bucket = Math.floor(Date.now() / bucketMs)
  const hit = cache.get(nodeId)
  if (hit?.bucket === bucket) return Promise.resolve(hit)

  const running = pending.get(nodeId)
  if (running) return running

  const request = limited(async () => {
    const history = await api<Omit<ProbeHistoryResponse, "hourPing" | "loss">>(
      `/nodes/${nodeId}/metrics?hours=${PROBE_HISTORY.fetchHours}&points=${PROBE_HISTORY.fetchPoints}&series=ping`,
    )
    // The three-hour request above gives the hub enough room to create native
    // three-minute buckets. Loss shown beside the strip is a different measure:
    // the exact ratio across the most recent hour, calculated by the hub from
    // sample counts that are no longer available in each returned bucket.
    const oneHour = await api<{ ping: ProbePingPoint[]; loss: Record<string, number> }>(
      `/nodes/${nodeId}/metrics?hours=1&points=${PROBE_HISTORY.fetchPoints}&series=ping`,
    )
    const response = { ...history, hourPing: oneHour.ping ?? [], loss: oneHour.loss ?? {} }
    const entry = { response, loadedAt: Date.now(), bucket }
    cache.set(nodeId, entry)
    return entry
  }).finally(() => pending.delete(nodeId))

  pending.set(nodeId, request)
  return request
}

export function nextProbeRefreshDelay(now = Date.now()) {
  const bucketMs = PROBE_HISTORY.bucketSeconds * 1_000
  return bucketMs - now % bucketMs + 250
}
