import { MiddlewareRoute, validateAndTransformBody } from "@medusajs/framework/http"
import { z } from "zod"

export const SubscribeNewsletterSchema = z.object({
  email: z.string().email(),
})

export type SubscribeNewsletterSchema = z.infer<typeof SubscribeNewsletterSchema>

export const newsletterMiddlewares: MiddlewareRoute[] = [
  {
    matcher: "/store/newsletter/subscribe",
    method: "POST",
    middlewares: [validateAndTransformBody(SubscribeNewsletterSchema)],
  },
]
