import { defineMiddlewares } from "@medusajs/framework/http"
import { newsletterMiddlewares } from "./store/newsletter/subscribe/middlewares"

export default defineMiddlewares({
  routes: [...newsletterMiddlewares],
})
