import type { CSSProperties } from "react"
import { Activity, ArrowDown, ArrowUp, Cpu, Gauge, HardDrive, Inbox, MemoryStick, Network, Send } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Meter } from "@/components/Meter"
import { NodeProbeSummary } from "@/components/ProbeHistory"
import { SegmentedProgress } from "@/components/SegmentedProgress"
import type { Node } from "@/lib/api"
import { countryCodeToFlag, countryName, getEffectiveCountry } from "@/lib/country"
import {
  bytes, daysUntil, FOREVER, osName, pair, percent, rate, rateSeverity, severity, uptime,
  type RateSeverity, type Severity,
} from "@/lib/format"
import { loadColor, usageColor } from "@/lib/metricColor"
import { cn } from "@/lib/utils"

/** Which direction the plan meters, matching the node's traffic_mode. */
function monthUsage(node: Node): number {
  const { month_rx: rx, month_tx: tx } = node
  switch (node.traffic_mode) {
    case "up":
      return tx
    case "down":
      return rx
    case "max":
      return Math.max(rx, tx)
    default:
      return rx + tx
  }
}

// A node that has reported once has told the hub its shape -- cores, memory,
// disk -- and the hub retains its traffic totals whether connected or not. A node
// that never connected is the only case with nothing to show.
function deployed(node: Node) {
  return node.cpu_cores > 0 || node.mem_total > 0
}

/**
 * The dot plus how long the machine has been up, or once it is gone, how long it
 * has been absent -- the first question asked of an offline node. Both are
 * durations, so the badge keeps its shape either way.
 */
export function Status({ node }: { node: Node }) {
  const down = node.last_seen ? Date.now() / 1000 - node.last_seen : 0
  const label = node.online
    ? `在线 ${node.metrics ? uptime(node.metrics.uptime) : ""}`
    : deployed(node)
      ? `离线 ${down >= 60 ? uptime(down) : ""}`
      : "未接入"
  return (
    // Muted once it stops reporting: the figures on the page are genuine, merely
    // no longer current.
    <Badge
      variant="outline"
      className={cn("tnum shrink-0 gap-1.5 font-normal", !node.online && "text-muted-foreground")}
    >
      <span className={cn("size-1.5 rounded-full", node.online ? "bg-metric-green" : "bg-muted-foreground/40")} />
      {label.trim()}
    </Badge>
  )
}

export function CountryBadge({ country }: { country: string | null }) {
  if (!country) return null
  const name = countryName(country)
  return (
    <Badge variant="outline" className="shrink-0 font-normal text-muted-foreground" aria-label={name}>
      {name}
    </Badge>
  )
}

// Traffic uses the plan's own counting rule, so the bar matches the quota the
// node is billed against.
function trafficFoot(node: Node) {
  return node.traffic_limit > 0
    ? pair(monthUsage(node), node.traffic_limit)
    : `${bytes(monthUsage(node))} / ${FOREVER}`
}

function systemInfo(node: Node): string {
  return [
    node.os ? osName(node.os) : "等待首次上报",
    node.virt && node.virt !== "none" ? node.virt : "",
    node.arch,
  ].filter(Boolean).join(" · ")
}

// No date means nothing expires: a permanent host, or one with no renewal set. A
// blank corner asserts neither.
function Expiry({ node }: { node: Node }) {
  const days = daysUntil(node.expires_at)
  if (days === null) return <span className="text-xs text-muted-foreground" title="永不到期">{FOREVER}</span>
  const tone = days < 0 ? "text-destructive" : days <= 7 ? "text-warn" : "text-muted-foreground"
  return (
    <span className={cn("tnum text-xs", tone)}>
      {days < 0 ? `已过期 ${-days} 天` : `${days} 天后到期`}
    </span>
  )
}

const severityTone: Record<Severity, string> = {
  green: "text-metric-green",
  yellow: "text-metric-yellow",
  red: "text-destructive",
}

const rateTone: Record<RateSeverity, string> = {
  green: "text-metric-green",
  yellow: "text-metric-yellow",
  orange: "text-metric-orange",
  red: "text-destructive",
}

