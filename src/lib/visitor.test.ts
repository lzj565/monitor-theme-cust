import { countryLabel, detectVisitorEnvironment, normalizeVisitor } from "./visitor.ts"

const complete = normalizeVisitor({
  ip: "  203.0.113.7 ",
  country_name: "China",
  country_code: "CN",
  region: "Beijing",
  city: "Beijing",
  org: "Example ISP",
})
if (complete?.ip !== "203.0.113.7" || complete.organization !== "Example ISP" || complete.countryCode !== "CN") {
  throw new Error("normalizes visitor response")
}

const edgeMobile = detectVisitorEnvironment(
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36 EdgA/151.0.0.0",
)
if (edgeMobile.device !== "手机" || edgeMobile.browser !== "Edge Mobile 151" || edgeMobile.os !== "Android 14") {
  throw new Error("detects Edge Mobile environment")
}

if (countryLabel("Japan", "JP") !== "Japan 日本") throw new Error("formats bilingual country name")

if (normalizeVisitor({ city: "Beijing" }) !== null) throw new Error("rejects missing IP")
if (normalizeVisitor(null) !== null) throw new Error("rejects invalid response")

console.log("visitor tests passed")
