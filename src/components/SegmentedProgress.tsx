import { cn } from "@/lib/utils"

export type SegmentedProgressProps = {
  value: number
  segments?: number
  className?: string
}

const DEFAULT_SEGMENTS = 16

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

export function SegmentedProgress({ value, segments = DEFAULT_SEGMENTS, className }: SegmentedProgressProps) {
  const percent = clampPercent(value)
  const totalSegments = Math.max(1, Math.floor(segments))
  const activeSegments = Math.ceil((percent / 100) * totalSegments)

  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("flex w-full min-w-0 flex-nowrap gap-[3px]", className)}
    >
      {Array.from({ length: totalSegments }, (_, index) => (
        <span
          key={index}
          aria-hidden="true"
          className={cn(
            "h-2 min-w-0 flex-1 rounded-[2px]",
            index < activeSegments ? "bg-metric-blue" : "bg-muted/80",
          )}
        />
      ))}
    </div>
  )
}
