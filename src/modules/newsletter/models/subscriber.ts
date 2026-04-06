import { model } from "@medusajs/framework/utils"

const NewsletterSubscriber = model.define("newsletter_subscriber", {
  id: model.id().primaryKey(),
  email: model.text().unique(),
  subscribed_at: model.dateTime(),
})

export default NewsletterSubscriber
