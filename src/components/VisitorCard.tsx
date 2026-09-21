import { useEffect, useRef, useState } from "react"
import { Building2, Clock3, Cpu, Globe2, MapPin, Monitor, Smartphone, X } from "lucide-react"

import { Card } from "@/components/ui/card"
import { countryCodeToFlag } from "@/lib/country"
import { countryLabel, maskVisitorIp, type VisitorInfo } from "@/lib/visitor"
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

function compactLocation(info: VisitorInfo) {
  const country = info.country || countryLabel(info.country, info.countryCode)
  return [country, info.city || info.region].filter(Boolean).join(" · ")
}

function Detail({ icon: Icon, label, value, tone }: {
  icon: typeof Globe2
  label: string
  value: string
  tone: keyof typeof DETAIL_TONES
}) {
  const displayValue = value.trim()
  if (!displayValue || /^(?:未知|unknown|n\/a|null|-)$/i.test(displayValue)) return null
  return (
    <div className="flex min-w-0 items-start gap-2 text-xs first:pr-7">
      <span className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md", DETAIL_TONES[tone])}>
        <Icon className="size-3" />
      </span>
      <span className="w-10 shrink-0 pt-0.5 text-muted-foreground">{label}</span>
      <span className="min-w-0 break-words pt-0.5 leading-4" title={displayValue}>{displayValue}</span>
    </div>
  )
}

export function VisitorCard({ info }: { info: VisitorInfo }) {
  const card = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [currentTime, setCurrentTime] = useState(() => CURRENT_TIME.format(new Date()))

  useEffect(() => {
    const update = () => setCurrentTime(CURRENT_TIME.format(new Date()))
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!expanded) return
    const collapseOnOutsidePress = (event: PointerEvent) => {
      if (!card.current?.contains(event.target as Node)) setExpanded(false)
    }
    const collapseOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false)
    }
    document.addEventListener("pointerdown", collapseOnOutsidePress)
    document.addEventListener("keydown", collapseOnEscape)
    return () => {
      document.removeEventListener("pointerdown", collapseOnOutsidePress)
      document.removeEventListener("keydown", collapseOnEscape)
    }
  }, [expanded])

  const countryCode = info.countryCode.trim().toUpperCase()
  const flag = /^[A-Z]{2}$/.test(countryCode) ? countryCodeToFlag(countryCode) : ""
  const shortLocation = compactLocation(info)

  return (
    <aside
      ref={card}
      aria-label="访客信息"
      className={cn(
        "visitor-widget fixed bottom-3 left-3 right-3 z-50 sm:bottom-6 sm:left-auto sm:right-6",
        "visitor-card-in",
      )}
    >
      {!expanded ? (
        <button
          type="button"
          aria-expanded="false"
          aria-label="展开访客信息"
          onClick={() => setExpanded(true)}
          className="visitor-card-surface visitor-card-compact flex w-full flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl px-3.5 py-2 text-left text-xs text-card-foreground sm:w-fit sm:max-w-[26.25rem]"
        >
          {shortLocation && (
            <span className="flex w-full min-w-0 items-center gap-1.5 font-medium sm:w-auto">
              {flag && <span aria-hidden="true" className="text-base leading-none">{flag}</span>}
              <span className="truncate">{shortLocation}</span>
            </span>
          )}
          <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
            <Globe2 className="size-3.5 text-metric-cyan" />
            <span className="tnum">{maskVisitorIp(info.ip)}</span>
          </span>
          {info.browser && (
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Monitor className="size-3.5 text-metric-blue" />
              <span>{info.browser.replace(/\s+\d+(?:\.\d+)*$/, "")}</span>
            </span>
          )}
        </button>
      ) : (
        <Card className="visitor-card-surface visitor-card-expanded relative gap-3 p-5 sm:p-6">
          <button
            type="button"
            aria-label="收起访客信息"
            title="收起"
            onClick={() => setExpanded(false)}
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
      )}
    </aside>
  )
}
