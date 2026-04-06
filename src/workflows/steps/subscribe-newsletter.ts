import { createStep, StepResponse } from "@medusajs/framework/workflows-sdk"
import { MedusaError } from "@medusajs/framework/utils"

type SubscribeNewsletterInput = {
  email: string
}

export const subscribeNewsletterStep = createStep(
  "subscribe-newsletter",
  async (input: SubscribeNewsletterInput, { container }) => {
    const newsletterService = container.resolve("newsletter")

    // Check for existing subscriber
    const existing = await newsletterService.listNewsletterSubscribers({
      email: input.email,
    })

    if (existing.length > 0) {
      throw new MedusaError(
        MedusaError.Types.DUPLICATE_ERROR,
        `Email ${input.email} is already subscribed.`
      )
    }

    const subscriber = await newsletterService.createNewsletterSubscribers({
      email: input.email,
      subscribed_at: new Date(),
    })

    return new StepResponse(subscriber, subscriber.id)
  },
  async (id: string, { container }) => {
    if (!id) return
    const newsletterService = container.resolve("newsletter")
    await newsletterService.deleteNewsletterSubscribers(id)
  }
)
