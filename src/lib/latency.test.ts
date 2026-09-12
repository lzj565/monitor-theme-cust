import assert from "node:assert/strict"
import { latencyP90 } from "./latency.ts"

const points = [
  { ts: 1, latency: 10 },
  { ts: 2, latency: 20 },
  { ts: 3, latency: null },
  { ts: 4, latency: 40 },
  { ts: 5, latency: 50 },
]

assert.equal(latencyP90(points, 1, 5), 47, "超时不参与整段 P90")
assert.equal(latencyP90(points, 2, 4), 38, "只统计可见时间范围")
assert.equal(latencyP90([{ ts: 1, latency: null }], 1, 1), undefined, "全超时没有 P90")

console.log("latency P90 校验通过")
