import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { median } from "d3-array"
import { Cpu, HardDrive, MemoryStick, Network } from "lucide-react"
import {
  Area, AreaChart, Brush, CartesianGrid, ComposedChart, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Country, Status } from "@/components/NodeCard"
import { api, type Node } from "@/lib/api"
import {
  axisBytes, axisTop, bytes, clockFor, quarters, cpuName, CYCLES, FOREVER, money, osName, percent, rate, rateSeverity, timeTicks,
  type RateSeverity,
} from "@/lib/format"
import { latencyP90 } from "@/lib/latency"
import { usageColor, usageGradientStops } from "@/lib/metricColor"
import { formatPacketLoss, getLatencyColor } from "@/lib/probeHistory"

type Point = {
  ts: number
  cpu: number
  mem_used: number
  disk_used: number
  net_rx: number
  net_tx: number
}
// `latency` is the bucket's median round trip, null when every probe in it timed
// out. `band` is the range its answers spanned, absent when they spanned nothing.
// `loss` is the percentage that timed out, absent when none did.
type PingPoint = {
  task_id: number
  ts: number
  latency: number | null
  band?: [number, number]
  loss?: number
}
/** Probe names by id, sent alongside the samples they label. */
type Probes = Record<string, string>
/**
 * Proportion of the whole window each probe lost, by id, absent for probes that
 * lost nothing. Sent because it cannot be derived here: every bucket's `loss` is
 * already a percentage of that bucket, so the sample counts it was divided by are
 * unavailable. Averaging them would weight a bucket holding one sample equally
 * with one holding twelve, and the window's first and last buckets are partial
 * regardless of what the probe does.
 */
type Loss = Record<string, number>

const RANGES = [
  { hours: 1, label: "1 小时" },
  { hours: 6, label: "6 小时" },
  { hours: 24, label: "24 小时" },
  { hours: 168, label: "7 天" },
]

// Latency stops at a day. A week-wide bucket would still carry the spread and the
// loss figure, but a week of probe history is outside this page's purpose, and
// these are the windows in which every ping remains on the chart.
const RANGES_FOR = { resources: RANGES, latency: RANGES.filter((r) => r.hours <= 24) }

const AXIS = { stroke: "currentColor", fontSize: 11, tickLine: false, axisLine: false }

// No grow-in animation: it would spend 1.5 s drawing a line across the panel on
// every range change, on a page meant to be read at a glance, and on the latency
// chart across seven hundred points per probe.
const SERIES = { dot: false as const, activeDot: { r: 3, strokeWidth: 0 }, strokeWidth: 1.75, isAnimationActive: false }

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  color: "var(--popover-foreground)",
  fontSize: 12,
  boxShadow: "0 12px 30px rgb(0 0 0 / 12%)",
}

// One width for every stacked panel's value axis. Sized to their own labels --
// 40px under "100%", 68px under "172 MB" -- the four plot areas would be offset by
// 28px, placing a CPU spike and the network spike that caused it at different x.
const Y_WIDTH = 68

const PALETTE = [
  "#ef5da8",
  "#ff8500",
  "#d5c400",
  "#00c875",
  "#21c4d6",
  "#4f8cff",
  "#ba7bea",
  "#45c98b",
  "#e8b33d",
]

const rateTone: Record<RateSeverity, string> = {
  green: "text-metric-green",
  yellow: "text-metric-yellow",
  orange: "text-metric-orange",
  red: "text-destructive",
}

const TABS = [
  { key: "resources", label: "资源" },
  { key: "latency", label: "网络延迟" },
] as const

