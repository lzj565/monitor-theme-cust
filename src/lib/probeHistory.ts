export const PROBE_HISTORY = {
  bucketSeconds: 3 * 60,
  blockCount: 20,
  // The hub clamps points to at least 60. Three hours / 60 points produces
  // exact three-minute buckets; the UI keeps the most recent hour.
  fetchHours: 3,
  fetchPoints: 60,
} as const

export type ProbePingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}

export type ProbeHistorySlot = {
  startAt: number
  endAt: number
  latency: number | null | undefined
  packetLoss: number | undefined
  hasData: boolean
}

export type ProbeHistoryTarget = {
  id: number
  name: string
  history: ProbeHistorySlot[]
  current: ProbeHistorySlot
}

export function targetsWithData(targets: ProbeHistoryTarget[], limit = Infinity) {
  return targets.filter((target) => target.history.some((slot) => slot.hasData)).slice(0, limit)
}

export function latestProbeSlot(target: ProbeHistoryTarget) {
  return target.history.findLast((slot) => slot.hasData)
}

/** Keep plotted probes in stable numeric-id order, regardless of ping sample order. */
export function orderedProbeIds(
  probes: Record<string, string>,
  points: Pick<ProbePingPoint, "task_id">[],
) {
  const reported = new Set(points.map((point) => point.task_id).filter(Number.isFinite))
  const ids = new Set([
    ...Object.keys(probes).map(Number).filter(Number.isFinite),
    ...reported,
  ])
  return [...ids].filter((id) => reported.has(id)).sort((a, b) => a - b)
}

/**
 * One-hour loss after the first success visible to this frontend. The hub's
 * exact whole-window ratio is safe once activation predates the hour; during
 * the first hour, equal one-minute buckets are the closest available estimate.
 */
export function activeWindowPacketLoss(
  history: ProbePingPoint[],
  hour: ProbePingPoint[],
  loss: Record<string, number>,
  targetId: number,
  nowSeconds: number,
) {
  const hourStart = nowSeconds - 3_600
  const hourly = hour.filter((point) => point.task_id === targetId).sort((a, b) => a.ts - b.ts)
  if (hourly.length === 0) return undefined

  const activatedBeforeWindow = history.some(
    (point) => point.task_id === targetId && point.ts < hourStart && point.latency !== null,
  )
  if (activatedBeforeWindow) return loss[targetId] ?? 0

  const firstSuccess = hourly.findIndex((point) => point.latency !== null)
  if (firstSuccess < 0) return undefined
  const active = hourly.slice(firstSuccess)
  return active.reduce((total, point) => total + (point.loss ?? 0), 0) / active.length
}

export function formatPacketLoss(loss: number) {
  return loss.toFixed(1)
}

export function getLatencyColor(ms: number | null | undefined): string {
  if (ms === undefined) return "var(--probe-empty)"
  if (ms === null) return "var(--probe-timeout)"
  if (ms <= 50) return "var(--probe-green)"
  if (ms <= 100) return "var(--probe-lime)"
  if (ms <= 200) return "var(--probe-yellow)"
  if (ms <= 300) return "var(--probe-amber)"
  if (ms <= 500) return "var(--probe-orange)"
  return "var(--probe-red)"
}

/** Homepage cards use thresholds suited to mixed Asia, US, and Europe nodes. */
export function getCardLatencyColor(ms: number | null | undefined): string {
  if (ms === undefined) return "var(--probe-empty)"
  if (ms === null) return "var(--probe-timeout)"
  if (ms < 50) return "var(--probe-green)"
  if (ms < 100) return "var(--probe-lime)"
  if (ms < 150) return "var(--probe-yellow)"
  if (ms < 220) return "var(--probe-amber)"
  if (ms < 300) return "var(--probe-orange)"
  return "var(--probe-red)"
}

/** Homepage history uses one high-contrast block to mark any packet loss. */
export function getCardProbeColor(ms: number | null | undefined, loss: number | undefined): string {
  if (loss !== undefined && loss > 0) return "var(--probe-loss-marker)"
  return getCardLatencyColor(ms)
}

export function getPacketLossColor(loss: number | undefined): string {
  if (loss === undefined) return "var(--probe-empty)"
  if (loss <= 1) return "var(--probe-green)"
  if (loss <= 5) return "var(--probe-loss-lime)"
  if (loss <= 10) return "var(--probe-loss-yellow)"
  if (loss <= 20) return "var(--probe-orange)"
  if (loss <= 50) return "var(--probe-loss-orange)"
  if (loss < 100) return "var(--probe-loss-red)"
  return "var(--probe-loss-total)"
}

/** Build one fixed, gap-preserving strip ending at the last completed bucket. */
export function historySlots(
  points: ProbePingPoint[],
  nowSeconds: number,
  bucketSeconds: number = PROBE_HISTORY.bucketSeconds,
  count: number = PROBE_HISTORY.blockCount,
): ProbeHistorySlot[] {
  const end = Math.floor(nowSeconds / bucketSeconds) * bucketSeconds
  const start = end - count * bucketSeconds
  const byBucket = new Map(points.map((point) => [point.ts, point]))
  return Array.from({ length: count }, (_, index) => {
    const startAt = start + index * bucketSeconds
    const point = byBucket.get(startAt)
    return {
      startAt,
      endAt: startAt + bucketSeconds,
      latency: point?.latency,
      packetLoss: point ? point.loss ?? 0 : undefined,
      hasData: point !== undefined,
    }
  })
}

export function probeHistoryTargets(
  probes: Record<string, string>,
  points: ProbePingPoint[],
  nowSeconds: number,
): ProbeHistoryTarget[] {
  const ids = new Set([
    ...Object.keys(probes).map(Number).filter(Number.isFinite),
    ...points.map((point) => point.task_id),
  ])
  return [...ids].sort((a, b) => a - b).map((id) => {
    const history = historySlots(points.filter((point) => point.task_id === id), nowSeconds)
    return {
      id,
      name: probes[id] ?? `探测 ${id}`,
      history,
      current: history[history.length - 1],
    }
  })
}
