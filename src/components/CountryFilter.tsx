import { ArrowDown, Check, Settings2 } from "lucide-react"
import { DropdownMenu } from "radix-ui"

import { Button } from "@/components/ui/button"
import { countryCodeToFlag, type CountryStat } from "@/lib/country"
import type { NodeSortMode } from "@/lib/dashboard"
import { cn } from "@/lib/utils"

type CountryFilterProps = {
  stats: CountryStat[]
  selectedCountry: string | null
  onChange: (country: string | null) => void
  sortMode: NodeSortMode
  onSortChange: (mode: NodeSortMode) => void
}

export function CountryFilter({ stats, selectedCountry, onChange, sortMode, onSortChange }: CountryFilterProps) {
  if (stats.length === 0) return null

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <div className="country-filter min-w-0 flex-1" aria-label="按国家筛选">
        {stats.map(({ country, count }) => {
          const active = selectedCountry === country
          return (
            <button
              key={country}
              type="button"
              aria-pressed={active}
              className={cn("country-filter-item", active && "is-active")}
              onClick={() => onChange(active ? null : country)}
            >
              <span className="country-filter-flag" aria-hidden="true">{countryCodeToFlag(country)}</span>
              <span className="country-filter-code">{country}</span>
              <span className="country-filter-count">{count}</span>
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn("sort-status", sortMode === "download" && "is-active")}
          title={sortMode === "download" ? "恢复默认排序" : undefined}
          onClick={() => sortMode === "download" && onSortChange("default")}
        >
          {sortMode === "download" ? <>下载速度 <ArrowDown /></> : "默认排序"}
        </button>
        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <Button variant="ghost" size="icon-sm" title="视图选项" aria-label="视图选项">
              <Settings2 />
            </Button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content className="sort-menu" align="end" sideOffset={6}>
              <DropdownMenu.Label className="sort-menu-label">排序方式</DropdownMenu.Label>
              <SortItem active={sortMode === "default"} onSelect={() => onSortChange("default")}>默认排序</SortItem>
              <SortItem active={sortMode === "download"} onSelect={() => onSortChange("download")}>下载速度</SortItem>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </div>
  )
}

function SortItem({ active, onSelect, children }: {
  active: boolean
  onSelect: () => void
  children: React.ReactNode
}) {
  return (
    <DropdownMenu.Item className="sort-menu-item" onSelect={onSelect}>
      <span className="size-4">{active && <Check className="size-4" />}</span>
      {children}
      {children === "下载速度" && <ArrowDown className="ml-auto size-3.5 text-muted-foreground" />}
    </DropdownMenu.Item>
  )
}
