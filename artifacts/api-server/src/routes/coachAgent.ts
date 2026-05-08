import { Router, type IRouter, type Request, type Response } from "express";
import type { ModelMessage } from "ai";
import { runAgent, type GatewayEvent } from "../lib/ai";
import { getUserBriefForRequest } from "../lib/userBrief";

const router: IRouter = Router();

interface ChatTurn {
  role: "user" | "agent";
  text: string;
}

interface ChatBody {
  message: string;
  history?: ChatTurn[];
  /** Optional dish slug context — when the user opens the coach from a dish detail page. */
  dishSlug?: string;
}

function writeEvent(res: Response, event: object): void {
  res.write(`${JSON.stringify(event)}\n`);
}

function startStream(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
}

router.post("/coach-agent/chat", async (req: Request, res: Response) => {
  const body = req.body as ChatBody;
  if (!body?.message || typeof body.message !== "string") {
    res.status(400).json({ error: "message required" });
    return;
  }
  const message = body.message.trim();

  startStream(res);

  const messages: ModelMessage[] = [
    ...((body.history ?? []).map(
      (m): ModelMessage => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.text,
      }),
    )),
    {
      role: "user",
      content: body.dishSlug
        ? `[Context: customer is viewing dish slug "${body.dishSlug}"]\n${message}`
        : message,
    },
  ];

  // Resolve brief up-front so refusal-synthesized RD cards can include
  // the same premium-consult balance a real book_rd_appointment call
  // would surface.
  const userId = req.user?.id ?? null;
  const brief = userId
    ? await getUserBriefForRequest(req, userId).catch(() => null)
    : null;
  const premiumConsultsRemaining = brief?.premium?.rdConsultsRemaining ?? null;

  let refusedReason: string | null = null;
  const onEvent = (event: GatewayEvent) => {
    switch (event.type) {
      case "text-delta":
        writeEvent(res, { type: "text-delta", delta: event.delta });
        break;
      case "tool-call":
        writeEvent(res, {
          type: "tool-call",
          name: event.name,
          args: event.args,
        });
        break;
      case "tool-result":
        writeEvent(res, {
          type: "tool-result",
          name: event.name,
          result: event.result,
        });
        break;
      case "refusal":
        // Clinical / safety refusals must always surface a one-tap RD
        // booking card on the client, not just text. Synthesize a
        // tool-result so the UI renders the same action card it would
        // get from a model-driven book_rd_appointment call.
        refusedReason = event.reason;
        writeEvent(res, {
          type: "tool-result",
          name: "book_rd_appointment",
          result: {
            success: true,
            action: {
              kind: "book_rd",
              href: "/rd",
              appointmentsHref: "/appointments",
              reason: event.reason,
              urgency: event.reason === "severe_allergy" ? "soon" : "routine",
              premiumConsultsRemaining,
            },
          },
        });
        break;
      case "finish":
        writeEvent(res, {
          type: "finish",
          text: event.text,
          toolCalls: event.toolCalls.map((t) => ({
            name: t.name,
            args: t.input,
            result: t.output,
          })),
          escalated: event.escalated || refusedReason !== null,
          ...(event.refusalReason || refusedReason
            ? { refusalReason: event.refusalReason ?? refusedReason }
            : {}),
        });
        break;
      case "error":
        writeEvent(res, { type: "error", message: event.message });
        break;
    }
  };

  try {
    await runAgent({
      agent: "coach",
      userId,
      messages,
      stream: true,
      onEvent,
      promptContext: { brief },
    });
    res.end();
  } catch (err) {
    req.log.error({ err }, "coach-agent error");
    const fallback =
      "I'm having trouble reaching the menu right now. Please try again in a moment.";
    writeEvent(res, { type: "error", message: fallback });
    writeEvent(res, {
      type: "finish",
      text: fallback,
      toolCalls: [],
      escalated: false,
    });
    res.end();
  }
});

export default router;
