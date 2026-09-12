import { quantile } from "d3-array"

export type LatencySample = {
  ts: number
  latency: number | null
}

/** P90 of the non-timeout bucket medians inside an inclusive time range. */
export function latencyP90(points: LatencySample[], from: number, to: number) {
  const values = points
    .filter((point) => point.ts >= from && point.ts <= to && point.latency !== null)
    .map((point) => point.latency as number)
  return quantile(values, 0.9)
}
