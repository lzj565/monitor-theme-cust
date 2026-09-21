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
      <button
        type="button"
        className={cn("sort-status shrink-0", sortMode === "download" && "is-active")}
        aria-label={sortMode === "download" ? "当前按下载速度从高到低排序，点击恢复默认排序" : "当前为默认排序，点击按下载速度从高到低排序"}
        onClick={() => onSortChange(sortMode === "default" ? "download" : "default")}
      >
        {sortMode === "download" ? "实时网速" : "默认排序"}
      </button>
    </div>
  )
}
