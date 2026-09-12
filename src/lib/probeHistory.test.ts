import {
  getLatencyColor, getPacketLossColor, historySlots, latestProbeSlot, probeHistoryTargets, PROBE_HISTORY,
  targetsWithData,
} from "./probeHistory.ts"

let failed = 0
function eq(got: unknown, want: unknown, what: string) {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    failed++
    console.error(`✗ ${what}\n    得到 ${JSON.stringify(got)}\n    期望 ${JSON.stringify(want)}`)
  }
}

eq(
  [PROBE_HISTORY.bucketSeconds, PROBE_HISTORY.blockCount, PROBE_HISTORY.fetchHours, PROBE_HISTORY.fetchPoints],
  [60, 60, 1, 60],
  "网络质量使用最近一小时的一分钟桶",
)

eq(
  [undefined, null, 50, 51, 100, 101, 200, 201, 300, 301, 500, 501].map(getLatencyColor),
  [
    "var(--probe-empty)", "var(--probe-timeout)", "var(--probe-green)", "var(--probe-lime)",
    "var(--probe-lime)", "var(--probe-yellow)", "var(--probe-yellow)", "var(--probe-amber)",
    "var(--probe-amber)", "var(--probe-orange)", "var(--probe-orange)", "var(--probe-red)",
  ],
  "延迟颜色边界",
)

eq(
  [undefined, 0, 1, 1.1, 5, 5.1, 10, 10.1, 20, 20.1, 50, 50.1, 99.9, 100].map(getPacketLossColor),
  [
    "var(--probe-empty)", "var(--probe-green)", "var(--probe-green)", "var(--probe-loss-lime)",
    "var(--probe-loss-lime)", "var(--probe-loss-yellow)", "var(--probe-loss-yellow)", "var(--probe-orange)",
    "var(--probe-orange)", "var(--probe-loss-orange)", "var(--probe-loss-orange)", "var(--probe-loss-red)",
    "var(--probe-loss-red)", "var(--probe-loss-total)",
  ],
  "丢包颜色边界",
)

{
  const bucket = PROBE_HISTORY.bucketSeconds
  const now = 10 * bucket + 30
  const slots = historySlots([
    { task_id: 1, ts: 8 * bucket, latency: 35 },
    { task_id: 1, ts: 9 * bucket, latency: null, loss: 100 },
    // The open bucket must never enter the strip.
    { task_id: 1, ts: 10 * bucket, latency: 20 },
  ], now, bucket, 3)
  eq(slots.map((slot) => [slot.startAt, slot.latency, slot.packetLoss]), [
    [7 * bucket, undefined, undefined],
    [8 * bucket, 35, 0],
    [9 * bucket, null, 100],
  ], "补空桶、保留 timeout、排除未完成桶")
  const timeoutTarget = probeHistoryTargets({}, [{ task_id: 1, ts: 9 * bucket, latency: null, loss: 100 }], now)
  eq(targetsWithData(timeoutTarget).length, 1, "超时属于有数据的探测")
}

{
  const bucket = PROBE_HISTORY.bucketSeconds
  const targets = probeHistoryTargets(
    { "2": "杭州电信", "1": "杭州联通" },
    [{ task_id: 1, ts: 9 * bucket, latency: 46 }],
    10 * bucket + 1,
  )
  eq(targets.map((target) => [target.id, target.name, target.current.hasData]), [
    [1, "杭州联通", true],
    [2, "杭州电信", false],
  ], "没有历史的已配置探测仍然显示")
  eq(targetsWithData(targets, 3).map((target) => target.id), [1], "先过滤无数据探测，再限制数量")
  eq(latestProbeSlot(targets[0])?.latency, 46, "取最近一个有数据的桶")
}

{
  const bucket = PROBE_HISTORY.bucketSeconds
  const targets = probeHistoryTargets(
    { "1": "空", "2": "一", "3": "二", "4": "三", "5": "四" },
    [2, 3, 4, 5].map((task_id) => ({ task_id, ts: 9 * bucket, latency: task_id * 10 })),
    10 * bucket + 1,
  )
  eq(targetsWithData(targets, 3).map((target) => target.id), [2, 3, 4], "首页取过滤后的前三个")
}

if (failed) process.exit(1)
console.log("probe history 校验通过")
