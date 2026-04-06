import { MedusaService } from "@medusajs/framework/utils"
import StorePromotion from "./models/store-promotion"

class StorePromotionModuleService extends MedusaService({
  StorePromotion,
}) {}

export default StorePromotionModuleService
