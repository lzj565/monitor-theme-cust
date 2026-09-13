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

const REQUEST_TIMEOUT = 4000

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : ""
}

function version(value: string | undefined): string {
  return value?.replaceAll("_", ".") || ""
}

function readUserAgent(): string {
  return typeof navigator === "undefined" ? "" : navigator.userAgent
}

/** Parse the browser-provided environment without adding another network request. */
export function detectVisitorEnvironment(userAgent = readUserAgent()): VisitorEnvironment {
  const mobile = /Mobile|Android|iPhone|iPod/i.test(userAgent)
  const tablet = /iPad|Tablet|Android(?!.*Mobile)/i.test(userAgent)
  const device = tablet ? "平板" : mobile ? "手机" : "桌面"

  const osMatch = userAgent.match(/Android[ /]([\d.]+)/i)
    || userAgent.match(/(?:iPhone OS|CPU OS) ([\d_]+)/i)
    || userAgent.match(/Windows NT ([\d.]+)/i)
    || userAgent.match(/Mac OS X ([\d_]+)/i)
  let os = "未知"
  if (/Android/i.test(userAgent)) os = `Android ${version(osMatch?.[1])}`.trim()
  else if (/iPhone|iPad|iPod/i.test(userAgent)) os = `iOS ${version(osMatch?.[1])}`.trim()
  else if (/Windows NT/i.test(userAgent)) {
    const windows = { "10.0": "Windows 10/11", "6.1": "Windows 7" }[osMatch?.[1] ?? ""]
    os = windows ?? "Windows"
  } else if (/Mac OS X/i.test(userAgent)) os = `macOS ${version(osMatch?.[1])}`.trim()
  else if (/Linux/i.test(userAgent)) os = "Linux"

  const browserMatch = userAgent.match(/EdgA?\/([\d.]+)/i)
    || userAgent.match(/EdgiOS\/([\d.]+)/i)
    || userAgent.match(/OPR\/([\d.]+)/i)
    || userAgent.match(/FxiOS\/([\d.]+)/i)
    || userAgent.match(/Firefox\/([\d.]+)/i)
    || userAgent.match(/(?:CriOS|Chrome)\/([\d.]+)/i)
    || userAgent.match(/Version\/([\d.]+).*Safari/i)
  let browser = "未知"
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

  pending = request("https://get.geojs.io/v1/ip/geo.json")
    .then((info) => info ?? request("https://ipapi.co/json/"))
  return pending
}
