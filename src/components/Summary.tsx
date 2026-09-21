import { ArrowDown, ArrowDownUp, ArrowUp, Gauge, Inbox, Send, Server, TrendingUp } from "lucide-react"

import { Card } from "@/components/ui/card"
import { speedHistory, type Node } from "@/lib/api"
import { summarizeFleet, type ResourcePeak } from "@/lib/dashboard"
import { bytes, rate, rateSeverity, uptime, type RateSeverity } from "@/lib/format"
import { cn } from "@/lib/utils"

const rateTone: Record<RateSeverity, string> = {
  green: "text-metric-green",
  yellow: "text-metric-yellow",
  orange: "text-metric-orange",
  red: "text-destructive",
}

function Tile({ icon: Icon, label, children, tone }: {
  icon: typeof Server; label: string; children: React.ReactNode; tone: string
}) {
  return (
    <Card className="min-h-[8rem] gap-0 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${tone}`} />
        {label}
      </div>
      {children}
    </Card>
  )
}

/**
 * In and out side by side by default. A stacked flow is used when two traffic
 * periods sit beside each other, so each period keeps its directions vertical.
 */
function Flow({ down, up, className, kind = "rate", downTone, upTone, stacked = false }: {
  down: string
  up: string
  className?: string
  kind?: "rate" | "traffic"
  downTone?: string
  upTone?: string
  stacked?: boolean
}) {
  const DownIcon = kind === "rate" ? ArrowDown : Inbox
  const UpIcon = kind === "rate" ? ArrowUp : Send
  return (
    <div className={cn("tnum grid gap-x-2", stacked ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2", className)}>
      <span className="inline-flex items-center gap-1">
        <DownIcon className="size-3 shrink-0 text-metric-green" />
        <span className="text-muted-foreground">{kind === "rate" ? "下行" : "入站"}</span>
        <span className={downTone}>{down}</span>
      </span>
      <span className="inline-flex items-center gap-1">
        <UpIcon className="size-3 shrink-0 text-metric-blue" />
        <span className="text-muted-foreground">{kind === "rate" ? "上行" : "出站"}</span>
        <span className={upTone}>{up}</span>
      </span>
    </div>
  )
}

/**
 * A bare polyline with no axes or tooltips: at this size only the shape is
 * legible, and recharts would bring a full chart's machinery for it. Series share
 * one scale so the two throughput lines remain comparable.
 */
function Spark({ series }: { series: { values: number[]; className: string }[] }) {
  const top = Math.max(...series.flatMap((s) => s.values), 1)
  const width = Math.max(...series.map((s) => s.values.length), 2) - 1
  return (
    <svg viewBox="0 0 100 24" preserveAspectRatio="none" className="h-7 w-full" aria-hidden>
      {series.map((s, i) => (
        <polyline
          key={i}
          className={s.className}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.25}
          vectorEffect="non-scaling-stroke"
          points={s.values.map((v, x) => `${(x / width) * 100},${23 - (v / top) * 22}`).join(" ")}
        />
      ))}
    </svg>
  )
}

export function Summary({ nodes }: { nodes: Node[] }) {
  const summary = summarizeFleet(nodes)
  const onlineRate = nodes.length > 0 ? (summary.online / nodes.length) * 100 : 0
  const sum = (pick: (n: Node) => number) => nodes.reduce((total, n) => total + pick(n), 0)
  // The same push produced `nodes` and this sample, so the figure above the line
  // is that line's last point.
  const now = speedHistory.at(-1) ?? { rx: 0, tx: 0 }

  return (
    <div className="grid grid-cols-1 gap-3 min-[480px]:grid-cols-2 lg:grid-cols-4">
      <Tile icon={Server} label="节点状态" tone="text-metric-cyan">
        <div className="mt-2 flex items-end justify-between gap-3">
          <div>
            <div className="tnum text-xl font-semibold leading-none">
              {summary.online} / {nodes.length}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">节点在线</div>
          </div>
          <div className="tnum text-sm font-semibold text-ok">{onlineRate.toFixed(0)}%</div>
        </div>
        <div
          className="mt-2 h-1 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-label="节点在线率"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(onlineRate)}
        >
          <div className="h-full rounded-full bg-metric-green transition-[width]" style={{ width: `${onlineRate}%` }} />
        </div>
        <div className="tnum mt-2 grid grid-cols-2 gap-x-3 text-xs">
          <span><span className="text-ok">●</span> 在线 {summary.online}</span>
          <span className="text-muted-foreground"><span>○</span> 离线 {summary.offline}</span>
        </div>
        <div className="tnum mt-auto pt-1.5 text-xs text-muted-foreground">
          ↑ 最长在线 {summary.longestUptime === null ? "—" : uptime(summary.longestUptime)}
        </div>
      </Tile>

      <Tile icon={TrendingUp} label="资源峰值" tone="text-metric-pink">
        <div className="mt-2 grid gap-1.5 text-xs">
          <PeakRow label="CPU" peak={summary.cpu} tone="text-metric-blue" />
          <PeakRow label="RAM" peak={summary.memory} tone="text-metric-purple" />
          <PeakRow label="DISK" peak={summary.disk} tone="text-metric-orange" />
        </div>
      </Tile>

      <Card className="min-h-[8rem] gap-0 p-3">
        <div className="tnum grid h-full grid-cols-2 grid-rows-[auto_1fr] gap-x-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowDownUp className="size-3.5 shrink-0 text-metric-green" />
            今日流量
          </div>
          <div className="text-xs text-muted-foreground">总流量</div>
          <div className="flex min-w-0 items-center pb-1 pt-2">
            <Flow
              down={bytes(sum((n) => n.day_rx))}
              up={bytes(sum((n) => n.day_tx))}
              className="gap-y-1.5 text-xs font-semibold sm:text-[0.8125rem]"
              kind="traffic"
              stacked
            />
          </div>
          <div className="flex min-w-0 items-center pb-1 pt-2">
            <Flow
              down={bytes(sum((n) => n.total_rx))}
              up={bytes(sum((n) => n.total_tx))}
              className="gap-y-1.5 text-xs font-semibold sm:text-[0.8125rem]"
              kind="traffic"
              stacked
            />
          </div>
        </div>
      </Card>

      <Tile icon={Gauge} label="实时网速" tone="text-metric-blue">
        <Flow
          down={rate(now.rx)}
          up={rate(now.tx)}
          downTone={rateTone[rateSeverity(now.rx)]}
          upTone={rateTone[rateSeverity(now.tx)]}
          className="mt-2 text-sm font-semibold"
        />
        <div className="mt-auto pt-1">
          <Spark
            series={[
              { values: speedHistory.map((s) => s.rx), className: "text-metric-green" },
              { values: speedHistory.map((s) => s.tx), className: "text-metric-blue" },
            ]}
          />
        </div>
      </Tile>
    </div>
  )
}

function PeakRow({ label, peak, tone }: { label: string; peak: ResourcePeak | null; tone: string }) {
  const value = peak ? `${peak.value.toFixed(1).replace(/\.0$/, "")}%` : "—"
  return (
    <div className="grid min-w-0 grid-cols-[2.5rem_3.5rem_minmax(0,1fr)] items-center gap-1.5">
      <span className={cn("font-medium", tone)}>{label}</span>
      <span className="tnum text-right font-semibold">{value}</span>
      <span className="truncate text-right text-muted-foreground" title={peak?.node.name}>
        {peak?.node.name ?? "—"}
      </span>
    </div>
  )
}
