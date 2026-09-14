import { useEffect, useRef, useState } from "react"
import { Building2, Clock3, Cpu, Globe2, MapPin, Smartphone, X } from "lucide-react"

import { Card } from "@/components/ui/card"
import { countryLabel, type VisitorInfo } from "@/lib/visitor"
import { cn } from "@/lib/utils"

const CURRENT_TIME = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

const DETAIL_TONES = {
  cyan: "bg-metric-cyan/12 text-metric-cyan",
  pink: "bg-metric-pink/12 text-metric-pink",
  orange: "bg-metric-orange/12 text-metric-orange",
  purple: "bg-metric-purple/12 text-metric-purple",
  blue: "bg-metric-blue/12 text-metric-blue",
  green: "bg-metric-green/12 text-metric-green",
} as const

function location(info: VisitorInfo) {
  return [countryLabel(info.country, info.countryCode), info.region, info.city].filter(Boolean).join(" · ")
}

function Detail({ icon: Icon, label, value, tone }: {
  icon: typeof Globe2
  label: string
  value: string
  tone: keyof typeof DETAIL_TONES
}) {
  if (!value) return null
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs first:pr-7">
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", DETAIL_TONES[tone])}>
        <Icon className="size-3" />
      </span>
      <span className="w-10 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words pt-0.5 leading-4" title={value}>{value}</span>
    </div>
  )
}

export function VisitorCard({ info, onClose }: { info: VisitorInfo; onClose: () => void }) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remaining = useRef(10000)
  const started = useRef(0)
  const [currentTime, setCurrentTime] = useState(() => CURRENT_TIME.format(new Date()))

  useEffect(() => {
    const update = () => setCurrentTime(CURRENT_TIME.format(new Date()))
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const start = () => {
      started.current = Date.now()
      timeout.current = setTimeout(onClose, remaining.current)
    }
    start()
    return () => { if (timeout.current) clearTimeout(timeout.current) }
  }, [onClose])

  const pause = () => {
    if (!timeout.current) return
    clearTimeout(timeout.current)
    timeout.current = null
    remaining.current = Math.max(0, remaining.current - (Date.now() - started.current))
  }

  const resume = () => {
    if (timeout.current || remaining.current <= 0) return
    started.current = Date.now()
    timeout.current = setTimeout(onClose, remaining.current)
  }

  return (
    <aside
      aria-label="访客信息"
      onPointerEnter={pause}
      onPointerLeave={resume}
      className={cn(
        "fixed bottom-3 right-3 z-30 w-fit min-w-60 max-w-[calc(100vw-1.5rem)] sm:right-4 sm:max-w-[22rem]",
        "visitor-card-in",
      )}
    >
      <Card className="visitor-card-surface relative gap-3 p-4">
        <button
          type="button"
          aria-label="关闭访客信息"
          title="关闭"
          onClick={onClose}
          className="absolute right-2.5 top-2.5 rounded-md p-1 text-muted-foreground transition-colors hover:bg-metric-pink/12 hover:text-metric-pink"
        >
          <X className="size-4" />
        </button>
        <div className="space-y-1.5">
          <Detail icon={Globe2} label="IP" value={info.ip} tone="cyan" />
          <Detail icon={MapPin} label="位置" value={location(info)} tone="pink" />
          <Detail icon={Building2} label="运营商" value={info.organization} tone="orange" />
          <Detail icon={Smartphone} label="设备" value={info.device} tone="purple" />
          <Detail icon={Globe2} label="浏览器" value={info.browser} tone="blue" />
          <Detail icon={Cpu} label="系统" value={info.os} tone="green" />
        </div>
        <div className="flex items-center gap-2 border-t pt-2.5 text-[11px] text-muted-foreground">
          <span className="grid size-5 shrink-0 place-items-center rounded-md bg-metric-yellow/12 text-metric-yellow">
            <Clock3 className="size-3" />
          </span>
          <span>当前时间</span>
          <span className="tnum rounded-full bg-metric-yellow/10 px-2 py-0.5 font-medium text-metric-yellow">
            {currentTime}
          </span>
        </div>
      </Card>
    </aside>
  )
}
