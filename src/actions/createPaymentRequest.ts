/**
 * CREATE_PAYMENT_REQUEST — generates a hosted AlgoVoi checkout link.
 *
 * This action lets an Eliza agent ask the user (or another agent) for a
 * payment of a specified fiat amount, settled on any of AlgoVoi's
 * supported chains. The user gets a checkout URL they can open in a
 * browser; the agent gets a `token` it can poll later via CHECK_PAYMENT_STATUS.
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
  amount: z.number().positive(),
  currency: z.string().length(3).optional(),
  label: z.string().max(120).optional(),
  preferred_network: z.string().optional(),
  redirect_url: z.string().url().optional(),
  expires_in_seconds: z.number().int().positive().optional(),
});

/**
 * Best-effort fallback parser when the LLM doesn't supply a structured
 * options blob. Pulls amount/currency/network from message text using
 * a tolerant regex set.
 */
function parseFromText(text: string): z.infer<typeof inputSchema> | null {
  if (!text) return null;
  // Currency symbols and ISO codes
  const symbolMap: Record<string, string> = { "£": "GBP", "$": "USD", "€": "EUR" };
  const symbolMatch = text.match(/([£$€])\s*(\d+(?:\.\d{1,2})?)/);
  const isoMatch = text.match(/(\d+(?:\.\d{1,2})?)\s*(GBP|USD|EUR|JPY|AUD|CAD|CHF|NZD)\b/i);
  let amount: number | undefined;
  let currency: string | undefined;
  if (symbolMatch) {
    amount = parseFloat(symbolMatch[2]);
    currency = symbolMap[symbolMatch[1]];
  } else if (isoMatch) {
    amount = parseFloat(isoMatch[1]);
    currency = isoMatch[2].toUpperCase();
  }
  if (amount === undefined || !Number.isFinite(amount)) return null;

  const networkMatch = text.match(
    /\b(algorand|voi|hedera|stellar|base|solana|tempo)(_(?:main|test)net)?\b/i,
  );
  const preferred_network = networkMatch
    ? `${networkMatch[1].toLowerCase()}${networkMatch[2] ?? "_mainnet"}`
    : undefined;

  return inputSchema.parse({ amount, currency, preferred_network });
}

export const createPaymentRequestAction: Action = {
  name: "CREATE_PAYMENT_REQUEST",
  similes: [
    "CREATE_CHECKOUT",
    "REQUEST_PAYMENT",
    "GENERATE_PAYMENT_LINK",
    "INVOICE",
    "BILL",
    "ASK_FOR_PAYMENT",
  ],
  description:
    "Create a hosted AlgoVoi checkout link for a fiat amount. Returns a URL the payer can open in any browser, plus a token the agent can poll for payment status. Settles on Algorand, VOI, Hedera, Stellar, Base, Solana, or Tempo via stablecoin or native asset.",

  validate: async (runtime: IAgentRuntime, _message: Memory) => {
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

    if (!parsed || !parsed.amount) {
      const errText =
        "I need an amount and currency to create a payment request. " +
        "Try: 'create a payment request for £9.99' or pass " +
        '{ "amount": 9.99, "currency": "GBP" } as options.';
      callback?.({ text: errText });
      return false;
    }

    try {
      const result = await client.createCheckout(parsed);
      const symbol =
        parsed.currency === "GBP"
          ? "£"
          : parsed.currency === "USD"
            ? "$"
            : parsed.currency === "EUR"
              ? "€"
              : `${parsed.currency ?? config.ALGOVOI_DEFAULT_CURRENCY} `;
      const replyText =
        `Payment request created: ${symbol}${parsed.amount.toFixed(2)}\n` +
        `Pay here: ${result.checkout_url}\n` +
        `Token (for polling): ${result.token}` +
        (result.expires_at ? `\nExpires at: ${result.expires_at}` : "");
      callback?.({
        text: replyText,
        action: "CREATE_PAYMENT_REQUEST",
        // @ts-expect-error — eliza Memory.content allows arbitrary keys for tool output
        metadata: {
          token: result.token,
          checkout_url: result.checkout_url,
          status: result.status,
          chain: result.chain,
          amount_microunits: result.amount_microunits,
        },
      });
      return true;
    } catch (err) {
      callback?.({
        text: `Could not create the payment request: ${(err as Error).message}`,
      });
      return false;
    }
  },

  examples: [
    [
      {
        // @ts-expect-error — Eliza example messages allow free-form user names
        user: "{{user1}}",
        content: { text: "Send me a payment request for £9.99" },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Payment request created: £9.99\nPay here: https://api1.ilovechicken.co.uk/p/uW9MJN-abc123",
          action: "CREATE_PAYMENT_REQUEST",
        },
      },
    ],
    [
      {
        // @ts-expect-error
        user: "{{user1}}",
        content: { text: "Invoice the customer 49.50 USD on Solana mainnet" },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Payment request created: $49.50\nPay here: https://api1.ilovechicken.co.uk/p/Ks2pQR-xyz789",
          action: "CREATE_PAYMENT_REQUEST",
        },
      },
    ],
  ],
};
