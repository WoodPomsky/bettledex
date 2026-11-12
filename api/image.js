// POST /api/image  { fighter }
//   200 -> { image, mimeType }                    image is base64, never a URL
//   422 -> { error: "moderation_blocked", message } OpenAI's safety system refused
//   502 -> { error: "image_failed", message }       anything else went wrong

import { buildImagePrompt } from "./_lib/image-prompt.js";

const MAX_NAME_LENGTH = 100;
const OPENAI_IMAGES_URL = "https://api.openai.com/v1/images/generations";
const IMAGE_MODEL = "gpt-image-2";
const TIMEOUT_MS = 120_000; // image generation can take a while

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

function imageFailed(res, status = 502) {
  return res.status(status).json({
    error: "image_failed",
    message: "The court artist's ink ran dry! Fight again for a fresh sketch.",
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Use POST." });
  }

  // 1. Check the input.
  const { fighter } = readBody(req);
  if (typeof fighter !== "string" || fighter.trim().length === 0) {
    return res.status(400).json({ error: "This fighter hasn't stepped into the ring yet. Give them a name!" });
  }
  const name = fighter.trim();
  if (name.length > MAX_NAME_LENGTH) {
    return res.status(400).json({ error: `This fighter's name won't fit on the scoreboard! Keep it to ${MAX_NAME_LENGTH} characters.` });
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is not set in .env");
    return imageFailed(res, 500);
  }

  // 2. Ask OpenAI for the art. GPT image models always return base64.
  let response;
  try {
    response = await fetch(OPENAI_IMAGES_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: IMAGE_MODEL,
        prompt: buildImagePrompt(name),
        size: "1024x1024",
        quality: "medium",
        output_format: "png",
        n: 1,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error("Could not reach OpenAI:", err);
    return imageFailed(res);
  }

  const data = await response.json().catch(() => null);

  // 3. Moderation blocked is its own case, separate from other failures.
  if (!response.ok) {
    const code = data?.error?.code;
    if (code === "moderation_blocked") {
      console.warn(`Image blocked by moderation for "${name}"`);
      return res.status(422).json({
        error: "moderation_blocked",
        message: "The court artist threw down their quill and refused to draw this one!",
      });
    }
    console.error(`OpenAI image error ${response.status}:`, data?.error?.message || data);
    return imageFailed(res);
  }

  const image = data?.data?.[0]?.b64_json;
  if (typeof image !== "string" || image.length === 0) {
    console.error("OpenAI returned no image:", data);
    return imageFailed(res);
  }

  return res.status(200).json({ image, mimeType: "image/png" });
}
