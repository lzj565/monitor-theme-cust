import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { api } from "@/lib/api"
import {
  getLatencyColor, getPacketLossColor, probeHistoryTargets, PROBE_HISTORY,
  type ProbeHistorySlot, type ProbePingPoint,
} from "@/lib/probeHistory"
import { cn } from "@/lib/utils"

type Response = {
  ping: ProbePingPoint[]
  probes: Record<string, string>
}

type TooltipState = { x: number; y: number; text: string } | null

const TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })

function rangeLabel(slot: ProbeHistorySlot) {
  return `${TIME.format(slot.startAt * 1_000)} - ${TIME.format(slot.endAt * 1_000)}`
}

function CurrentLatency({ slot }: { slot: ProbeHistorySlot }) {
  if (!slot.hasData) return <span className="text-muted-foreground">—</span>
  if (slot.latency === null) {
    return <span style={{ color: getLatencyColor(null) }}>超时</span>
  }
  return (
    <span className="tnum font-semibold" style={{ color: getLatencyColor(slot.latency) }}>
      {slot.latency}<span className="ml-0.5 font-normal text-muted-foreground">ms</span>
    </span>
  )
}

function CurrentLoss({ slot }: { slot: ProbeHistorySlot }) {
  if (!slot.hasData || slot.packetLoss === undefined) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tnum font-semibold" style={{ color: getPacketLossColor(slot.packetLoss) }}>
      {slot.packetLoss}<span className="ml-0.5 font-normal text-muted-foreground">%</span>
    </span>
  )
}

function HistoryBlocks({
  history, kind, animateNewest, onTooltip,
}: {
  history: ProbeHistorySlot[]
  kind: "latency" | "loss"
  animateNewest: boolean
  onTooltip: (next: TooltipState) => void
}) {
  const describe = (slot: ProbeHistorySlot) => {
    if (!slot.hasData) return `${rangeLabel(slot)} · 无数据`
    if (kind === "latency") {
      return `${rangeLabel(slot)} · ${slot.latency === null ? "超时" : `${slot.latency} ms`}`
    }
    return `${rangeLabel(slot)} · ${slot.packetLoss ?? 0}%`
  }
  const move = (event: React.PointerEvent, text: string) => {
    const x = Math.max(105, Math.min(globalThis.innerWidth - 105, event.clientX))
    onTooltip({ x, y: event.clientY - 9, text })
  }

  return (
    // RTL makes an overflowing strip open at its newest (right) edge. The inner
    // row switches back to LTR so time still runs oldest to newest.
    <div dir="rtl" className="overflow-x-auto pb-1 [scrollbar-width:thin]">
      <div dir="ltr" className="flex w-max gap-1">
        {history.map((slot, index) => {
          const color = kind === "latency"
            ? getLatencyColor(slot.latency)
            : getPacketLossColor(slot.packetLoss)
          const text = describe(slot)
          return (
            <span
              key={slot.startAt}
              aria-label={text}
              className={cn(
                "h-[19px] w-3 shrink-0 rounded-[4px]",
                animateNewest && index === history.length - 1 && "probe-new-block",
              )}
              style={{ backgroundColor: color }}
              onPointerEnter={(event) => move(event, text)}
              onPointerMove={(event) => move(event, text)}
              onPointerLeave={() => onTooltip(null)}
            />
          )
        })}
      </div>
    </div>
  )
}

export function ProbeHistory({ nodeId }: { nodeId: number }) {
  const [response, setResponse] = useState<Response | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [tooltip, setTooltip] = useState<TooltipState>(null)
  const [animatedBucket, setAnimatedBucket] = useState<number | null>(null)
  const previousNewest = useRef<number | null>(null)

  const load = useCallback(async (active: () => boolean) => {
    try {
      const next = await api<Response>(
        `/nodes/${nodeId}/metrics?hours=${PROBE_HISTORY.fetchHours}&points=${PROBE_HISTORY.fetchPoints}&series=ping`,
      )
      if (!active()) return
      const now = Date.now()
      const bucket = PROBE_HISTORY.bucketSeconds
      const newest = Math.floor(now / 1_000 / bucket) * bucket - bucket
      setAnimatedBucket(previousNewest.current !== null && newest > previousNewest.current ? newest : null)
      previousNewest.current = newest
      setResponse(next)
      setLoadedAt(now)
      setError("")
    } catch (cause) {
      if (active()) setError(cause instanceof Error ? cause.message || "网络错误" : "网络错误")
    }
  }, [nodeId])

  useEffect(() => {
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const alive = () => active
    const schedule = () => {
      const bucketMs = PROBE_HISTORY.bucketSeconds * 1_000
      const delay = bucketMs - Date.now() % bucketMs + 250
      timer = setTimeout(async () => {
        await load(alive)
        if (active) schedule()
      }, delay)
    }
    const visible = () => {
      if (document.visibilityState === "visible") void load(alive)
    }
    // The request is the external system this effect synchronises with.
    // oxlint-disable-next-line react/set-state-in-effect
    void load(alive)
    schedule()
    document.addEventListener("visibilitychange", visible)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [load, retry])

  const targets = useMemo(
    () => response ? probeHistoryTargets(response.probes, response.ping, loadedAt / 1_000) : [],
    [response, loadedAt],
  )

  if (!response && !error) {
    return <div className="chart-panel h-32 animate-pulse rounded-2xl" aria-label="正在加载探测历史" />
  }

  if (!response && error) {
    return (
      <div className="chart-panel flex items-center justify-center gap-3 rounded-2xl p-5 text-sm text-destructive">
        历史条加载失败：{error}
        <Button variant="outline" size="sm" onClick={() => setRetry((value) => value + 1)}>重试</Button>
      </div>
    )
  }

  return (
    <section className="chart-panel rounded-2xl p-3 sm:p-5" aria-label="延迟和丢包历史">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">网络质量</h3>
        {error ? (
          <button className="text-xs text-destructive underline" onClick={() => setRetry((value) => value + 1)}>
            刷新失败，重试
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">最近 90 分钟 · 每 3 分钟</span>
        )}
      </div>

      {targets.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">暂无探测历史</p>
      ) : (
        <div className="divide-y divide-border/70">
          {targets.map((target) => {
            const animateNewest = target.current.startAt === animatedBucket
            return (
              <div key={target.id} className="grid gap-3 py-3 first:pt-0 last:pb-0 lg:grid-cols-2 lg:gap-5">
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-medium">{target.name}</span>
                    <CurrentLatency slot={target.current} />
                  </div>
                  <HistoryBlocks
                    history={target.history}
                    kind="latency"
                    animateNewest={animateNewest}
                    onTooltip={setTooltip}
                  />
                </div>
                <div className="min-w-0">
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground">丢包</span>
                    <CurrentLoss slot={target.current} />
                  </div>
                  <HistoryBlocks
                    history={target.history}
                    kind="loss"
                    animateNewest={animateNewest}
                    onTooltip={setTooltip}
                  />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg bg-[#d8dde6] px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap text-[#20242b]"
          style={{ left: tooltip.x, top: tooltip.y }}
        >
          {tooltip.text}
        </div>
      )}
    </section>
  )
}
