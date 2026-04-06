import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"

export async function GET(req: MedusaRequest, res: MedusaResponse) {
  const promotionService = req.scope.resolve("storePromotion")

  const now = new Date()

  const promotions = await promotionService.listStorePromotions(
    {
      is_active: true,
    },
    {
      order: { discount_percentage: "DESC" },
    }
  )

  // Filter to only currently active promotions (within date range)
  const activePromotions = promotions.filter((promo: any) => {
    const start = new Date(promo.start_date)
    const end = new Date(promo.end_date)
    return start <= now && now <= end
  })

  return res.status(200).json({
    promotions: activePromotions,
  })
}
