// Image prompt for Battleground fighter art (Stage 4).
// Every image is built from ART_STYLE, so all fighters share one look.
// Stage 5 hardens this further (fighter names wrapped as data, not instructions).

export const ART_STYLE =
  "Vintage illustrative style of a 19th century natural history plate. " +
  "Absolutely no text, words, letters, numbers, logos, watermarks, UI elements, borders, symbols or frames of any kind. " +
  "Illustration only, nothing else on canvas.";

// The fighter is the only thing that changes between images.
export function buildImagePrompt(fighter) {
  return [
    ART_STYLE,
    `Subject: ${fighter}.`,
    "Draw only this subject. If it is a group (for example \"10 cows\"), draw the whole group together in this one image.",
  ].join("\n\n");
}
