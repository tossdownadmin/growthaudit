/**
 * Final sanity filter for competitors shown in customer reports.
 * Discovery can be broad. Presentation must be selective.
 */

export type CompetitorQuality = {
  fitScore: number
  classification: "direct" | "alternative" | "market"
  reason: string
  keep: boolean
}

function words(value: any) {
  return String(value || "").toLowerCase()
}

export function scoreCompetitorQuality(target: any, competitor: any): CompetitorQuality {
  const t = words(`${target?.name} ${target?.primaryType} ${target?.types}`)
  const c = words(`${competitor?.name} ${competitor?.primaryType} ${competitor?.types}`)

  let score = 0
  const reasons: string[] = []

  const sameCuisine =
    ["burger","shawarma","bbq","barbecue","pakistani","indian","mexican","pizza","thai","mediterranean","kabob"]
      .some(x => t.includes(x) && c.includes(x))

  if (sameCuisine) {
    score += 35
    reasons.push("similar food category")
  }

  if (competitor?.distanceMi != null && Number(competitor.distanceMi) <= 3) {
    score += 15
    reasons.push("local customer overlap")
  }

  if (competitor?.priceLevel && target?.priceLevel &&
      competitor.priceLevel === target.priceLevel) {
    score += 10
    reasons.push("similar price position")
  }

  if ((competitor?.reviewCount || 0) > 100) {
    score += 10
    reasons.push("proven local demand")
  }

  // Universal engine fit if available
  score += Math.min(30, Number(competitor?.fitScore || competitor?.threatScore || 0) * .3)

  const fitScore = Math.round(Math.min(100, score))

  return {
    fitScore,
    classification: fitScore >= 80 ? "direct" : fitScore >= 65 ? "alternative" : "market",
    reason: reasons.length ? reasons.join(", ") : "limited customer substitution evidence",
    keep: fitScore >= 65,
  }
}
