export type ColorStop = readonly [number, number, number, number]

/** Percentage colours for CPU, memory, and disk utilisation. */
export const USAGE_STOPS = [
  [0, 85, 255, 99],
  [10, 78, 255, 65],
  [20, 95, 255, 46],
  [30, 118, 255, 27],
  [40, 147, 255, 7],
  [50, 178, 242, 0],
  [60, 255, 255, 0],
  [70, 255, 140, 0],
  [80, 255, 68, 0],
  [90, 255, 0, 0],
  [100, 255, 0, 0],
] as const satisfies readonly ColorStop[]

/** Load-average colours. Values at or above two are treated as critical. */
export const LOAD_STOPS = [
  [0.0, 85, 255, 99],
  [0.2, 78, 255, 65],
  [0.4, 95, 255, 46],
  [0.5, 118, 255, 27],
  [0.6, 147, 255, 7],
  [0.7, 178, 242, 0],
  [0.8, 255, 255, 0],
  [0.9, 255, 140, 0],
  [1.0, 255, 68, 0],
  [1.5, 255, 0, 0],
  [2.0, 255, 0, 0],
] as const satisfies readonly ColorStop[]

type Oklch = { l: number; c: number; h: number }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

function srgbToLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function linearToSrgb(value: number) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055
}

function rgbToOklch(rgb: readonly number[]): Oklch {
  const [r, g, b] = rgb.map((value) => srgbToLinear(value / 255))
  const l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
  const m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
  const s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
  const lRoot = Math.cbrt(l)
  const mRoot = Math.cbrt(m)
  const sRoot = Math.cbrt(s)
  const lightness = 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot
  const a = 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot
  const bValue = 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  return { l: lightness, c: Math.hypot(a, bValue), h: Math.atan2(bValue, a) }
}

function oklchToRgb({ l, c, h }: Oklch) {
  const a = c * Math.cos(h)
  const b = c * Math.sin(h)
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b
  const lLinear = lRoot ** 3
  const mLinear = mRoot ** 3
  const sLinear = sRoot ** 3
  return [
    linearToSrgb(4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear),
    linearToSrgb(-1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear),
    linearToSrgb(-0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear),
  ].map((value) => clamp(value, 0, 1) * 255)
}

function mixHue(from: number, to: number, amount: number) {
  let delta = to - from
  if (delta > Math.PI) delta -= 2 * Math.PI
  if (delta < -Math.PI) delta += 2 * Math.PI
  return from + delta * amount
}

function cssRgb(rgb: readonly number[]) {
  return `rgb(${rgb.map((value) => Math.round(clamp(value, 0, 255))).join(" ")})`
}

function stopRgb(stop: ColorStop) {
  return stop.slice(1)
}

function interpolate(stops: readonly ColorStop[], value: number) {
  if (value <= stops[0][0]) return cssRgb(stopRgb(stops[0]))
  if (value >= stops[stops.length - 1][0]) return cssRgb(stopRgb(stops[stops.length - 1]))

  const index = stops.findIndex((_, i) => value <= stops[i + 1][0])
  const from = stops[index]
  const to = stops[index + 1]
  const amount = (value - from[0]) / (to[0] - from[0])
  const fromOklch = rgbToOklch(stopRgb(from))
  const toOklch = rgbToOklch(stopRgb(to))
  const fromHue = fromOklch.c < 1e-7 ? toOklch.h : fromOklch.h
  const toHue = toOklch.c < 1e-7 ? fromOklch.h : toOklch.h
  return cssRgb(oklchToRgb({
    l: fromOklch.l + (toOklch.l - fromOklch.l) * amount,
    c: fromOklch.c + (toOklch.c - fromOklch.c) * amount,
    h: mixHue(fromHue, toHue, amount),
  }))
}

export function usageColor(percent: number) {
  return interpolate(USAGE_STOPS, clamp(percent, 0, 100))
}

export function loadColor(load: number) {
  return interpolate(LOAD_STOPS, clamp(load, 0, 2))
}

/**
 * Stops for a vertical chart gradient. `domainPercent` is the chart's visible
 * upper bound, so a CPU chart whose axis tops out at 20% still colours 20% as
 * the top of the plotted area rather than as a red 100% value.
 */
export function usageGradientStops(domainPercent: number) {
  const domain = Math.max(0.0001, Math.min(100, domainPercent))
  const values = [...new Set([
    0,
    domain,
    ...USAGE_STOPS.map(([percent]) => percent).filter((percent) => percent > 0 && percent < domain),
  ])].sort((a, b) => a - b)
  return values.map((percent) => ({
    offset: `${(percent / domain) * 100}%`,
    color: usageColor(percent),
  }))
}
