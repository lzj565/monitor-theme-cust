export type VisitorInfo = {
  ip: string
  country: string
  region: string
  city: string
  organization: string
}

const VISITOR_SEEN = "monitor-theme:visitor-card-seen"
const REQUEST_TIMEOUT = 4000

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 120) : ""
}

/** Keep third-party response shapes out of the UI and discard unusable data. */
export function normalizeVisitor(value: unknown): VisitorInfo | null {
  if (!value || typeof value !== "object") return null
  const data = value as Record<string, unknown>
  const info = {
    ip: text(data.ip),
    country: text(data.country || data.country_name),
    region: text(data.region),
    city: text(data.city),
    organization: text(data.organization_name || data.organization || data.org),
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

/** Load at most one visitor record per browser session. */
export function loadVisitor(): Promise<VisitorInfo | null> {
  if (pending) return pending
  try {
    if (sessionStorage.getItem(VISITOR_SEEN) === "1") return Promise.resolve(null)
    sessionStorage.setItem(VISITOR_SEEN, "1")
  } catch {
    // Storage can be disabled. The in-memory promise still prevents duplicate
    // requests while this document is alive.
  }

  pending = request("https://get.geojs.io/v1/ip/geo.json")
    .then((info) => info ?? request("https://ipapi.co/json/"))
  return pending
}
