/**
 * CHECK_PAYMENT_STATUS — poll a checkout token for current status.
 *
 * Pairs with CREATE_PAYMENT_REQUEST. After issuing a checkout the agent
 * holds a token; this action polls the gateway for current status:
 * `active`, `paid`, `expired`, or `cancelled`.
 */

import type {
  Action,
  HandlerCallback,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { z } from "zod";

import { AlgoVoiClient } from "../client.js";
import { resolveAlgoVoiConfig } from "../environment.js";

const inputSchema = z.object({
  token: z.string().min(6),
});

function parseFromText(text: string): z.infer<typeof inputSchema> | null {
  if (!text) return null;
  // Accept "token X", "checkout X", or a bare slug-looking string.
  const explicit = text.match(/\b(?:token|checkout)[\s:=]+([A-Za-z0-9_-]{6,})\b/i);
  if (explicit) return { token: explicit[1] };
  const bare = text.match(/\b([A-Za-z0-9]{6,12}-[A-Za-z0-9]{6,})\b/);
  if (bare) return { token: bare[1] };
  return null;
}

export const checkPaymentStatusAction: Action = {
  name: "CHECK_PAYMENT_STATUS",
  similes: [
    "POLL_PAYMENT",
    "PAYMENT_STATUS",
    "IS_PAID",
    "CHECK_CHECKOUT",
    "HAS_USER_PAID",
  ],
  description:
    "Poll a previously-issued AlgoVoi checkout token for its current payment status. Returns one of: active (waiting), paid, expired, or cancelled. Use after CREATE_PAYMENT_REQUEST to detect when the payer completes settlement on-chain.",

  validate: async (runtime: IAgentRuntime) => {
    try {
      resolveAlgoVoiConfig(runtime);
      return true;
    } catch {
      return false;
    }
  },

  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state: State | undefined,
    options: Record<string, unknown> | undefined,
    callback: HandlerCallback | undefined,
  ) => {
    const config = resolveAlgoVoiConfig(runtime);
    const client = new AlgoVoiClient(config);

    let parsed: z.infer<typeof inputSchema> | null = null;
    if (options && Object.keys(options).length > 0) {
      const result = inputSchema.safeParse(options);
      if (result.success) parsed = result.data;
    }
    if (!parsed) {
      const text =
        (message.content as { text?: string } | undefined)?.text ?? "";
      parsed = parseFromText(text);
    }

    if (!parsed) {
      callback?.({
        text:
          'I need a checkout token to look up. Try: "check payment status for token uW9MJN-abc123" ' +
          'or pass { "token": "uW9MJN-abc123" } as options.',
      });
      return false;
    }

    try {
      const result = await client.checkStatus(parsed);
      const friendly =
        result.status === "paid"
          ? `Paid. Redirect target: ${result.redirect_url ?? "(none)"}`
          : result.status === "active"
            ? "Still waiting for payment."
            : result.status === "expired"
              ? "Checkout link has expired."
              : result.status === "cancelled"
                ? "Checkout was cancelled."
                : `Unknown status: ${result.status}`;
      callback?.({
        text: `Status for token ${parsed.token}: ${result.status}\n${friendly}`,
        action: "CHECK_PAYMENT_STATUS",
        // @ts-expect-error
        metadata: result,
      });
      return true;
    } catch (err) {
      callback?.({
        text: `Status lookup failed: ${(err as Error).message}`,
      });
      return false;
    }
  },

  examples: [
    [
      {
        // @ts-expect-error
        user: "{{user1}}",
        content: { text: "Has token uW9MJN-abc123 been paid?" },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Status for token uW9MJN-abc123: paid",
          action: "CHECK_PAYMENT_STATUS",
        },
      },
    ],
    [
      {
        // @ts-expect-error
        user: "{{user1}}",
        content: { text: "What's the status of checkout Ks2pQR-xyz789?" },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Status for token Ks2pQR-xyz789: active",
          action: "CHECK_PAYMENT_STATUS",
        },
      },
    ],
  ],
};
