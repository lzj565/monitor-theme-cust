import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react"
import { Moon, Sun, Wrench } from "lucide-react"

import { CountryFilter } from "@/components/CountryFilter"
import { MinimalSummary } from "@/components/MinimalSummary"
import { NodeCard } from "@/components/NodeCard"
import { Summary } from "@/components/Summary"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { api, groupsOf, useNodes, type Node } from "@/lib/api"
import { getCountryStats, getEffectiveCountry } from "@/lib/country"
import { compareNodes, type NodeSortMode } from "@/lib/dashboard"
import { loadVisitor, type VisitorInfo } from "@/lib/visitor"
import { loadConfig } from "@/lib/config"
import { VisitorCard } from "@/components/VisitorCard"

// `history_days` is absent from hubs predating the hourly tier, which kept a
// week for anonymous callers.
type Me = { authed: boolean; github: boolean; site_name: string; public_page: boolean; history_days?: number }

// Split out because recharts is most of this bundle and the list page draws no
// chart. The landing page is 288 kB rather than 678 kB (95 kB gzipped against
// 207 kB), with the rest fetched immediately after it paints.
const loadDetail = () => import("@/components/NodeDetail").then((m) => ({ default: m.NodeDetail }))
const NodeDetail = lazy(loadDetail)

// `/node/{id}` is a real page: it survives a reload, can be linked to, and back
// leaves the detail view rather than the site. The hub serves index.html for any
// unknown path, so no server-side route is required.
function useNodeRoute() {
  const read = () => {
    const match = location.pathname.match(/^\/node\/(\d+)/)
    return match ? Number(match[1]) : null
  }
  const [id, setId] = useState(read)
  useEffect(() => {
    const sync = () => setId(read())
    addEventListener("popstate", sync)
    return () => removeEventListener("popstate", sync)
  }, [])
  return [
    id,
    (next: number | null) => {
      const path = next === null ? "/" : `/node/${next}`
      // The site name leads to the list from the list as well, and each repeat
      // would otherwise cost one more press of back.
      if (location.pathname !== path) history.pushState({}, "", path)
      setId(next)
      scrollTo(0, 0)
    },
  ] as const
}

