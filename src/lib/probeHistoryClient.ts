import { api } from "@/lib/api"
import { PROBE_HISTORY, type ProbePingPoint } from "@/lib/probeHistory"

export type ProbeHistoryResponse = {
  ping: ProbePingPoint[]
  probes: Record<string, string>
}

export type LoadedProbeHistory = {
  response: ProbeHistoryResponse
  loadedAt: number
}

type CacheEntry = LoadedProbeHistory & { minute: number }

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

/** One shared request per node and minute, with headroom under the hub's four-query gate. */
export function loadProbeHistory(nodeId: number): Promise<LoadedProbeHistory> {
  const minute = Math.floor(Date.now() / 60_000)
  const hit = cache.get(nodeId)
  if (hit?.minute === minute) return Promise.resolve(hit)

  const running = pending.get(nodeId)
  if (running) return running

  const request = limited(async () => {
    const response = await api<ProbeHistoryResponse>(
      `/nodes/${nodeId}/metrics?hours=${PROBE_HISTORY.fetchHours}&points=${PROBE_HISTORY.fetchPoints}&series=ping`,
    )
    const entry = { response, loadedAt: Date.now(), minute }
    cache.set(nodeId, entry)
    return entry
  }).finally(() => pending.delete(nodeId))

  pending.set(nodeId, request)
  return request
}

export function nextProbeRefreshDelay(now = Date.now()) {
  return 60_000 - now % 60_000 + 250
}
