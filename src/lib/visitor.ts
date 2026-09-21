export type VisitorInfo = {
  ip: string
  country: string
  countryCode: string
  region: string
  city: string
  organization: string
  device: string
  browser: string
  os: string
}

export type VisitorEnvironment = Pick<VisitorInfo, "device" | "browser" | "os">

type UserAgentBrand = { brand: string; version: string }

export type UserAgentDataLike = {
  mobile?: boolean
  platform?: string
  brands?: UserAgentBrand[]
  getHighEntropyValues?: (hints: string[]) => Promise<{
    platformVersion?: string
    fullVersionList?: UserAgentBrand[]
  }>
}

const REQUEST_TIMEOUT = 4000

function text(value: unknown): string {
  if (typeof value !== "string") return ""
  const normalized = value.trim().slice(0, 120)
  return /^(?:未知|unknown|n\/a|null|-)$/i.test(normalized) ? "" : normalized
}

function version(value: string | undefined): string {
  return value?.replaceAll("_", ".") || ""
}

function readUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

function readUserAgentData(): UserAgentDataLike | undefined {
  if (typeof navigator === "undefined") return undefined
  return (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData
}

/** Parse the browser-provided environment without adding another network request. */
export function detectVisitorEnvironment(userAgent = readUserAgent()): VisitorEnvironment {
  const mobile = /Mobile|iPhone|iPod|Android.*Mobile/i.test(userAgent)
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)
  const desktop = /Windows NT|Macintosh|Mac OS X|X11|CrOS|Linux/i.test(userAgent)
  const device = tablet ? "平板" : mobile ? "手机" : desktop ? "桌面" : ""

  const androidVersion = userAgent.match(/Android[ /]([\d.]+)/i)?.[1]
  let os = ""
  if (/Android/i.test(userAgent) && !/Android 10; K(?:[;)])/i.test(userAgent) && androidVersion) {
    os = `Android ${version(androidVersion)}`
  } else if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) os = "Linux"

  const browserMatch = userAgent.match(/EdgA?\/([\d.]+)/i)
    || userAgent.match(/EdgiOS\/([\d.]+)/i)
    || userAgent.match(/OPR\/([\d.]+)/i)
    || userAgent.match(/FxiOS\/([\d.]+)/i)
    || userAgent.match(/Firefox\/([\d.]+)/i)
    || userAgent.match(/(?:CriOS|Chrome)\/([\d.]+)/i)
    || userAgent.match(/Version\/([\d.]+).*Safari/i)
  let browser = ""
  if (/EdgA\//i.test(userAgent)) browser = "Edge Mobile"
  else if (/EdgiOS\//i.test(userAgent)) browser = "Edge iOS"
  else if (/Edg\//i.test(userAgent)) browser = "Edge"
  else if (/OPR\//i.test(userAgent)) browser = "Opera"
  else if (/FxiOS\//i.test(userAgent)) browser = "Firefox iOS"
  else if (/Firefox\//i.test(userAgent)) browser = "Firefox"
  else if (/CriOS\//i.test(userAgent)) browser = "Chrome iOS"
  else if (/Chrome\//i.test(userAgent)) browser = "Chrome"
  else if (/Safari\//i.test(userAgent)) browser = "Safari"
  if (browserMatch) browser += ` ${browserMatch[1].split(".")[0]}`

  return { device, browser, os }
}

function browserFromBrands(brands: UserAgentBrand[], mobile: boolean): string {
  const candidates = [
    { pattern: /Microsoft Edge/i, name: mobile ? "Edge Mobile" : "Edge" },
    { pattern: /Google Chrome/i, name: "Chrome" },
    { pattern: /Opera/i, name: "Opera" },
    { pattern: /^Chromium$/i, name: "Chromium" },
  ]
  for (const candidate of candidates) {
    const match = brands.find(({ brand }) => candidate.pattern.test(brand))
    if (match) return `${candidate.name} ${match.version.split(".")[0]}`
  }
  return ""
}

function trustedPlatformVersion(value: string | undefined): string {
  const parts = value?.split(".") ?? []
  return parts.length > 0 && parts.length <= 3
    && parts.every((part) => /^\d+$/.test(part)) && Number(parts[0]) > 0
    ? parts.join(".") : ""
}

/** Use exact platform hints when available; never present reduced UA versions as real OS versions. */
export async function resolveVisitorEnvironment(
  userAgent = readUserAgent(),
  userAgentData = readUserAgentData(),
): Promise<VisitorEnvironment> {
  const fallback = detectVisitorEnvironment(userAgent)
  const android = /Android/i.test(userAgent) || userAgentData?.platform === "Android"
  const macOS = /Mac OS X/i.test(userAgent) || userAgentData?.platform === "macOS"
  const windows = /Windows NT/i.test(userAgent) || userAgentData?.platform === "Windows"
  const ios = /iPhone|iPad|iPod/i.test(userAgent) || userAgentData?.platform === "iOS"
  const needsTrustedVersion = android || macOS || windows || ios
  if (!userAgentData?.getHighEntropyValues) {
    return needsTrustedVersion ? { ...fallback, os: "" } : fallback
  }

  try {
    const values = await userAgentData.getHighEntropyValues(["platformVersion", "fullVersionList"])
    const platformVersion = trustedPlatformVersion(values.platformVersion)
    const os = android && platformVersion
      ? `Android ${platformVersion.split(".")[0]}`
      : macOS && platformVersion ? `macOS ${platformVersion}`
      : needsTrustedVersion ? "" : fallback.os
    const browser = browserFromBrands(
      values.fullVersionList ?? userAgentData.brands ?? [],
      userAgentData.mobile ?? fallback.device === "手机",
    ) || fallback.browser
    return { ...fallback, browser, os }
  } catch {
    return needsTrustedVersion ? { ...fallback, os: "" } : fallback
  }
}

export function countryLabel(country: string, countryCode: string): string {
  const code = countryCode.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(code)) return country
  try {
    const localized = new Intl.DisplayNames(["zh-CN"], { type: "region" }).of(code)
    if (localized && country && localized !== country) return `${country} ${localized}`
    if (localized) return localized
  } catch {
    // Fall back to the provider's name when the runtime lacks this locale data.
  }
  return country || code
}

/** Hide the identifying middle of an address while keeping it recognizable. */
export function maskVisitorIp(value: string): string {
  const ip = value.trim()
  const ipv4 = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.***.${ipv4[4]}`

  if (ip.includes(":")) {
    const groups = ip.split(":").filter(Boolean)
    if (groups.length >= 3) return `${groups.slice(0, 2).join(":")}:***:${groups.at(-1)}`
  }

  return "***"
}

/** Keep third-party response shapes out of the UI and discard unusable data. */
export function normalizeVisitor(value: unknown, userAgent = readUserAgent()): VisitorInfo | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  const environment = detectVisitorEnvironment(userAgent)
  const info = {
    ip: text(data.ip),
    country: text(data.country || data.country_name),
    countryCode: text(data.country_code || data.countryCode).toUpperCase(),
    region: text(data.region),
    city: text(data.city),
    organization: text(data.organization_name || data.organization || data.org),
    ...environment,
  }
  return info.ip ? info : null
}

async function request(url: string): Promise<VisitorInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) return null
    return normalizeVisitor(await response.json())
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

let pending: Promise<VisitorInfo | null> | null = null

/** Load at most one visitor record per page load. */
export function loadVisitor(): Promise<VisitorInfo | null> {
  if (pending) return pending

  const environment = resolveVisitorEnvironment()
  pending = request("https://get.geojs.io/v1/ip/geo.json")
    .then((info) => info ?? request("https://ipapi.co/json/"))
    .then(async (info) => info ? { ...info, ...await environment } : null)
  return pending
}