function RuntimeStat({ icon: Icon, label, value, tone, valueTone }: {
  icon: typeof Activity
  label: string
  value: React.ReactNode
  tone: string
  valueTone?: string
}) {
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-xs">
      <Icon className={`size-3.5 shrink-0 ${tone}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("tnum truncate font-medium", valueTone)}>{value}</span>
    </div>
  )
}

export function NodeCard({ node, onOpen }: { node: Node; onOpen: () => void }) {
  const m = node.metrics
  const country = getEffectiveCountry(node)

  return (
    <Card
      onClick={onOpen}
      className="min-w-0 cursor-pointer gap-0 p-4 hover:-translate-y-0.5 hover:border-metric-blue/35 hover:bg-panel-hover"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen())}
    >
      {/* Keep live status and expiry in separate rows so neither can drift into
          the other row when the card becomes narrow. */}
      <div className="relative flex flex-col gap-1 overflow-visible">
        <div className="flex min-w-0 items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            {country && (
              <span className="shrink-0 text-2xl leading-none" aria-hidden="true">
                {countryCodeToFlag(country)}
              </span>
            )}
            <h3 className="min-w-0 flex-1 truncate font-medium">{node.name}</h3>
          </div>
          <Status node={node} />
        </div>
        <div className="flex min-w-0 items-center justify-between gap-3">
          <p
            className="min-w-0 flex-1 truncate whitespace-nowrap text-xs text-muted-foreground"
            title={systemInfo(node)}
          >
            {systemInfo(node)}
          </p>
          <div className="shrink-0 text-right">
            <Expiry node={node} />
          </div>
        </div>
      </div>

      {/* One layout for both states: a disconnected node still knows its
          cores, memory, disk size and traffic totals, and showing those with
          the live figures blank beats a stretched card with one line in it. */}
      {deployed(node) ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4">
            {/* The core count belongs beside the word CPU: it is what the
                percentage and the load averages are both measured against. */}
            <Meter
              label={<span className="inline-flex items-center gap-1.5"><Cpu className="size-3.5 text-metric-blue" />CPU {node.cpu_cores} 核</span>}
              pct={m ? m.cpu : null}
              foot={m ? (
                <span className="inline-flex gap-2">
                  {m.load.map((n, index) => (
                    <span
                      key={index}
                      className="metric-load-color"
                      style={{ "--resource-color": loadColor(n) } as CSSProperties}
                      title={`load${index + 1}`}
                    >
                      {n.toFixed(2)}
                    </span>
                  ))}
                </span>
              ) : "—"}
              progress={<SegmentedProgress value={m?.cpu ?? 0} segments={16} tone="blue" className="mt-1.5" />}
              tone="blue"
              color={m ? usageColor(m.cpu) : undefined}
            />
            <Meter
              label={<span className="inline-flex items-center gap-1.5"><MemoryStick className="size-3.5 text-metric-purple" />内存</span>}
              pct={m ? percent(m.mem_used, m.mem_total) : null}
              foot={m ? pair(m.mem_used, m.mem_total) : bytes(node.mem_total)}
              progress={<SegmentedProgress value={m ? percent(m.mem_used, m.mem_total) : 0} segments={16} tone="purple" className="mt-1.5" />}
              tone="purple"
              color={m ? usageColor(percent(m.mem_used, m.mem_total)) : undefined}
            />
            <Meter
              label={<span className="inline-flex items-center gap-1.5"><HardDrive className="size-3.5 text-metric-orange" />硬盘</span>}
              pct={m ? percent(m.disk_used, m.disk_total) : null}
              foot={m ? pair(m.disk_used, m.disk_total) : bytes(node.disk_total)}
              progress={<SegmentedProgress value={m ? percent(m.disk_used, m.disk_total) : 0} segments={16} tone="orange" className="mt-1.5" />}
              tone="orange"
              color={m ? usageColor(percent(m.disk_used, m.disk_total)) : undefined}
            />
            <Meter
              label={<span className="inline-flex items-center gap-1.5"><Gauge className="size-3.5 text-metric-green" />流量</span>}
              pct={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : null}
              empty={FOREVER}
              foot={trafficFoot(node)}
              progress={<SegmentedProgress value={node.traffic_limit > 0 ? percent(monthUsage(node), node.traffic_limit) : 0} segments={16} tone="green" className="mt-1.5" />}
              tone="green"
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2">
            <RuntimeStat
              icon={MemoryStick}
              label="Swap"
              value={m
                ? m.swap_total > 0 ? bytes(m.swap_total) : "未启用"
                : node.swap_total > 0 ? bytes(node.swap_total) : "未启用"}
              tone="text-metric-yellow"
              valueTone={m ? "text-foreground" : "text-muted-foreground"}
            />
            <RuntimeStat
              icon={Network}
              label="TCP"
              value={m?.tcp ?? "—"}
              tone="text-metric-purple"
              valueTone={m ? severityTone[severity(m.tcp, 100, 200)] : "text-muted-foreground"}
            />
            <RuntimeStat
              icon={Activity}
              label="进程数"
              value={m?.procs ?? "—"}
              tone="text-metric-yellow"
              valueTone={m ? severityTone[severity(m.procs, 100, 200)] : "text-muted-foreground"}
            />
            <RuntimeStat
              icon={Network}
              label="UDP"
              value={m?.udp ?? "—"}
              tone="text-metric-blue"
              valueTone={m ? severityTone[severity(m.udp, 100, 200)] : "text-muted-foreground"}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t pt-4 text-xs">
            <span className="tnum inline-flex min-w-0 items-center gap-1.5">
              <ArrowDown className="size-3 text-metric-green" />
              <span className="text-muted-foreground">下行</span>
              <span className={cn("truncate", m ? rateTone[rateSeverity(m.net_rx)] : "text-muted-foreground")}>
                {m ? rate(m.net_rx) : "—"}
              </span>
            </span>
            <span className="tnum inline-flex min-w-0 items-center gap-1.5">
              <Inbox className="size-3 text-metric-green" />
              <span className="text-muted-foreground">入站</span>
              <span className="truncate">{bytes(node.total_rx)}</span>
            </span>
            <span className="tnum inline-flex min-w-0 items-center gap-1.5">
              <ArrowUp className="size-3 text-metric-blue" />
              <span className="text-muted-foreground">上行</span>
              <span className={cn("truncate", m ? rateTone[rateSeverity(m.net_tx)] : "text-muted-foreground")}>
                {m ? rate(m.net_tx) : "—"}
              </span>
            </span>
            <span className="tnum inline-flex min-w-0 items-center gap-1.5">
              <Send className="size-3 text-metric-blue" />
              <span className="text-muted-foreground">出站</span>
              <span className="truncate">{bytes(node.total_tx)}</span>
            </span>
          </div>
        </>
      ) : (
        /* Never connected: nothing to plot, so the card stays short rather than
           padding out to match its neighbours. */
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          还没有接入。在后台生成安装命令并执行一次。
        </p>
      )}
      <NodeProbeSummary nodeId={node.id} />
    </Card>
  )
}
