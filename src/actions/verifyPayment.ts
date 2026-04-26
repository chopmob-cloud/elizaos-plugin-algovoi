/**
 * VERIFY_PAYMENT — verify an on-chain transaction satisfies a payment.
 *
 * Given a network + tx_id, plus either a checkout token or a resource id,
 * AlgoVoi confirms the transaction matches the expected amount, receiver,
 * memo / reference binding, and (where relevant) asset. Returns a JWT
 * access_token on success that the agent can use to gate downstream calls.
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

const inputSchema = z
  .object({
    network: z.string().min(3),
    tx_id: z.string().min(4),
    resource_id: z.string().optional(),
    token: z.string().optional(),
    protocol: z.enum(["x402", "mpp", "ap2"]).optional(),
  })
  .refine((v) => !!(v.resource_id || v.token), {
    message: "Either resource_id or token is required",
    path: ["resource_id"],
  });

function parseFromText(text: string): z.infer<typeof inputSchema> | null {
  if (!text) return null;
  const networkMatch = text.match(
    /\b(algorand|voi|hedera|stellar|base|solana|tempo)(_(?:main|test)net|_devnet|_sepolia)?\b/i,
  );
  // tx ids are typically 32+ hex/base32/base58 chars.
  const txMatch = text.match(/\b([A-Za-z0-9]{32,128})\b/);
  const tokenMatch = text.match(/\b(?:token|checkout)[\s:=]+([A-Za-z0-9_-]{6,})\b/i);
  const resourceMatch = text.match(/\b(?:resource|resource_id)[\s:=]+([A-Za-z0-9_-]+)\b/i);
  if (!networkMatch || !txMatch) return null;

  const candidate: Record<string, unknown> = {
    network: `${networkMatch[1].toLowerCase()}${networkMatch[2] ?? "_mainnet"}`,
    tx_id: txMatch[1],
  };
  if (tokenMatch) candidate.token = tokenMatch[1];
  if (resourceMatch) candidate.resource_id = resourceMatch[1];

  const result = inputSchema.safeParse(candidate);
  return result.success ? result.data : null;
}

export const verifyPaymentAction: Action = {
  name: "VERIFY_PAYMENT",
  similes: [
    "CONFIRM_PAYMENT",
    "CHECK_TRANSACTION",
    "VERIFY_TX",
    "VALIDATE_PAYMENT",
    "AUTHENTICATE_PAYMENT",
  ],
  description:
    "Verify an on-chain crypto payment. Given a network and tx_id (plus a checkout token or resource_id for context), AlgoVoi confirms the transaction matches the expected amount, receiver, and binding. Supports x402, MPP (IETF), and AP2 (Google Agentic Payments) on Algorand, VOI, Hedera, Stellar, Base, Solana, and Tempo. Returns an access_token JWT on success.",

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
          "To verify a payment I need a network, a tx_id, and either a checkout token or a resource_id. " +
          'Try: { "network": "algorand_mainnet", "tx_id": "ABC...", "token": "uW9MJN-abc123" }',
      });
      return false;
    }

    try {
      const result = await client.verifyPayment(parsed);
      if (result.verified) {
        callback?.({
          text:
            `Payment verified on ${parsed.network}.\n` +
            `tx_id: ${parsed.tx_id}\n` +
            (result.access_token ? `access_token: ${result.access_token}` : ""),
          action: "VERIFY_PAYMENT",
          // @ts-expect-error
          metadata: {
            verified: true,
            tx_id: parsed.tx_id,
            access_token: result.access_token,
          },
        });
      } else {
        callback?.({
          text: `Payment NOT verified: ${result.error ?? "unknown error"}`,
          action: "VERIFY_PAYMENT",
          // @ts-expect-error
          metadata: { verified: false, error: result.error },
        });
      }
      return true;
    } catch (err) {
      callback?.({
        text: `Verification call failed: ${(err as Error).message}`,
      });
      return false;
    }
  },

  examples: [
    [
      {
        // @ts-expect-error
        user: "{{user1}}",
        content: {
          text: "Verify tx 7K9X...PQR on algorand_mainnet for token uW9MJN-abc123",
        },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Payment verified on algorand_mainnet. tx_id: 7K9X...PQR",
          action: "VERIFY_PAYMENT",
        },
      },
    ],
    [
      {
        // @ts-expect-error
        user: "{{user1}}",
        content: {
          text: "Did the user pay for resource premium-content on solana_mainnet (tx 5Hg...M4)?",
        },
      },
      {
        // @ts-expect-error
        user: "{{agentName}}",
        content: {
          text: "Payment verified on solana_mainnet. tx_id: 5Hg...M4",
          action: "VERIFY_PAYMENT",
        },
      },
    ],
  ],
};
