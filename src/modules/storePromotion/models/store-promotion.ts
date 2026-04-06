import { model } from "@medusajs/framework/utils"

const StorePromotion = model.define("store_promotion", {
  id: model.id().primaryKey(),
  title: model.text(),
  description: model.text(),
  discount_percentage: model.number(),
  start_date: model.dateTime(),
  end_date: model.dateTime(),
  is_active: model.boolean().default(true),
})

export default StorePromotion
