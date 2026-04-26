/**
 * Type definitions for AlgoVoi A2A skills.
 *
 * Mirrors the request/response contracts at
 * `https://api1.ilovechicken.co.uk/.well-known/agent.json`.
 */

import type { SupportedNetwork } from "./environment.js";

export type A2APart =
  | { kind: "data"; data: Record<string, unknown> }
  | { kind: "text"; text: string };

export type A2AArtifact = {
  artifactId?: string;
  name?: string;
  parts: A2APart[];
};

export type A2ATaskState =
  | "submitted"
  | "working"
  | "completed"
  | "failed"
  | "canceled";

export type A2ATask = {
  id: string;
  contextId?: string;
  status: {
    state: A2ATaskState;
    timestamp?: string;
    message?: {
      role: string;
      parts: A2APart[];
    };
  };
  artifacts?: A2AArtifact[];
};

// ---------------------------------------------------------------------------
// create-checkout
// ---------------------------------------------------------------------------

export type CreateCheckoutInput = {
  /** Amount in major fiat units, e.g. 9.99 for £9.99. Required. */
  amount: number;
  /** ISO 4217 code, e.g. "GBP", "USD", "EUR". Defaults to plugin default. */
  currency?: string;
  /** Item or order description shown to the payer. */
  label?: string;
  /** Force a specific network (e.g. "algorand_mainnet"). */
  preferred_network?: SupportedNetwork | string;
  /** URL to redirect the buyer to after successful payment. */
  redirect_url?: string;
  /** Link TTL in seconds. Default 86400 (24h). */
  expires_in_seconds?: number;
};

export type CreateCheckoutResult = {
  token: string;
  checkout_url: string;
  status: "active" | "paid" | "expired" | "cancelled";
  expires_at?: string | null;
  amount_microunits?: number;
  chain?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// verify-payment
// ---------------------------------------------------------------------------

export type VerifyPaymentInput = {
  /** Required. Network the tx was submitted to. */
  network: SupportedNetwork | string;
  /** Required. On-chain transaction id / hash / signature. */
  tx_id: string;
  /** Optional. Resource id when verifying resource-gated access. */
  resource_id?: string;
  /** Optional. Checkout token when verifying a hosted checkout payment. */
  token?: string;
  /** Optional protocol hint: "x402" | "mpp" | "ap2". */
  protocol?: "x402" | "mpp" | "ap2";
};

export type VerifyPaymentResult = {
  verified: boolean;
  tx_id?: string;
  /** JWT issued on successful verification — present when verified=true. */
  access_token?: string;
  error?: string;
};

// ---------------------------------------------------------------------------
// check-status
// ---------------------------------------------------------------------------

export type CheckStatusInput = {
  /** Required. The token returned by create-checkout. */
  token: string;
};

export type CheckStatusResult = {
  token: string;
  status: "active" | "paid" | "expired" | "cancelled";
  redirect_url?: string | null;
  error?: string;
};
