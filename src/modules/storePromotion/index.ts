import StorePromotionModuleService from "./service"
import { Module } from "@medusajs/framework/utils"

export const STORE_PROMOTION_MODULE = "storePromotion"

export default Module(STORE_PROMOTION_MODULE, {
  service: StorePromotionModuleService,
})
