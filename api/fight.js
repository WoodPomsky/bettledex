// POST /api/fight  { fighter1, fighter2 }  ->  { winner, reasoning }
// Verdict only for now. Image generation is added in a later stage.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

import { JUDGE_SYSTEM_PROMPT, buildJudgeMessage } from "./_lib/judge-prompt.js";

const MAX_NAME_LENGTH = 100;

// The reply shape lives here, not in the system prompt. Structured outputs
// make Claude's reply match this schema, and parse() validates it.
const VerdictSchema = z.object({
  winner: z.string().describe("The winning fighter, copied exactly from inside its tag."),
  reasoning: z.string().describe("2 to 4 sentences explaining why the winner won."),
});

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

// Lowercase and collapse spaces, so "A  Bear" and "a bear" compare equal.
function normalise(name) {
  return name.toLowerCase().replace(/\s+/g, " ").trim();
}

// Returns an error message, or null if the name is fine.
function validateName(name, label) {
  if (typeof name !== "string" || name.trim().length === 0) return `${label} needs a name.`;
  if (name.trim().length > MAX_NAME_LENGTH) {
    return `${label} is too long (max ${MAX_NAME_LENGTH} characters).`;
  }
  return null;
}

function readBody(req) {
  if (typeof req.body === "string") {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body && typeof req.body === "object" ? req.body : {};
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  // 1. Check the inputs.
  const body = readBody(req);
  const nameError =
    validateName(body.fighter1, "Fighter 1") || validateName(body.fighter2, "Fighter 2");
  if (nameError) return res.status(400).json({ error: nameError });

  const fighter1 = body.fighter1.trim();
  const fighter2 = body.fighter2.trim();

  // 2. Ask the judge.
  let response;
  try {
    response = await client.beta.messages.parse({
      model: "claude-sonnet-5-5",
      max_tokens: 16000,
      // If a safety check declines the request, the API retries it on a
      // fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: JUDGE_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildJudgeMessage(fighter1, fighter2) }],
      output_config: {
        effort: "low", // short, simple verdicts don't need deep thinking
        format: betaZodOutputFormat(VerdictSchema),
      },
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error("Claude rate limit:", err.message);
      return res.status(503).json({ error: "The judge is swamped right now. Try again shortly." });
    }
    if (err instanceof Anthropic.APIError) {
      console.error(`Claude API error ${err.status}:`, err.message);
      return res.status(502).json({ error: "The judge didn't show up. Try again." });
    }
    console.error("Unexpected error calling Claude:", err);
    return res.status(500).json({ error: "Something went wrong. Give it another go." });
  }

  if (response.stop_reason === "refusal") {
    console.warn("Judge refused:", response.stop_details);
    return res.status(422).json({ error: "The judge refused to rule on this one. Try different fighters." });
  }

  const verdict = response.parsed_output;
  if (!verdict) {
    console.error("Could not parse verdict. stop_reason:", response.stop_reason);
    return res.status(502).json({ error: "The judge mumbled something unreadable. Try again." });
  }

  // 3. The winner must be one of the two fighters. Return the name exactly as
  // the user typed it, even if the judge changed the capitalisation.
  const winnerKey = normalise(verdict.winner);
  const winner =
    winnerKey === normalise(fighter1) ? fighter1 : winnerKey === normalise(fighter2) ? fighter2 : null;
  const reasoning = verdict.reasoning.trim();

  if (!winner || reasoning.length === 0) {
    console.error("Invalid verdict from judge:", verdict);
    return res.status(502).json({ error: "The judge's verdict made no sense. Try again." });
  }

  return res.status(200).json({ winner, reasoning });
}