function Panel({ title, value, icon: Icon, tone, border, children }: {
  title: string
  value: React.ReactNode
  icon: typeof Cpu
  tone: string
  border: string
  children: React.ReactNode
}) {
  return (
    <div className={`chart-panel min-w-0 rounded-2xl p-4 ${border}`}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          <Icon className={`size-4 ${tone}`} />
          {title}
        </h4>
        <div className="tnum truncate text-right text-sm text-foreground">{value}</div>
      </div>
      <div className="h-52 w-full text-muted-foreground">{children}</div>
    </div>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-xs transition-colors ${
        active ? "bg-control-active text-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground"
      }`}
    >
      {children}
    </button>
  )
}

function lossTone(loss: number) {
  if (loss > 20) return "text-destructive"
  if (loss > 5) return "text-metric-orange"
  if (loss > 1) return "text-metric-yellow"
  return "text-metric-green"
}

function UsageGradient({ id, domainPercent }: { id: string; domainPercent: number }) {
  return (
    <linearGradient id={id} x1="0" y1="1" x2="0" y2="0">
      {usageGradientStops(domainPercent).map(({ offset, color }) => (
        <stop
          key={offset}
          className="metric-resource-stop"
          style={{ "--resource-color": color } as CSSProperties}
          offset={offset}
        />
      ))}
    </linearGradient>
  )
}

/**
 * Hampel filter (Hampel 1974; MATLAB ships it as `hampel`). A point more than
 * `sigmas` robust deviations from its window's median is replaced by that median,
 * while everything else passes through unchanged, which is what distinguishes it
 * from a rolling median or a moving average.
 *
 * 1.4826 rescales the median absolute deviation to a standard deviation for
 * normally distributed data; 3 sigma is the conventional cut.
 */
function despike(points: PingPoint[], window = 7, sigmas = 3): PingPoint[] {
  const half = window >> 1
  // ponytail: recomputes the window per point. A few thousand samples is
  // negligible; substitute a rolling structure if a chart ever needs 100k.
  return points.map((p, i) => {
    // A timeout is a gap rather than a high reading: neither smoothed, nor counted
    // towards what its neighbours are compared against.
    if (p.latency === null) return p
    const near = points
      .slice(Math.max(0, i - half), i + half + 1)
      .map((x) => x.latency)
      .filter((v) => v !== null)
    const mid = median(near) ?? p.latency
    const mad = median(near.map((v) => Math.abs(v - mid))) ?? 0
    const outlier = mad > 0 && Math.abs(p.latency - mid) > sigmas * 1.4826 * mad
    return outlier ? { ...p, latency: mid } : p
  })
}

function Fact({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="truncate text-sm">{value}</dd>
    </div>
  )
}

export function NodeDetail({ node }: { node: Node }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("resources")
  // Each tab keeps its own range: a 7-day trend and a 1-hour trace answer
  // different questions.
  const [ranges, setRanges] = useState({ resources: 6, latency: 6 })
  const hours = ranges[tab]
  const [smooth, setSmooth] = useState(false)
  // Probes switched off. Hiding a slow one is what makes the fast ones readable,
  // as the axis rescales to what remains.
  const [hiddenProbes, setHiddenProbes] = useState<number[]>([])
  const [data, setData] = useState<{ metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss } | null>(null)
  // Retained rather than folded into an empty result: a refused request and an
  // empty window are different answers, and the hub has reason to refuse this one
  // -- it caps how many history windows it builds concurrently, since each holds
  // the connection the agents report through. Rendered as an empty window, a 503
  // would misdirect the reader.
  const [failed, setFailed] = useState("")
  // Where the brush has been dragged, so the axis reticks for the visible span
  // rather than retaining the whole window's ticks.
  const [zoom, setZoom] = useState<[number, number] | null>(null)
  // Where the chart begins on screen, so its height can occupy the remainder.
  const [chartTop, setChartTop] = useState(0)

  useEffect(() => {
    let active = true
    // The charts must not continue drawing the old range while the new one is in
    // flight.
    // oxlint-disable-next-line react/set-state-in-effect
    setData(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setZoom(null)
    // oxlint-disable-next-line react/set-state-in-effect
    setFailed("")
    // What this screen can resolve, in device pixels, which is the unit the line
    // is drawn in: a 1280-wide retina panel has 2560 of them for a day of minutes.
    // Read here rather than from a ref, since the hub only thins further, an
    // approximate figure suffices, and the viewport is known before layout. A
    // rotation keeps whatever it fetched with.
    //
    // The tab determines which half is requested; the other accounted for a third
    // to two thirds of every response and was never drawn.
    const points = Math.round(globalThis.innerWidth * (globalThis.devicePixelRatio || 1))
    const series = tab === "latency" ? "ping" : "metrics"
    api<{ metrics: Point[]; ping: PingPoint[]; probes: Probes; loss?: Loss }>(
      `/nodes/${node.id}/metrics?hours=${hours}&points=${points}&series=${series}`,
    )
      .then((next) => { if (active) setData(next) })
      .catch((e: Error) => {
        // `|| "..."` as in App.tsx: HTTP/2 dropped statusText, so a bodiless
        // failure from a proxy arrives as the empty string and renders as no
        // error.
        if (active) { setFailed(e.message || "网络错误"); setData({ metrics: [], ping: [], probes: {} }) }
      })
    return () => { active = false }
  }, [node.id, hours, tab])

  const m = node.metrics
  // One series per probe that reported, labelled from the names the samples
  // arrived with. Memoised, as are the two below: the node prop changes every few
  // seconds as live metrics arrive, and rebuilding the chart's data array on those
  // renders would reset the brush.
  const pingSeries = useMemo(
    () =>
      [...new Set((data?.ping ?? []).map((p) => p.task_id))]
        .map((id) => {
          // Timeouts are retained: dropping them would draw a probe losing half
          // its packets as an unbroken line, and one that never answered not at
          // all.
          const points = (data?.ping ?? []).filter((p) => p.task_id === id)
          // Taken from the hub rather than summed from the buckets above, each of
          // which is already a percentage of its own bucket, so averaging them
          // would report one lost round in thirteen as 50%. Left unrounded, since
          // `Math.round` would render 0.28% and 0.00% as the same badge, and the
          // absence of a badge denotes no loss.
          const loss = data?.loss?.[id] ?? 0
          return { id, name: data?.probes?.[id] ?? `探测 ${id}`, points, loss }
        })
        .filter((s) => s.points.length > 0),
    [data],
  )

  // The hub answers in seconds; the time axis requires milliseconds.
  const metricRows = useMemo(
    () => (data?.metrics ?? []).map((m) => ({ ...m, ts: m.ts * 1_000 })),
    [data],
  )

  // Axis tops for the two panels with no capacity to measure against. CPU and a
  // transfer rate do not express fullness: against a fixed 0-100, a machine
  // sitting at 0.4% draws as a line along the panel's floor. Memory and disk keep
  // their totals as tops, where fullness is the entire question.
  const tops = useMemo(() => {
    const max = (pick: (m: Point) => number) =>
      metricRows.reduce((hi, m) => Math.max(hi, pick(m)), 0)
    return {
      // A floor of 4%, or a machine that never exceeds 0.4% would get an axis of
      // 0-0.4 and render every scheduler blip as a peak. Capped at 100.
      cpu: axisTop(max((m) => m.cpu), 4, 10, 100),
      // Base 1024, so the steps are round in the unit `axisBytes` prints.
      rate: axisTop(max((m) => Math.max(m.net_rx, m.net_tx)), 1024, 1024),
    }
  }, [metricRows])

  const shownProbes = useMemo(
    () => pingSeries.filter((s) => !hiddenProbes.includes(s.id)),
    [pingSeries, hiddenProbes],
  )
  // Probe ids are stable across responses, so hiding, reordering or refreshing
  // another probe cannot move a line to a different colour.
  const probeColor = (id: number) => PALETTE[Math.abs(id) % PALETTE.length]

  // The hub stamps every sample with its bucket rather than the second the probe
  // finished, so probes reporting at the bucket's rate share rows instead of each
  // contributing its own: a day of four probes is 717 rows rather than 2,868. A
  // slower probe leaves gaps in its own column, which is what `connectNulls`
  // addresses.
  //
  // Every probe and both versions of every sample are held here whether or not
  // they are on screen: recharts resets the brush when the data array changes
  // identity, and re-reads a controlled selection only when the index props
  // change, which they do not. Hiding a probe or enabling despiking therefore
  // selects a `dataKey` rather than rebuilding the array.
  const pingRows = useMemo(() => {
    const rows = new Map<
      number,
      { ts: number } & Record<string, number | [number, number] | null>
    >()
    for (const s of pingSeries) {
      const smoothed = despike(s.points)
      s.points.forEach((p, i) => {
        const row = rows.get(p.ts) ?? { ts: p.ts * 1_000 }
        row[`t${s.id}`] = p.latency
        row[`s${s.id}`] = smoothed[i].latency
        row[`l${s.id}`] = p.loss ?? 0
        // Raw, never despiked: the band exists to show what the line omits, and
        // smoothing it would omit the same points.
        row[`b${s.id}`] = p.band ?? null
        rows.set(p.ts, row)
      })
    }
    return [...rows.values()].sort((a, b) => a.ts - b.ts)
  }, [pingSeries])

  const probeP90 = useMemo(() => {
    if (pingRows.length === 0) return new Map<number, number>()
    const from = pingRows[Math.min(zoom?.[0] ?? 0, pingRows.length - 1)].ts / 1_000
    const to = pingRows[Math.min(zoom?.[1] ?? pingRows.length - 1, pingRows.length - 1)].ts / 1_000
    return new Map(
      pingSeries.flatMap((series) => {
        const value = latencyP90(series.points, from, to)
        return value === undefined ? [] : [[series.id, value] as const]
      }),
    )
  }, [pingRows, pingSeries, zoom])

  // A real time axis rather than the category axis recharts defaults to: on a
  // category axis ticks are selected by index, so a period the agent was offline
  // for collapses to nothing.
  const timeAxis = (rows: { ts: number }[], from = 0, to = rows.length - 1) => ({
    dataKey: "ts",
    type: "number" as const,
    domain: ["dataMin", "dataMax"] as const,
    // Explicit, or recharts places them at 05:14 and 10:22. Any that still collide
    // are dropped by `minTickGap`.
    ticks: rows.length ? timeTicks(rows[from].ts, rows[to].ts) : undefined,
    tickFormatter: clockFor(hours),
    minTickGap: hours > 24 ? 72 : 40,
    ...AXIS,
  })

  return (
    <div className="space-y-4">
      <div className="glass-panel rounded-2xl p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
        <h2 className="truncate text-lg font-medium">{node.name}</h2>
        <Country node={node} />
        <Status node={node} />
        {node.agent_version && (
          <Badge variant="outline" className="font-normal">
            agent {node.agent_version}
          </Badge>
        )}
      </div>

      {/* One flat row of facts: what is left after the traffic figures moved
          out is one machine's spec sheet, and a box around a single topic is
          just a box. Three across at lg, two at md, one on a phone -- a kernel
          version or a CPU model needs about 270px to stay whole. */}
      <dl className="mt-4 grid gap-x-6 gap-y-3 md:grid-cols-2 lg:grid-cols-3">
        <Fact label="系统" value={[osName(node.os), node.kernel].filter(Boolean).join(" · ")} />
        <Fact
          label="CPU"
          value={node.cpu_name ? `${cpuName(node.cpu_name)} × ${node.cpu_cores}` : `${node.cpu_cores} 核`}
        />
        <Fact label="内存 / 硬盘" value={`${bytes(node.mem_total)} / ${bytes(node.disk_total)}`} />
        <Fact
          label="架构"
          value={[node.arch, node.virt !== "none" ? node.virt : "", m ? `${m.procs} 进程` : ""]
            .filter(Boolean)
            .join(" · ")}
        />
        <Fact label="今日流量" value={`↓ ${bytes(node.day_rx)} · ↑ ${bytes(node.day_tx)}`} />
        <Fact
          label="续费"
          value={[
            node.price > 0
              ? `${money(node.price, node.currency)} / ${CYCLES[node.billing_cycle] ?? node.billing_cycle}`
              : "免费",
            node.expires_at ? `${node.expires_at} 到期` : FOREVER,
          ].join(" · ")}
        />
      </dl>

      {node.remark && (
        <p className="mt-4 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap">{node.remark}</p>
      )}
      </div>

      <div className="glass-panel flex flex-wrap items-center gap-2 rounded-2xl p-2.5">
        <div className="segmented-control">
          {TABS.map((t) => (
            <Tab key={t.key} active={tab === t.key} onClick={() => setTab(t.key)}>
              {t.label}
            </Tab>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="segmented-control">
            {RANGES_FOR[tab].map((r) => (
              <Tab
                key={r.hours}
                active={hours === r.hours}
                onClick={() => setRanges((all) => ({ ...all, [tab]: r.hours }))}
              >
                {r.label}
              </Tab>
            ))}
          </div>
          {tab === "latency" && (
            <label className="flex cursor-pointer items-center gap-2 px-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={smooth}
                onChange={(e) => setSmooth(e.target.checked)}
                className="peer sr-only"
              />
              <span className="relative h-5 w-9 rounded-full bg-muted transition-colors peer-checked:bg-metric-blue/70 after:absolute after:left-0.5 after:top-0.5 after:size-4 after:rounded-full after:bg-muted-foreground after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-foreground" />
              削峰
            </label>
          )}
        </div>
      </div>

      {!data ? (
        <Skeleton className="h-40 w-full" />
      ) : failed ? (
        <p className="py-8 text-center text-sm text-destructive" role="alert">读取历史数据失败：{failed}</p>
      ) : tab === "latency" ? (
        <div className="space-y-4">
          {pingSeries.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有延迟数据</p>
          ) : (
          // An explicit pixel height on the column, so the chart can be `flex-1`
          // within it while the legend takes what it needs: four probes are one row
          // of chips on a desktop and two on a phone, so any fixed reservation is
          // wrong on one of them.
          <div
            // `+ scrollY`, because getBoundingClientRect is measured from the
            // viewport and this callback runs on every render; a live node
            // re-renders every two seconds, so a scrolled page would re-derive the
            // height from a top that has moved.
            ref={(el) => {
              if (el) setChartTop(el.getBoundingClientRect().top + scrollY)
            }}
            style={
              chartTop
                ? { height: `calc(100svh - ${Math.round(chartTop)}px - 1rem)` }
                : undefined
            }
            className="chart-panel flex min-h-[420px] flex-col gap-3 rounded-2xl p-3 sm:p-5">
            {/* `min-h-0` is what makes `flex-1` a real number rather than the
                content's own height: ResponsiveContainer reads its parent, and
                a flex child not told it may shrink reports whatever the SVG
                last was. The column above has a height in pixels, so this
                resolves at layout instead of coming back 0. */}
            <div className="min-h-0 w-full flex-1 text-muted-foreground">
              {shownProbes.length === 0 ? (
                <p className="py-8 text-center text-sm">没有选中任何探测</p>
              ) : (
                <ResponsiveContainer>
                  <ComposedChart data={pingRows}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                    <XAxis
                      {...timeAxis(
                        pingRows,
                        Math.min(zoom?.[0] ?? 0, pingRows.length - 1),
                        Math.min(zoom?.[1] ?? pingRows.length - 1, pingRows.length - 1),
                      )}
                    />
                    {/* Not anchored at zero: these lines live in a narrow band
                        far from it, and zero flattens every wobble. */}
                    <YAxis unit="ms" width={52} domain={["auto", "auto"]} {...AXIS} />
                    <Tooltip
                      labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                      // The line is drawn from what answered, so without this a
                      // bucket that lost most of its packets reads as normal.
                      // `dataKey` is `t7`/`s7`; the loss sits at `l7`.
                      formatter={(v, name, item) => {
                        const loss = Number(item?.payload?.[`l${String(item.dataKey).slice(1)}`] ?? 0)
                        return [`${Number(v)} ms${loss > 0 ? ` · 丢 ${loss}%` : ""}`, name]
                      }}
                      contentStyle={TOOLTIP_STYLE}
                    />
                    {/* Behind the line, the range that bucket's answers
                        spanned -- Smokeping's "smoke". At the day window a
                        bucket moves 63 ms at the 90th percentile against the
                        25 ms the trend moves, so a line alone draws the smaller
                        of the two.

                        Only with one probe on screen: rendered for four, the
                        bands overlap into a fog and their extremes drag the
                        axis from 165-385 out to 140-420. */}
                    {shownProbes.length === 1 &&
                      shownProbes.map((s) => (
                        <Area
                          key={`band${s.id}`}
                          dataKey={`b${s.id}`}
                          stroke="none"
                          fill={probeColor(s.id)}
                          fillOpacity={0.16}
                          isAnimationActive={false}
                          tooltipType="none"
                          legendType="none"
                          connectNulls
                        />
                      ))}
                    {shownProbes.map((s) => (
                      <Line
                        key={s.id}
                        dataKey={`${smooth ? "s" : "t"}${s.id}`}
                        name={s.name}
                        stroke={probeColor(s.id)}
                        {...SERIES}
                        connectNulls
                      />
                    ))}
                    {/* Drag either handle to zoom into a stretch of the trend. */}
                    <Brush
                      dataKey="ts"
                      height={22}
                      travellerWidth={8}
                      tickFormatter={clockFor(hours)}
                      className="fill-muted"
                      stroke="var(--color-muted-foreground)"
                      onChange={(r) => setZoom([r.startIndex ?? 0, r.endIndex ?? pingRows.length - 1])}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>

            {/* Under the chart: what it covers is picked at the top, what is
                drawn in it is picked here. Recharts paints the brush into the
                same SVG as the axis, so this is as close beneath as HTML
                sits. */}
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {pingSeries.map((s) => {
                const shown = !hiddenProbes.includes(s.id)
                const p90 = probeP90.get(s.id)
                return (
                  <button
                    key={s.id}
                    onClick={() =>
                      setHiddenProbes((h) => (shown ? [...h, s.id] : h.filter((id) => id !== s.id)))
                    }
                    style={{ borderColor: `${probeColor(s.id)}99` }}
                    className={`inline-flex items-center gap-1.5 rounded-full border bg-control px-3 py-1.5 text-xs transition-opacity ${
                      shown ? "" : "opacity-40"
                    }`}
                  >
                    {/* The swatch carries the same shade and dash as the line. */}
                    <svg width="14" height="6" className="shrink-0" aria-hidden>
                      <line
                        x1="0"
                        y1="3"
                        x2="14"
                        y2="3"
                        stroke={probeColor(s.id)}
                        strokeWidth="2"
                      />
                    </svg>
                    {s.name}
                    <span className="tabular-nums" style={{ color: getLatencyColor(p90) }}>
                      {p90 === undefined ? "—" : `${Math.round(p90)} ms`}
                    </span>
                    {/* Keep the authoritative whole-window loss beside the probe
                        label; it is intentionally not another plotted series. */}
                    <span className={`tabular-nums ${lossTone(s.loss)}`} title="丢包率">
                      {formatPacketLoss(s.loss)}%
                    </span>
                  </button>
                )
              })}
            </div>
            </div>
          )}
        </div>
      ) : data.metrics.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">这段时间没有历史数据</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel
            title="CPU"
            value={m ? (
              <span className="metric-resource-color" style={{ "--resource-color": usageColor(m.cpu) } as CSSProperties}>
                {m.cpu.toFixed(1)}%
              </span>
            ) : "—"}
            icon={Cpu}
            tone="text-metric-blue"
            border="border-metric-blue/35"
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs><UsageGradient id={`cpu-usage-gradient-${node.id}`} domainPercent={tops.cpu} /></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, tops.cpu]} ticks={quarters(tops.cpu)} unit="%" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => [`${Number(v).toFixed(1)}%`, "CPU"]}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Area
                  dataKey="cpu"
                  stroke={`url(#cpu-usage-gradient-${node.id})`}
                  fill={`url(#cpu-usage-gradient-${node.id})`}
                  fillOpacity={0.18}
                  {...SERIES}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* The axis top is the machine's memory, so the line's height is the
              fraction in use whatever range is picked. Tracking the window's
              own maximum, which is what an area chart does by default, puts
              127 MB of a 457 MB box at the top of the panel. The size is in the
              title because the axis top is claiming it. */}
          <Panel
            title="内存"
            value={m ? (
              <span
                className="metric-resource-color"
                style={{ "--resource-color": usageColor(percent(m.mem_used, m.mem_total)) } as CSSProperties}
              >
                {bytes(m.mem_used)} / {bytes(m.mem_total)}
              </span>
            ) : bytes(node.mem_total)}
            icon={MemoryStick}
            tone="text-metric-purple"
            border="border-metric-purple/35"
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs><UsageGradient id={`memory-usage-gradient-${node.id}`} domainPercent={100} /></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, node.mem_total]} ticks={quarters(node.mem_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Area
                  dataKey="mem_used"
                  name="内存"
                  stroke={`url(#memory-usage-gradient-${node.id})`}
                  fill={`url(#memory-usage-gradient-${node.id})`}
                  fillOpacity={0.16}
                  {...SERIES}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>

          {/* A rate has no total to be a fraction of, so this one climbs the
              ladder like CPU rather than pinning to a capacity. */}
          <Panel
            title="网络速率"
            value={m ? <span><span className="text-metric-green">↓ <span className={rateTone[rateSeverity(m.net_rx)]}>{rate(m.net_rx)}</span></span> · <span className="text-metric-blue">↑ <span className={rateTone[rateSeverity(m.net_tx)]}>{rate(m.net_tx)}</span></span></span> : "—"}
            icon={Network}
            tone="text-metric-green"
            border="border-metric-green/35"
          >
            <ResponsiveContainer>
              <LineChart data={metricRows}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, tops.rate]} ticks={quarters(tops.rate)} tickFormatter={axisBytes} unit="/s" width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => rate(Number(v))}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Line dataKey="net_rx" name="下行" stroke="var(--color-ok)" {...SERIES} />
                <Line dataKey="net_tx" name="上行" stroke="var(--color-chart-1)" {...SERIES} />
              </LineChart>
            </ResponsiveContainer>
          </Panel>

          {/* The disk it is filling, for the same reason as memory: a node
              using 2.7% of its disk draws along the top of the panel when the
              axis tracks the window's own maximum. */}
          <Panel
            title="硬盘"
            value={m ? (
              <span
                className="metric-resource-color"
                style={{ "--resource-color": usageColor(percent(m.disk_used, m.disk_total)) } as CSSProperties}
              >
                {bytes(m.disk_used)} / {bytes(m.disk_total)}
              </span>
            ) : bytes(node.disk_total)}
            icon={HardDrive}
            tone="text-metric-orange"
            border="border-metric-orange/35"
          >
            <ResponsiveContainer>
              <AreaChart data={metricRows}>
                <defs><UsageGradient id={`disk-usage-gradient-${node.id}`} domainPercent={100} /></defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--grid-line)" vertical={false} />
                <XAxis {...timeAxis(metricRows)} />
                <YAxis domain={[0, node.disk_total]} ticks={quarters(node.disk_total)} tickFormatter={axisBytes} width={Y_WIDTH} {...AXIS} />
                <Tooltip
                  labelFormatter={(ts) => new Date(Number(ts)).toLocaleString("zh-CN")}
                  formatter={(v) => bytes(Number(v))}
                  contentStyle={TOOLTIP_STYLE}
                />
                <Area
                  dataKey="disk_used"
                  name="硬盘"
                  stroke={`url(#disk-usage-gradient-${node.id})`}
                  fill={`url(#disk-usage-gradient-${node.id})`}
                  fillOpacity={0.14}
                  {...SERIES}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Panel>
        </div>
      )}
    </div>
  )
}
