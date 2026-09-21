/// <reference types="node" />
import assert from "node:assert/strict"
import { compareNodeDisplayOrder, safeNodes, type Node } from "./api.ts"

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
console.log("node API validation and display ordering passed")
