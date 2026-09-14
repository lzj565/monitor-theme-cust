import {
  countryLabel, detectVisitorEnvironment, normalizeVisitor, resolveVisitorEnvironment,
} from "./visitor.ts"

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

const reducedAndroid =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/151.0.0.0 Mobile Safari/537.36 EdgA/151.0.0.0"
const highEntropyAndroid = await resolveVisitorEnvironment(reducedAndroid, {
  mobile: true,
  platform: "Android",
  getHighEntropyValues: async () => ({
    platformVersion: "16.0.0",
    fullVersionList: [
      { brand: "Not_A Brand", version: "99.0.0.0" },
      { brand: "Chromium", version: "151.0.0.0" },
      { brand: "Microsoft Edge", version: "151.0.0.0" },
    ],
  }),
})
if (highEntropyAndroid.os !== "Android 16" || highEntropyAndroid.browser !== "Edge Mobile 151") {
  throw new Error("uses high-entropy Android and Edge versions")
}

const unavailableHints = await resolveVisitorEnvironment(reducedAndroid, undefined)
if (unavailableHints.os !== "未知" || unavailableHints.browser !== "Edge Mobile 151") {
  throw new Error("does not trust a reduced Android version")
}

const failedHints = await resolveVisitorEnvironment(reducedAndroid, {
  platform: "Android",
  getHighEntropyValues: async () => { throw new Error("blocked") },
})
if (failedHints.os !== "未知") throw new Error("handles rejected client hints")

const frozenMac =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/26.0 Safari/605.1.15"
if (detectVisitorEnvironment(frozenMac).os !== "未知") {
  throw new Error("does not trust the frozen macOS user agent version")
}

const highEntropyMac = await resolveVisitorEnvironment(frozenMac, {
  platform: "macOS",
  getHighEntropyValues: async () => ({ platformVersion: "26.6.2" }),
})
if (highEntropyMac.os !== "macOS 26.6.2") throw new Error("uses exact macOS platform version hints")

const unavailableMacHints = await resolveVisitorEnvironment(frozenMac, undefined)
if (unavailableMacHints.os !== "未知") throw new Error("uses unknown for frozen macOS without hints")

const ambiguousWindows = detectVisitorEnvironment(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151.0.0.0 Safari/537.36",
)
if (ambiguousWindows.os !== "未知") throw new Error("does not map compatibility Windows versions")

const frozenIos = detectVisitorEnvironment(
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile Safari/604.1",
)
if (frozenIos.os !== "未知") throw new Error("does not trust frozen iOS user agent versions")

if (countryLabel("Japan", "JP") !== "Japan 日本") throw new Error("formats bilingual country name")

if (normalizeVisitor({ city: "Beijing" }) !== null) throw new Error("rejects missing IP")
if (normalizeVisitor(null) !== null) throw new Error("rejects invalid response")

console.log("visitor tests passed")
