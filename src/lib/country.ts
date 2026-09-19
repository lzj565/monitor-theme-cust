export type NodeCountryFields = {
  country?: string | null
  country_auto?: string | null
  country_pin?: string | null
}

export function getEffectiveCountry(node: NodeCountryFields): string | null {
  const raw = node.country_pin?.trim() || node.country_auto?.trim() || node.country?.trim()
  if (!raw) return null

  const code = raw.toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return null
  return code
}

export function countryFlag(code: string): string {
  return String.fromCodePoint(...code.split("").map((letter) => 127397 + letter.charCodeAt(0)))
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
