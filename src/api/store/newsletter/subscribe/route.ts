import { MedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import subscribeNewsletterWorkflow from "../../../../workflows/subscribe-newsletter"
import { SubscribeNewsletterSchema } from "./middlewares"

export async function POST(
  req: MedusaRequest<SubscribeNewsletterSchema>,
  res: MedusaResponse
) {
  const { email } = req.validatedBody

  const { result } = await subscribeNewsletterWorkflow(req.scope).run({
    input: { email },
  })

  return res.status(200).json({
    subscriber: result,
    message: "Successfully subscribed to the newsletter.",
  })
}
