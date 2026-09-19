import { countryCodeToFlag, countryName, getCountryStats, getEffectiveCountry } from "./country.ts"

const equal = (got: unknown, want: unknown, label: string) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error(`${label}: 得到 ${JSON.stringify(got)}，期望 ${JSON.stringify(want)}`)
  }
}

equal(getEffectiveCountry({ country: "HK", country_auto: "HK", country_pin: "JP" }), "JP", "手动国家优先")
equal(getEffectiveCountry({ country: "HK", country_auto: "HK", country_pin: "" }), "HK", "自动国家次优先")
equal(getEffectiveCountry({ country: "US", country_auto: "", country_pin: "" }), "US", "兼容国家字段兜底")
equal(getEffectiveCountry({ country: "", country_auto: "", country_pin: "" }), null, "全部为空不返回国家")
equal(getEffectiveCountry({ country: "US", country_auto: "US", country_pin: "USA" }), null, "高优先级非法值不返回国家")
equal(getEffectiveCountry({ country: " jp ", country_auto: null }), "JP", "国家代码去空格并转大写")
equal(countryCodeToFlag("JP"), "🇯🇵", "生成日本国旗")
equal(countryCodeToFlag("jp"), "🇯🇵", "国旗转换自动转大写")
equal(countryName("HK"), "Hong Kong", "生成英文国家名")
equal(countryName("JP"), "Japan", "生成日本英文国家名")
equal(countryName("US"), "United States", "生成美国英文国家名")
equal(
  getCountryStats([
    { country: "JP" },
    { country: "HK", country_pin: "" },
    { country: "JP" },
    { country: "" },
  ]),
  [{ country: "JP", count: 2 }, { country: "HK", count: 1 }],
  "国家统计沿用节点列表顺序并忽略空国家",
)

console.log("country tests passed")
