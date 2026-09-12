import { normalizeVisitor } from "./visitor.ts"

const complete = normalizeVisitor({
  ip: "  203.0.113.7 ",
  country_name: "China",
  region: "Beijing",
  city: "Beijing",
  org: "Example ISP",
})
if (complete?.ip !== "203.0.113.7" || complete.organization !== "Example ISP") {
  throw new Error("normalizes visitor response")
}

if (normalizeVisitor({ city: "Beijing" }) !== null) throw new Error("rejects missing IP")
if (normalizeVisitor(null) !== null) throw new Error("rejects invalid response")

console.log("visitor tests passed")
