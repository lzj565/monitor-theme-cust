import { cn } from "@/lib/utils"

export type SegmentedProgressProps = {
  value: number
  segments?: number
  tone?: SegmentedProgressTone
  className?: string
}

export type SegmentedProgressTone = "blue" | "purple" | "orange" | "green" | "yellow"

const DEFAULT_SEGMENTS = 16

const tones: Record<SegmentedProgressTone, string> = {
  blue: "bg-metric-blue",
  purple: "bg-metric-purple",
  orange: "bg-metric-orange",
  green: "bg-metric-green",
  yellow: "bg-metric-yellow",
}

function clampPercent(value: number): number {
  return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0
}

export function SegmentedProgress({ value, segments = DEFAULT_SEGMENTS, tone = "blue", className }: SegmentedProgressProps) {
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
            index < activeSegments ? tones[tone] : "bg-muted/80",
          )}
        />
      ))}
    </div>
  )
}