function readStorage(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function writeStorage(key: string, value: string) { try { localStorage.setItem(key, value) } catch { /* Session-only preference. */ } }

const THEME_CHOICE_KEY = "theme-explicit-choice"
const THEME_DEFAULT_KEY = "theme-default-dark"

function readThemeChoice(): boolean | null {
  const choice = readStorage(THEME_CHOICE_KEY)
  if (choice === "dark") return true
  if (choice === "light") return false

  // Before explicit choices were tracked separately, the app saved its dark
  // first-visit default. A legacy light value could only come from a user toggle.
  return readStorage("theme") === "light" ? false : null
}

function useTheme() {
  const [dark, setDark] = useState(() => {
    const choice = readThemeChoice()
    return choice ?? readStorage(THEME_DEFAULT_KEY) !== "false"
  })

  // Switched with every transition held. Cards, buttons and badges fade their
  // colours over 150 ms while everything else changes at once, so a meter bar
  // already in the dark palette would vanish into a card still white.
  useEffect(() => {
    const hold = document.createElement("style")
    hold.textContent = "*,*::before,*::after{transition:none!important}"
    document.head.append(hold)
    document.documentElement.classList.toggle("dark", dark)
    void document.body.offsetWidth
    hold.remove()
  }, [dark])

  const toggleTheme = useCallback(() => {
    setDark((current) => {
      const next = !current
      const value = next ? "dark" : "light"
      writeStorage(THEME_CHOICE_KEY, value)
      writeStorage("theme", value)
      return next
    })
  }, [])

  const applyDefaultTheme = useCallback((defaultDark: boolean) => {
    writeStorage(THEME_DEFAULT_KEY, String(defaultDark))
    if (readThemeChoice() === null) setDark(defaultDark)
  }, [])

  return { dark, toggleTheme, applyDefaultTheme }
}

export default function App() {
  const { dark, toggleTheme, applyDefaultTheme } = useTheme()
  const [group, setGroup] = useState<string | null>(null)
  const [me, setMe] = useState<Me | null>(null)
  const [meError, setMeError] = useState("")
  const [config, setConfig] = useState<Record<string, unknown> | null>(null)
  const { nodes, error, closed } = useNodes()
  const [open, go] = useNodeRoute()
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)
  const [sortMode, setSortMode] = useState<NodeSortMode>("default")
  const [visitor, setVisitor] = useState<VisitorInfo | null>(null)
  const closeVisitor = useCallback(() => setVisitor(null), [])

  const loadMe = useCallback(() => {
    return api<Me>("/me")
      .then((next) => { setMe(next); setMeError("") })
      .catch((e: Error) => setMeError(e.message))
  }, [])

  useEffect(() => {
    loadMe()
    // Requested alongside /me, not after it. It never rejects: any failure
    // yields the defaults.
    void loadConfig().then(setConfig)
    // Warmed here rather than left to Suspense, which requests the chunk only
    // once a render reaches the detail view, itself waiting on /me. Without this
    // the split trades its first paint for a full-page skeleton over the first
    // node opened: 2.6s click-to-chart on 4G against 1.4s unsplit, 1.7s warm.
    void loadDetail()
  }, [loadMe])

  const minimalHome = config?.minimal_home === true
  useEffect(() => {
    if (config) applyDefaultTheme(config.default_dark !== false)
  }, [config, applyDefaultTheme])

  useEffect(() => {
    if (open !== null) return
    void loadVisitor().then(setVisitor)
  }, [open])

  // The status page was closed while this tab was open. `me` holds whatever it
  // reported at load, so it is re-queried; the effect below then directs an
  // anonymous visitor to the panel rather than leaving them on a list that
  // stopped updating with only a red line to explain it.
  useEffect(() => {
    if (closed) void loadMe()
  }, [closed, loadMe])

  useEffect(() => {
    if (me && !me.public_page && !me.authed) location.href = "/admin/"
  }, [me])

  const ordered = useMemo(
    () => [...(nodes ?? [])].sort(compareNodes("default")),
    [nodes],
  )
  const sorted = useMemo(
    () => [...ordered].sort(compareNodes(sortMode)),
    [ordered, sortMode],
  )
  const groups = groupsOf(ordered)
  const currentGroup = group !== null && (group === "" ? ordered.some((n) => !n.group) : groups.includes(group)) ? group : null
  const grouped = useMemo(() => currentGroup === null ? sorted : sorted.filter((n) => (n.group ?? "") === currentGroup), [sorted, currentGroup])
  useEffect(() => {
    // Forget groups removed by a live update, matching the upstream tab behavior.
    // oxlint-disable-next-line react/set-state-in-effect
    if (group !== currentGroup) setGroup(currentGroup)
  }, [group, currentGroup])
  const countryStats = useMemo(() => getCountryStats(grouped), [grouped])
  const filteredNodes = useMemo(
    () => selectedCountry
      ? grouped.filter((node) => getEffectiveCountry(node) === selectedCountry)
      : grouped,
    [selectedCountry, grouped],
  )
  const selected = ordered.find((n) => n.id === open)

  useEffect(() => {
    if (selectedCountry && !countryStats.some((item) => item.country === selectedCountry)) {
      // oxlint-disable-next-line react/set-state-in-effect
      setSelectedCountry(null)
    }
  }, [countryStats, selectedCountry])

  // `/node/{id}` is a page people bookmark and share, so the tab needs the node's
  // name. The site name rather than a fixed string, since the hub lets an operator
  // rename the site.
  useEffect(() => {
    document.title = [selected?.name, me?.site_name || "Monitor"].filter(Boolean).join(" · ")
  }, [selected?.name, me?.site_name])

  useEffect(() => {
    document.documentElement.classList.toggle("minimal-home", open === null && minimalHome)
    return () => document.documentElement.classList.remove("minimal-home")
  }, [minimalHome, open])

  // Only while there is nothing else to show. Once `me` has loaded, a later
  // failure belongs beside the page rather than over it.
  if (!me) return (
    <div className="grid min-h-svh place-items-center p-6 text-sm text-muted-foreground">
      {meError ? <div className="space-y-3 text-center"><p role="alert">加载失败：{meError}</p><Button onClick={loadMe}>重试</Button></div> : "加载中…"}
    </div>
  )

  // The status page is closed and nobody is signed in: redirect to the panel.
  if (!me.public_page && !me.authed) return null

  return (
    <div className={open === null
      ? minimalHome ? "min-h-svh app-home-minimal" : "min-h-svh app-home-glass"
      : "min-h-svh"}>
      <header className={open === null && minimalHome
        ? "sticky top-0 z-10 border-b border-border/70 bg-background"
        : "sticky top-0 z-10 border-b border-border/70 bg-background/72 backdrop-blur-xl"}>
        <div className="mx-auto flex max-w-[1400px] items-center gap-3 px-4 py-3 sm:px-6">
          {/* The site name is the way back to the list, so a node page needs
              no back button of its own. */}
          <button className="font-semibold transition-opacity hover:opacity-70" onClick={() => go(null)}>
            {me.site_name || "Monitor"}
          </button>
          <div className="flex-1" />
          {/* The panel is a separate app built into the hub, not part of this
              theme, so this is a navigation rather than a route. */}
          <Button variant="ghost" size="sm" asChild>
            <a href="/admin/">
              <Wrench /> {me.authed ? "进入后台" : "登录"}
            </a>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleTheme}
            title={dark ? "切换到浅色模式" : "切换到深色模式"}
            aria-label={dark ? "切换到浅色模式" : "切换到深色模式"}
          >
            {dark ? <Sun /> : <Moon />}
          </Button>
        </div>
      </header>

      <main className={open === null && minimalHome
        ? "mx-auto max-w-[1400px] space-y-4 px-4 py-4 sm:px-6"
        : "mx-auto max-w-[1400px] space-y-5 px-4 py-4 sm:px-6"}>
        {error && <p className="text-sm text-destructive">{error}</p>}

        {open !== null ? (
          !nodes ? (
            <Skeleton className="h-96" />
          ) : selected ? (
            <Suspense fallback={<Skeleton className="h-96" />}>
              <NodeDetail node={selected} historyDays={me.history_days ?? 7} />
            </Suspense>
          ) : (
            <p className="py-16 text-center text-sm text-muted-foreground">
              节点不存在或未公开。<button className="underline" onClick={() => go(null)}>返回列表</button>
            </p>
          )
        ) : !nodes || !config ? (
          <div className={minimalHome
            ? "grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-72" />
            ))}
          </div>
        ) : (
          <>
            {groups.length > 0 && <div role="group" aria-label="分组" className="flex gap-1 overflow-x-auto">
              {[null, ...groups, ...(ordered.some((n) => !n.group) ? [""] : [])].map((value) => <Button key={value === null ? "*" : `=${value}`} size="sm" variant={currentGroup === value ? "secondary" : "ghost"} aria-pressed={currentGroup === value} onClick={() => setGroup(value)}>{value === null ? "全部" : value || "未分组"}</Button>)}
            </div>}
            {config.show_summary === true && (minimalHome ? <MinimalSummary nodes={grouped} group={currentGroup} /> : <Summary nodes={grouped} group={currentGroup} />)}
            <CountryFilter
              stats={countryStats}
              selectedCountry={selectedCountry}
              onChange={setSelectedCountry}
              sortMode={sortMode}
              onSortChange={setSortMode}
            />
            {sorted.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">还没有节点</p>
            ) : filteredNodes.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">当前筛选暂无节点</p>
            ) : (
              <div className={minimalHome
                ? "grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-4"
                : "grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"}>
                {filteredNodes.map((n: Node) => (
                  <NodeCard key={n.id} node={n} onOpen={() => go(n.id)} minimal={minimalHome} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      {open === null && visitor && <VisitorCard info={visitor} onClose={closeVisitor} />}
    </div>
  )
}
