import { ArrowDown, ArrowDownUp, ArrowUp, Clock3, Gauge, Server } from "lucide-react"

import { Card } from "@/components/ui/card"
import { speedHistory, type Node } from "@/lib/api"
import { summarizeMinimalHome } from "@/lib/dashboard"
import { bytes, rate, rateSeverity, type RateSeverity } from "@/lib/format"
import { cn } from "@/lib/utils"

const rateTone: Record<RateSeverity, string> = {
  green: "text-metric-green",
  yellow: "text-metric-yellow",
  orange: "text-metric-orange",
  red: "text-destructive",
}

function StatTile({ icon: Icon, label, value, hint, tone }: {
  icon: typeof Server
  label: string
  value: string
  hint?: string
  tone: string
}) {
  return (
    <Card className="minimal-summary-card min-w-0 justify-between gap-2 p-3">
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        <Icon className={cn("minimal-summary-icon size-4 shrink-0", tone)} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <div className={cn("tnum truncate text-xl font-semibold leading-tight", tone)}>{value}</div>
        {hint && <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{hint}</div>}
      </div>
    </Card>
  )
}

export function MinimalSummary({ nodes }: { nodes: Node[] }) {
  const summary = summarizeMinimalHome(nodes)
  const now = speedHistory.at(-1) ?? { rx: 0, tx: 0 }

  const tiles: { icon: typeof Server; label: string; value: string; hint?: string; tone: string }[] = [
    { icon: ArrowUp, label: "实时上行", value: rate(now.tx), tone: rateTone[rateSeverity(now.tx)] },
    { icon: ArrowDown, label: "实时下行", value: rate(now.rx), tone: rateTone[rateSeverity(now.rx)] },
    { icon: ArrowDownUp, label: "累计流量", value: bytes(summary.totalTraffic), hint: "入站 + 出站", tone: "text-metric-purple" },
    { icon: Server, label: "在线节点", value: `${summary.online} / ${summary.totalNodes}`, tone: "text-metric-green" },
    { icon: Gauge, label: "高负载节点", value: String(summary.highLoad), hint: "任一资源 ≥80%", tone: "text-metric-orange" },
    { icon: Clock3, label: "即将到期节点", value: String(summary.expiring), hint: "未来 7 天", tone: "text-metric-yellow" },
  ]

  return (
    <div className="minimal-summary-grid grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-label="服务器状态概览">
      {tiles.map((tile) => <StatTile key={tile.label} {...tile} />)}
    </div>
  )
}
