/// <reference types="node" />
import assert from "node:assert/strict"
import { compareNodeDisplayOrder, safeNodes, type Node } from "./api.ts"
import { compareNodes, summarizeFleet, summarizeMinimalHome } from "./dashboard.ts"

const node = { id: 1, metrics: { uptime: 100, cpu: 1, load: [0.1, 0.2, 0.3],
  mem_total: 1024, mem_used: 512, swap_total: 0, swap_used: 0, disk_total: 2048, disk_used: 1024,
  net_rx: 10, net_tx: 20, total_rx: 100, total_tx: 200, month_rx: 50, month_tx: 100,
  tcp: 3, udp: 4, procs: 20 } } as Node
assert.equal(safeNodes([node])[0], node)
for (const patch of [{ load: null }, { load: [1, "bad", 3] }, { cpu: "bad" }, { net_rx: Infinity }]) {
  const bad = { ...node, metrics: { ...node.metrics, ...patch } } as unknown as Node
  const result = safeNodes([bad, node])
  assert.equal(result[0].metrics, null)
  assert.equal(result[1], node)
}

const ordered = [
  { id: 4, sort: 1, online: false },
  { id: 3, sort: 2, online: true },
  { id: 2, sort: 1, online: true },
  { id: 1, sort: 1, online: false },
].sort(compareNodeDisplayOrder)
assert.deepEqual(ordered.map(({ id }) => id), [2, 3, 1, 4])

const fleet = [
  { ...node, id: 1, name: "one", online: true, sort: 2, metrics: { ...node.metrics!, uptime: 100, cpu: 25, mem_used: 768, disk_used: 512, net_rx: 10 } },
  { ...node, id: 2, name: "two", online: true, sort: 1, metrics: { ...node.metrics!, uptime: 200, cpu: 50, mem_used: 256, disk_used: 1536, net_rx: 30 } },
  { ...node, id: 3, name: "stale", online: false, sort: 0, metrics: { ...node.metrics!, uptime: 999, cpu: 99, net_rx: 999 } },
] as Node[]
const summary = summarizeFleet(fleet)
assert.equal(summary.online, 2)
assert.equal(summary.offline, 1)
assert.equal(summary.longestUptime, 200)
assert.equal(summary.cpu?.node.name, "two")
assert.equal(summary.memory?.node.name, "one")
assert.equal(summary.disk?.node.name, "two")
assert.deepEqual([...fleet].sort(compareNodes("default")).map(({ id }) => id), [2, 1, 3])
assert.deepEqual([...fleet].sort(compareNodes("download")).map(({ id }) => id), [2, 1, 3])
assert.equal(summarizeFleet([{ ...fleet[0], online: false }]).longestUptime, null)

const makeSummaryNode = ({
  id, online = true, metrics = node.metrics, expires_at = null, total_rx = 0, total_tx = 0,
}: {
  id: number; online?: boolean; metrics?: Node["metrics"]; expires_at?: string | null; total_rx?: number; total_tx?: number
}) => ({ ...node, id, online, metrics, expires_at, total_rx, total_tx }) as Node
const localMidday = new Date(2026, 8, 25, 12).getTime()
const minimalSummary = summarizeMinimalHome([
  makeSummaryNode({ id: 1, metrics: { ...node.metrics!, cpu: 80, mem_used: 500, disk_used: 500 }, expires_at: "2026-09-25", total_rx: 100, total_tx: 200 }),
  makeSummaryNode({ id: 2, metrics: { ...node.metrics!, cpu: 10, mem_used: 900, disk_used: 500 }, expires_at: "2026-10-02", total_rx: 300, total_tx: 400 }),
  makeSummaryNode({ id: 3, metrics: null, expires_at: "2026-10-03", total_rx: 500, total_tx: 600 }),
  makeSummaryNode({ id: 4, online: false, metrics: { ...node.metrics!, cpu: 99 }, expires_at: "2026-09-28", total_rx: 700, total_tx: 800 }),
  makeSummaryNode({ id: 5, metrics: { ...node.metrics!, cpu: 79.9, mem_used: 799, disk_used: 1598 }, expires_at: "2026-09-24" }),
  makeSummaryNode({ id: 6, metrics: { ...node.metrics!, cpu: 1, mem_used: 100, disk_used: 1640 }, total_rx: 9, total_tx: 1 }),
], localMidday)
assert.equal(minimalSummary.totalNodes, 6)
assert.equal(minimalSummary.online, 5)
assert.equal(minimalSummary.highLoad, 3, "only current online CPU, memory, or disk at 80%+ count")
assert.equal(minimalSummary.expiring, 3, "today and the seventh day count; expired, eighth-day, and no-date nodes do not")
assert.equal(minimalSummary.totalTraffic, 3610, "combined traffic includes inbound and outbound totals for all nodes")
console.log("node API validation and display ordering passed")
