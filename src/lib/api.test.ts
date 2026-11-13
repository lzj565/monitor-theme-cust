/// <reference types="node" />
import assert from "node:assert/strict"
import { compareNodes, summarizeFleet, summarizeMinimalHome } from "./dashboard.ts"
import { compareNodeDisplayOrder, api, groupsOf, safeNodes, sample, speedHistory, type Node } from "./api.ts"

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
console.log("invalid live reports are isolated")

// Tabs follow the node order; ungrouped nodes and a hub without the field add none.
assert.deepEqual(groupsOf([{ group: "东京" }, { group: "" }, {}, { group: "香港" }, { group: "东京" }]), ["东京", "香港"])
console.log("groups follow the node order")

// Each group keeps its own throughput line beside the fleet's, and a group that
// empties stops being tracked.
const live = (group: string, rx: number) => ({ ...node, group, online: true, metrics: { ...node.metrics!, net_rx: rx, net_tx: 0 } }) as Node
sample([live("东京", 5), live("", 7), { ...live("东京", 9), online: false }])
assert.deepEqual([speedHistory.get(null)?.at(-1)?.rx, speedHistory.get("东京")?.at(-1)?.rx, speedHistory.get("")?.at(-1)?.rx], [12, 5, 7])
sample([live("", 1)])
assert.equal(speedHistory.has("东京"), false)
// A group may be named anything, the fleet's own key included.
sample([live("*", 5), live("", 7)])
assert.deepEqual([speedHistory.get(null)?.at(-1)?.rx, speedHistory.get("*")?.at(-1)?.rx], [12, 5])
console.log("throughput is kept per group")

// A timeout is retried, since the next attempt may take a live connection; a
// read cut off by it reads as a network failure, never as the browser's message.
{
  let calls = 0
  const timeout = () => new DOMException("signal timed out", "TimeoutError")
  globalThis.fetch = async () => {
    if (++calls < 3) throw timeout()
    return { ok: true, status: 200, json: async () => ({ nodes: [] }) } as unknown as Response
  }
  assert.deepEqual(await api("/nodes"), { nodes: [] })
  assert.equal(calls, 3)
  globalThis.fetch = async () => {
    throw timeout()
  }
  await assert.rejects(api("/nodes"), { status: 0, message: "网络连接失败，稍后再试" })
  globalThis.fetch = async () =>
    ({ ok: false, status: 503, headers: new Headers({ "content-type": "text/plain" }), text: async () => { throw new DOMException("aborted", "AbortError") } }) as unknown as Response
  await assert.rejects(api("/nodes"), { status: 0 })
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse("<html>") }) as unknown as Response
  await assert.rejects(api("/nodes"), { status: 200, message: "收到的不是状态数据，稍后再试" })
  console.log("timeouts are retried and read as network failures")
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
