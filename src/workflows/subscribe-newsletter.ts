import {
  createWorkflow,
  WorkflowResponse,
} from "@medusajs/framework/workflows-sdk"
import { subscribeNewsletterStep } from "./steps/subscribe-newsletter"

type SubscribeNewsletterInput = {
  email: string
}

const subscribeNewsletterWorkflow = createWorkflow(
  "subscribe-newsletter",
  function (input: SubscribeNewsletterInput) {
    const subscriber = subscribeNewsletterStep(input)

    return new WorkflowResponse(subscriber)
  }
)

export default subscribeNewsletterWorkflow
