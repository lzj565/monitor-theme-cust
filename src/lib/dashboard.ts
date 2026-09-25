import { compareNodeDisplayOrder, type Node } from "./api.ts"
import { daysUntil, percent } from "./format.ts"

export type NodeSortMode = "default" | "download"

export type ResourcePeak = { node: Node; value: number }

export type FleetSummary = {
  online: number
  offline: number
  longestUptime: number | null
  cpu: ResourcePeak | null
  memory: ResourcePeak | null
  disk: ResourcePeak | null
}

export type MinimalHomeSummary = {
  totalNodes: number
  online: number
  highLoad: number
  expiring: number
  totalTraffic: number
}

const HIGH_LOAD_PERCENT = 80
const EXPIRY_WINDOW_DAYS = 7

function pickPeak(nodes: Node[], value: (node: Node) => number): ResourcePeak | null {
  return nodes.reduce<ResourcePeak | null>((peak, node) => {
    const next = value(node)
    return !peak || next > peak.value ? { node, value: next } : peak
  }, null)
}

/** Current fleet values only: retained reports from offline nodes are stale. */
export function summarizeFleet(nodes: Node[]): FleetSummary {
  const live = nodes.filter((node) => node.online && node.metrics)
  return {
    online: nodes.filter((node) => node.online).length,
    offline: nodes.filter((node) => !node.online).length,
    longestUptime: live.length > 0 ? Math.max(...live.map((node) => node.metrics!.uptime)) : null,
    cpu: pickPeak(live, (node) => node.metrics!.cpu),
    memory: pickPeak(live, (node) => percent(node.metrics!.mem_used, node.metrics!.mem_total)),
    disk: pickPeak(live, (node) => percent(node.metrics!.disk_used, node.metrics!.disk_total)),
  }
}

/** Display-only totals for the compact homepage; offline reports are stale. */
export function summarizeMinimalHome(nodes: Node[], now = Date.now()): MinimalHomeSummary {
  const live = nodes.filter((node) => node.online && node.metrics)
  return {
    totalNodes: nodes.length,
    online: nodes.filter((node) => node.online).length,
    highLoad: live.filter((node) => {
      const metrics = node.metrics!
      return metrics.cpu >= HIGH_LOAD_PERCENT
        || percent(metrics.mem_used, metrics.mem_total) >= HIGH_LOAD_PERCENT
        || percent(metrics.disk_used, metrics.disk_total) >= HIGH_LOAD_PERCENT
    }).length,
    expiring: nodes.filter((node) => {
      const days = daysUntil(node.expires_at, now)
      return days !== null && days >= 0 && days <= EXPIRY_WINDOW_DAYS
    }).length,
    totalTraffic: nodes.reduce((total, node) => total + node.total_rx + node.total_tx, 0),
  }
}

export function compareNodes(sortMode: NodeSortMode) {
  return (a: Node, b: Node): number => {
    if (sortMode === "download") {
      const aLive = a.online && a.metrics !== null
      const bLive = b.online && b.metrics !== null
      if (aLive !== bLive) return aLive ? -1 : 1
      if (aLive && bLive && a.metrics!.net_rx !== b.metrics!.net_rx) {
        return b.metrics!.net_rx - a.metrics!.net_rx
      }
    }
    return compareNodeDisplayOrder(a, b)
  }
}
