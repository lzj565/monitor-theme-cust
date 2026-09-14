import { useEffect, useRef } from "react"
import { Building2, Cpu, Globe2, MapPin, Smartphone, Wifi, X } from "lucide-react"

import { Card } from "@/components/ui/card"
import { countryLabel, type VisitorInfo } from "@/lib/visitor"
import { cn } from "@/lib/utils"

function location(info: VisitorInfo) {
  return [countryLabel(info.country, info.countryCode), info.region, info.city].filter(Boolean).join(" · ")
}

function Detail({ icon: Icon, label, value }: { icon: typeof Globe2; label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex min-w-0 items-center gap-1.5 text-[11px]">
      <Icon className="size-3 shrink-0 text-metric-cyan" />
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="truncate" title={value}>{value}</span>
    </div>
  )
}

export function VisitorCard({ info, onClose }: { info: VisitorInfo; onClose: () => void }) {
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const remaining = useRef(10000)
  const started = useRef(0)

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
        "fixed inset-x-3 bottom-3 z-30 w-auto sm:left-4 sm:right-auto sm:w-72",
        "visitor-card-in",
      )}
    >
      <Card className="relative gap-2 p-3 shadow-2xl shadow-metric-blue/10">
        <button
          type="button"
          aria-label="关闭访客信息"
          title="关闭"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
        </button>
        <div className="flex items-center gap-1.5 pr-5">
          <span className="grid size-7 place-items-center rounded-full bg-metric-cyan/12 text-metric-cyan">
            <Wifi className="size-3.5" />
          </span>
          <div>
            <p className="text-xs font-medium">
              {info.country ? `欢迎来自 ${countryLabel(info.country, info.countryCode)} 的访客` : "欢迎访问"}
            </p>
            <p className="text-[10px] text-muted-foreground">检测到您的网络位置</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t pt-2">
          <Detail icon={Globe2} label="IP" value={info.ip} />
          <Detail icon={MapPin} label="位置" value={location(info)} />
          <Detail icon={Building2} label="运营商" value={info.organization} />
          <Detail icon={Smartphone} label="设备" value={info.device} />
          <Detail icon={Globe2} label="浏览器" value={info.browser} />
          <Detail icon={Cpu} label="系统" value={info.os} />
        </div>
        <p className="text-[9px] leading-tight text-muted-foreground">位置根据 IP 估算，仅供参考</p>
      </Card>
    </aside>
  )
}
