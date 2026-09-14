import { useEffect, useRef, useState } from "react"
import { Building2, Cpu, Globe2, MapPin, Smartphone, X } from "lucide-react"

import { Card } from "@/components/ui/card"
import { countryLabel, type VisitorInfo } from "@/lib/visitor"
import { cn } from "@/lib/utils"

const CURRENT_TIME = new Intl.DateTimeFormat("zh-CN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

function location(info: VisitorInfo) {
  return [countryLabel(info.country, info.countryCode), info.region, info.city].filter(Boolean).join(" · ")
}

function Detail({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 items-center gap-2 text-xs">
      <Icon className="size-3.5 shrink-0 text-metric-cyan" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate" title={value}>{value}</span>
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
        "fixed inset-x-3 bottom-3 z-30 w-auto sm:left-auto sm:right-4 sm:w-80",
        "visitor-card-in",
      )}
    >
      <Card className="relative gap-3 p-4 shadow-2xl shadow-metric-blue/10">
        <button
          type="button"
          aria-label="关闭访客信息"
          title="关闭"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="space-y-2">
          <Detail icon={Globe2} label="IP" value={info.ip} />
          <Detail icon={MapPin} label="位置" value={location(info)} />
          <Detail icon={Building2} label="运营商" value={info.organization} />
          <Detail icon={Smartphone} label="设备" value={info.device} />
          <Detail icon={Globe2} label="浏览器" value={info.browser} />
          <Detail icon={Cpu} label="系统" value={info.os} />
        </div>
        <p className="tnum border-t pt-2 text-[11px] text-muted-foreground">当前时间 {currentTime}</p>
      </Card>
    </aside>
  )
}
