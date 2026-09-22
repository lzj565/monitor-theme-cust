import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"

import { Button } from "@/components/ui/button"
import {
  activeWindowPacketLoss, formatPacketLoss, getCardLatencyColor, getCardProbeColor, getLatencyColor,
  getPacketLossColor, latestProbeSlot, probeHistoryTargets, PROBE_HISTORY, targetsWithData, type ProbeHistorySlot,
} from "@/lib/probeHistory"
import { loadProbeHistory, nextProbeRefreshDelay, type ProbeHistoryResponse } from "@/lib/probeHistoryClient"
import { cn } from "@/lib/utils"

type TooltipState = { x: number; y: number; text: string; alignRight: boolean } | null
type LatencyColor = (ms: number | null | undefined) => string

const TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" })

function rangeLabel(slot: ProbeHistorySlot) {
  return `${TIME.format(slot.startAt * 1_000)} - ${TIME.format(slot.endAt * 1_000)}`
}

function CurrentLatency({
  slot,
  latencyColor = getLatencyColor,
  colorUnit = false,
}: {
  slot?: ProbeHistorySlot
  latencyColor?: LatencyColor
  colorUnit?: boolean
}) {
  if (!slot?.hasData) return <span className="text-muted-foreground">—</span>
  if (slot.latency === null) {
    return <span style={{ color: latencyColor(null) }}>超时</span>
  }
  return (
    <span className="tnum font-semibold" style={{ color: latencyColor(slot.latency) }}>
      {slot.latency}<span className={cn("ml-0.5 font-normal", !colorUnit && "text-muted-foreground")}>ms</span>
    </span>
  )
}

function CurrentLoss({ loss }: { loss?: number }) {
  if (loss === undefined) return <span className="text-muted-foreground">—</span>
  return (
    <span className="tnum font-semibold" style={{ color: getPacketLossColor(loss) }}>
      {formatPacketLoss(loss)}<span className="ml-0.5 font-normal text-muted-foreground">%</span>
    </span>
  )
}

