/**
 * @algovoi/plugin-elizaos
 *
 * Multi-chain agent-to-agent (A2A) crypto payments for ElizaOS agents.
 * Lets an Eliza agent ask for, verify, and poll fiat-denominated
 * payments that settle as stablecoins or native assets on Algorand,
 * VOI, Hedera, Stellar, Base, Solana, or Tempo — without holding any
 * crypto, keys, or fiat itself.
 *
 * Wraps the AlgoVoi Google A2A v0.3 endpoint at
 * https://api1.ilovechicken.co.uk/.well-known/agent.json
 */

import type { Plugin } from "@elizaos/core";

import {
  createPaymentRequestAction,
  verifyPaymentAction,
  checkPaymentStatusAction,
} from "./actions/index.js";
import { algovoiProvider } from "./providers/algovoiAgent.js";

export { AlgoVoiClient } from "./client.js";
export { resolveAlgoVoiConfig, SUPPORTED_NETWORKS } from "./environment.js";
export type {
  AlgoVoiConfig,
  SupportedNetwork,
} from "./environment.js";
export type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  CheckStatusInput,
  CheckStatusResult,
} from "./types.js";

export const algovoiPlugin: Plugin = {
  name: "algovoi",
  description:
    "AlgoVoi multi-chain payments. Ask for, verify, and poll fiat-denominated crypto payments across 7 chains via the AlgoVoi A2A gateway.",
  actions: [
    createPaymentRequestAction,
    verifyPaymentAction,
    checkPaymentStatusAction,
  ],
  providers: [algovoiProvider],
  evaluators: [],
  services: [],
};

export default algovoiPlugin;
