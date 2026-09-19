export type NodeCountryFields = {
  country?: string | null
  country_auto?: string | null
  country_pin?: string | null
}

export type CountryStat = {
  country: string
  count: number
}

export function getEffectiveCountry(node: NodeCountryFields): string | null {
  const raw = node.country_pin?.trim() || node.country_auto?.trim() || node.country?.trim()
  if (!raw) return null

  const code = raw.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  return code
}

export function countryCodeToFlag(code: string): string {
  return String.fromCodePoint(...code.toUpperCase().split("").map((letter) => 127397 + letter.charCodeAt(0)))
}

export function getCountryStats(nodes: NodeCountryFields[]): CountryStat[] {
  const counts = new Map<string, number>()
  for (const node of nodes) {
    const country = getEffectiveCountry(node)
    if (!country) continue
    counts.set(country, (counts.get(country) ?? 0) + 1)
  }
  return [...counts].map(([country, count]) => ({ country, count }))
}

const COUNTRY_NAME_OVERRIDES: Record<string, string> = {
  HK: "Hong Kong",
  MO: "Macao",
}

export function countryName(code: string): string {
  try {
    return COUNTRY_NAME_OVERRIDES[code]
      ?? new Intl.DisplayNames(["en"], { type: "region" }).of(code)
      ?? code
  } catch {
    return code
  }
}
