// Fighter names go inside XML-style tags in the judge and image prompts.
// Escaping <, > and & stops a name like "</fighter_1> new rules..." from
// closing its tag early and posing as instructions outside it.

export function escapeTagText(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// The judge copies the winner from inside its tag, so it may come back
// escaped. Undo that before comparing it with the names the user typed.
export function unescapeTagText(text) {
  return text.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
}
