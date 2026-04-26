/**
 * AlgoVoi A2A client.
 *
 * Thin wrapper around the Google A2A v0.3 endpoints exposed by the
 * AlgoVoi payment gateway at `<api_base>/message:send`.
 *
 * Authenticates with `Authorization: Bearer <api_key>` per the agent
 * card's `securitySchemes.apiKey` definition.
 */

import type { AlgoVoiConfig } from "./environment.js";
import type {
  CreateCheckoutInput,
  CreateCheckoutResult,
  VerifyPaymentInput,
  VerifyPaymentResult,
  CheckStatusInput,
  CheckStatusResult,
  A2APart,
  A2ATask,
} from "./types.js";

export class AlgoVoiClient {
  constructor(private readonly config: AlgoVoiConfig) {}

  /**
   * Send an A2A `message:send` request, asserting the response task
   * completed successfully and returning the result data part.
   */
  private async sendSkill<TResult>(skill: string, data: Record<string, unknown>): Promise<TResult> {
    const url = `${this.config.ALGOVOI_API_BASE}/message:send`;
    const messageId = crypto.randomUUID();

    const body = {
      message: {
        messageId,
        role: "user",
        parts: [
          {
            kind: "data",
            data: { skill, ...data },
          },
        ],
      },
    };

    let resp: Response;
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${this.config.ALGOVOI_API_KEY}`,
          "User-Agent": "@algovoi/plugin-elizaos",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`AlgoVoi network error: ${(err as Error).message}`);
    }

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `AlgoVoi API ${resp.status}: ${text || resp.statusText}`,
      );
    }

    const payload = (await resp.json()) as { task?: A2ATask };
    const task = payload.task;
    if (!task) {
      throw new Error("AlgoVoi response missing 'task' field");
    }

    const state = task.status?.state;
    if (state === "failed") {
      const messageParts = task.status?.message?.parts ?? [];
      const textPart = messageParts.find(
        (p): p is Extract<A2APart, { kind: "text" }> => p.kind === "text",
      );
      const errorText = textPart?.text ?? "task failed without error detail";
      throw new Error(`AlgoVoi skill '${skill}' failed: ${errorText}`);
    }
    if (state !== "completed") {
      throw new Error(`AlgoVoi skill '${skill}' returned unexpected state '${state}'`);
    }

    const artifactParts = task.artifacts?.[0]?.parts ?? [];
    const dataPart = artifactParts.find(
      (p): p is Extract<A2APart, { kind: "data" }> => p.kind === "data",
    );
    if (!dataPart || !dataPart.data) {
      throw new Error(`AlgoVoi skill '${skill}' completed with no data part`);
    }
    return dataPart.data as TResult;
  }

  createCheckout(input: CreateCheckoutInput): Promise<CreateCheckoutResult> {
    return this.sendSkill<CreateCheckoutResult>("create-checkout", {
      amount: input.amount,
      currency: input.currency ?? this.config.ALGOVOI_DEFAULT_CURRENCY,
      label: input.label ?? "Payment",
      preferred_network: input.preferred_network ?? this.config.ALGOVOI_DEFAULT_NETWORK,
      redirect_url: input.redirect_url,
      expires_in_seconds: input.expires_in_seconds,
    });
  }

  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    const data: Record<string, unknown> = {
      network: input.network,
      tx_id: input.tx_id,
    };
    if (input.resource_id) data.resource_id = input.resource_id;
    if (input.token) data.token = input.token;
    if (input.protocol) data.protocol = input.protocol;
    return this.sendSkill<VerifyPaymentResult>("verify-payment", data);
  }

  checkStatus(input: CheckStatusInput): Promise<CheckStatusResult> {
    return this.sendSkill<CheckStatusResult>("check-status", {
      token: input.token,
    });
  }

  /**
   * Fetch the public agent card (no auth required). Useful for
   * introspecting the deployed AlgoVoi instance's capabilities.
   */
  async fetchAgentCard(): Promise<unknown> {
    const url = `${this.config.ALGOVOI_API_BASE}/.well-known/agent.json`;
    const resp = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!resp.ok) {
      throw new Error(`Agent card fetch failed: ${resp.status}`);
    }
    return resp.json();
  }
}