function HistoryBlocks({
  history, kind, animateNewest, onTooltip, latencyColor = getLatencyColor, compact = false,
}: {
  history: ProbeHistorySlot[]
  kind: "latency" | "loss" | "combined"
  animateNewest: boolean
  onTooltip: (next: TooltipState) => void
  latencyColor?: LatencyColor
  compact?: boolean
}) {
  const label = kind === "latency" ? "延迟" : kind === "loss" ? "丢包" : "网络质量"
  const describe = (slot: ProbeHistorySlot) => {
    if (!slot.hasData) return `${rangeLabel(slot)} · ${label}无数据`
    if (kind === "latency") {
      return `${rangeLabel(slot)} · ${slot.latency === null ? "延迟超时" : `延迟 ${slot.latency} ms`}`
    }
    if (kind === "combined") {
      const latency = slot.latency === undefined
        ? "延迟无数据"
        : slot.latency === null
          ? "延迟超时"
          : `延迟 ${slot.latency} ms`
      return `${rangeLabel(slot)} · ${latency} · 丢包 ${formatPacketLoss(slot.packetLoss ?? 0)}%`
    }
    return `${rangeLabel(slot)} · 丢包 ${slot.packetLoss ?? 0}%`
  }
  const move = (event: React.PointerEvent, text: string) => {
    const alignRight = event.clientX > globalThis.innerWidth - 220
    onTooltip({
      x: event.clientX + (alignRight ? -12 : 12),
      y: Math.max(44, event.clientY - 8),
      text,
      alignRight,
    })
  }

  return (
    <div
      className={cn("grid w-full", compact ? "h-1.5 gap-0.5" : "h-2.5 gap-px")}
      style={{ gridTemplateColumns: `repeat(${history.length}, minmax(1px, 1fr))` }}
    >
        {history.map((slot, index) => {
          const color = kind === "latency"
            ? latencyColor(slot.latency)
            : kind === "loss"
              ? getPacketLossColor(slot.packetLoss)
              : getCardProbeColor(slot.latency, slot.packetLoss)
          const text = describe(slot)
          return (
            <span
              key={slot.startAt}
              aria-label={text}
              className={cn(
                compact ? "h-1.5 min-w-0 rounded-[2px]" : "h-2.5 min-w-0 rounded-[2px]",
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
  )
}

function useProbeData(nodeId: number, enabled = true) {
  const [response, setResponse] = useState<ProbeHistoryResponse | null>(null)
  const [loadedAt, setLoadedAt] = useState(0)
  const [error, setError] = useState("")
  const [retry, setRetry] = useState(0)
  const [animatedBucket, setAnimatedBucket] = useState<number | null>(null)
  const previousNewest = useRef<number | null>(null)

  useEffect(() => {
    if (!enabled) return
    let active = true
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const { response: next, loadedAt: now } = await loadProbeHistory(nodeId)
        if (!active) return
        const bucket = PROBE_HISTORY.bucketSeconds
        const newest = Math.floor(now / 1_000 / bucket) * bucket - bucket
        setAnimatedBucket(previousNewest.current !== null && newest > previousNewest.current ? newest : null)
        previousNewest.current = newest
        setResponse(next)
        setLoadedAt(now)
        setError("")
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message || "网络错误" : "网络错误")
      }
    }
    const schedule = () => {
      timer = setTimeout(async () => {
        await load()
        if (active) schedule()
      }, nextProbeRefreshDelay())
    }
    const visible = () => {
      if (document.visibilityState === "visible") void load()
    }
    // oxlint-disable-next-line react/set-state-in-effect
    void load()
    schedule()
    document.addEventListener("visibilitychange", visible)
    return () => {
      active = false
      clearTimeout(timer)
      document.removeEventListener("visibilitychange", visible)
    }
  }, [enabled, nodeId, retry])

  return { response, loadedAt, error, retry: () => setRetry((value) => value + 1), animatedBucket }
}

function ProbeTooltip({ tooltip }: { tooltip: TooltipState }) {
  if (!tooltip) return null
  return createPortal(
    <div
      role="tooltip"
      className={cn(
        "pointer-events-none fixed z-50 -translate-y-full rounded-lg bg-[#d8dde6] px-3 py-[7px] text-[13px] font-semibold whitespace-nowrap text-[#20242b]",
        tooltip.alignRight && "-translate-x-full",
      )}
      style={{ left: tooltip.x, top: tooltip.y }}
    >
      {tooltip.text}
    </div>,
    document.body,
  )
}

function QualityLegend() {
  return (
    <div
      className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground"
      aria-label="网络质量图例"
    >
      <span className="inline-flex items-center gap-1">
        <span
          className="h-1.5 w-5 rounded-[2px]"
          style={{ background: "linear-gradient(90deg, var(--probe-green), var(--probe-yellow), var(--probe-red))" }}
        />
        延迟
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-[2px]" style={{ backgroundColor: "var(--probe-loss-marker)" }} />
        丢包
      </span>
      <span className="inline-flex items-center gap-1">
        <span className="size-1.5 rounded-[2px]" style={{ backgroundColor: "var(--probe-empty)" }} />
        无数据
      </span>
    </div>
  )
}

export function ProbeHistory({ nodeId }: { nodeId: number }) {
  const { response, loadedAt, error, retry, animatedBucket } = useProbeData(nodeId)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

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
        <Button variant="outline" size="sm" onClick={retry}>重试</Button>
      </div>
    )
  }

  return (
    <section className="chart-panel rounded-2xl p-3 sm:p-5" aria-label="延迟和丢包历史">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-medium">网络质量</h3>
        {error ? (
          <button className="text-xs text-destructive underline" onClick={retry}>
            刷新失败，重试
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">最近 60 分钟 · 每 3 分钟</span>
        )}
      </div>

      {targets.length === 0 ? (
        <p className="py-5 text-center text-sm text-muted-foreground">暂无探测历史</p>
      ) : (
        <div className="divide-y divide-border/70">
          {targets.map((target) => {
            const animateNewest = target.current.startAt === animatedBucket
            const latest = latestProbeSlot(target)
            const loss = activeWindowPacketLoss(
              response?.ping ?? [], response?.hourPing ?? [], response?.loss ?? {}, target.id, loadedAt / 1_000,
            )
            return (
              <div key={target.id} className="py-2.5 first:pt-0 last:pb-0">
                <div className="mb-1.5 grid grid-cols-2 gap-3 text-xs sm:gap-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="truncate font-medium text-sm">{target.name}</span>
                    <span className="ml-auto shrink-0"><CurrentLatency slot={latest} /></span>
                  </div>
                  <div className="flex items-center justify-end">
                    <CurrentLoss loss={loss} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 sm:gap-5">
                  <div className="grid min-w-0 grid-cols-[2rem_1fr] items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">延迟</span>
                    <HistoryBlocks
                      history={target.history}
                      kind="latency"
                      animateNewest={animateNewest}
                      onTooltip={setTooltip}
                    />
                  </div>
                  <div className="grid min-w-0 grid-cols-[2rem_1fr] items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground">丢包</span>
                    <HistoryBlocks
                      history={target.history}
                      kind="loss"
                      animateNewest={animateNewest}
                      onTooltip={setTooltip}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <ProbeTooltip tooltip={tooltip} />
    </section>
  )
}

export function NodeProbeSummary({ nodeId }: { nodeId: number }) {
  const root = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>(null)

  useEffect(() => {
    const element = root.current
    if (!element) return
    if (!("IntersectionObserver" in globalThis)) {
      // oxlint-disable-next-line react/set-state-in-effect
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setVisible(true) },
      { rootMargin: "200px" },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const { response, loadedAt } = useProbeData(nodeId, visible)
  const targets = useMemo(
    () => targetsWithData(response ? probeHistoryTargets(response.probes, response.ping, loadedAt / 1_000) : [], 6),
    [response, loadedAt],
  )

  return (
    <div ref={root} className="min-h-px" onClick={(event) => event.stopPropagation()}>
      {targets.length > 0 && (
        <div className="mt-4 border-t pt-3" aria-label="网络质量">
          <QualityLegend />
          <div className="grid grid-cols-1 gap-x-2 gap-y-2.5 min-[480px]:grid-cols-2">
            {targets.map((target) => {
              const latest = latestProbeSlot(target)
              const loss = activeWindowPacketLoss(
                response?.ping ?? [], response?.hourPing ?? [], response?.loss ?? {}, target.id, loadedAt / 1_000,
              )
              return (
                <div key={target.id} className="min-w-0">
                  <div className="mb-1 flex min-w-0 items-center gap-2 text-[11px]">
                    <span className="min-w-0 flex-1 truncate font-medium">{target.name}</span>
                    <div className="flex shrink-0 items-center gap-2">
                      <CurrentLatency slot={latest} latencyColor={getCardLatencyColor} colorUnit />
                      <CurrentLoss loss={loss} />
                    </div>
                  </div>
                  <HistoryBlocks
                    history={target.history}
                    kind="combined"
                    animateNewest={false}
                    onTooltip={setTooltip}
                    latencyColor={getCardLatencyColor}
                    compact
                  />
                </div>
              )
            })}
          </div>
          <ProbeTooltip tooltip={tooltip} />
        </div>
      )}
    </div>
  )
}
