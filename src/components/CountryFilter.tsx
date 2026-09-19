import { countryCodeToFlag, type CountryStat } from "@/lib/country"
import { cn } from "@/lib/utils"

type CountryFilterProps = {
  stats: CountryStat[]
  selectedCountry: string | null
  onChange: (country: string | null) => void
}

export function CountryFilter({ stats, selectedCountry, onChange }: CountryFilterProps) {
  if (stats.length === 0) return null

  return (
    <div className="country-filter" aria-label="按国家筛选">
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
  )
}
