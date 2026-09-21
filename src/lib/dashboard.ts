import { compareNodeDisplayOrder, type Node } from "./api.ts"
import { percent } from "./format.ts"

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
