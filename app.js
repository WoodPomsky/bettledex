const MAX_NAME_LENGTH = 100;

const views = document.querySelectorAll('[data-view]');
const form = document.getElementById('fight-form');
const fightButton = form.querySelector('button[type="submit"]');
const fighter1Input = document.getElementById('fighter1');
const fighter2Input = document.getElementById('fighter2');
const formError = document.getElementById('form-error');

const resultWinner = document.getElementById('result-winner');
const resultMatchup = document.getElementById('result-matchup');
const resultReasoning = document.getElementById('result-reasoning');
const errorMessage = document.getElementById('error-message');
// The result page shows the winner and the loser in fixed places.
const winnerSlot = document.querySelector('[data-art-slot="winner"]');
const loserSlot = document.querySelector('[data-art-slot="loser"]');
const artSlots = [winnerSlot, loserSlot];
const loadingNames = [
  document.getElementById('loading-fighter1'),
  document.getElementById('loading-fighter2'),
];

const GENERIC_ERROR = 'Something went sideways in the arena! Dust yourself off and step back into the ring.';

const ART_MESSAGES = {
  blocked: 'The court artist threw down their quill and refused to draw this one!',
  failed: "The court artist's ink ran dry! Fight again for a fresh sketch.",
};

// Rotating phrases on the loading screen, which covers both the judge and the
// artist. The list is reshuffled every fight.
const LOADING_PHRASES = [
  'Sharpening claws...',
  'Consulting the ancient scrolls...',
  'Polishing the championship belt...',
  'Checking the tale of the tape...',
  'Weighing in the contenders...',
  'Stretching hamstrings...',
  'Rehearsing victory poses...',
  'Calculating snack-based stamina...',
  'Reviewing the instant replay...',
  'Bribing the referee... kidding!',
  'Sweeping up after the last bout...',
  'Ringing the bell...',
  'Sharpening the quills...',
  'Mixing the inks...',
  'Asking the fighter to hold still...',
  'Consulting a field guide...',
  'Shading the menacing bits...',
  'Pressing the plate...',
];

const PHRASE_INTERVAL_MS = 2200;

// Each fight gets a number, so late images from an earlier fight are ignored.
let currentFight = 0;
let imageController = null;

function shuffled(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function setPhrase(element, text) {
  element.textContent = text;
  // Restart the fade-in animation for each new phrase.
  element.classList.remove('phrase-in');
  void element.offsetWidth;
  element.classList.add('phrase-in');
}

// Cycles an element through the phrases in random order. Returns a stop function.
function startPhrases(element, phrases) {
  const order = shuffled(phrases);
  let index = 0;
  setPhrase(element, order[0]);
  const timer = setInterval(() => {
    index = (index + 1) % order.length;
    setPhrase(element, order[index]);
  }, PHRASE_INTERVAL_MS);
  return () => {
    clearInterval(timer);
    element.classList.remove('phrase-in');
  };
}

const loadingText = document.querySelector('.loading-text');
let stopLoadingPhrases = null;

// Show exactly one view and hide all the others.
function showView(name) {
  views.forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });

  // The loading phrases only run while the loading view is showing.
  stopLoadingPhrases?.();
  stopLoadingPhrases = name === 'loading' ? startPhrases(loadingText, LOADING_PHRASES) : null;

  // The header button opens the BattleDex, and becomes "Back" while it's open.
  const inDex = name === 'battledex';
  dexLabel.textContent = inDex ? 'Back' : 'BattleDex';
  dexCount.hidden = inDex;
}

function showFormError(message, input) {
  formError.textContent = message;
  formError.hidden = false;
  if (input) {
    input.setAttribute('aria-invalid', 'true');
    input.focus();
  }
}

function clearFormError() {
  formError.hidden = true;
  formError.textContent = '';
  fighter1Input.removeAttribute('aria-invalid');
  fighter2Input.removeAttribute('aria-invalid');
}

// Returns an error message, or null if the name is fine.
function validateName(name, label) {
  if (name.length === 0) return `${label} hasn't stepped into the ring yet. Give them a name!`;
  if (name.length > MAX_NAME_LENGTH) return `${label}'s name won't fit on the scoreboard! Keep it to ${MAX_NAME_LENGTH} characters.`;
  return null;
}

function showError(message) {
  errorMessage.textContent = message || GENERIC_ERROR;
  showView('error');
}

// Calls the judge. Resolves to { winner, reasoning }, or throws an Error whose
// message is safe to show the user.
async function requestVerdict(fighter1, fighter2) {
  let response;
  try {
    response = await fetch('/api/fight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fighter1, fighter2 }),
    });
  } catch {
    throw new Error("We can't reach the arena! Check your connection and step back into the ring.");
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || GENERIC_ERROR);
  }
  return data;
}

// Asks for one fighter's art. Never throws. Resolves to one of:
//   { state: 'ready', src }   { state: 'blocked', message }   { state: 'failed', message }
async function requestImage(fighter, signal) {
  try {
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fighter }),
      signal,
    });
    const data = await response.json().catch(() => ({}));

    if (response.ok && typeof data.image === 'string') {
      return { state: 'ready', src: `data:${data.mimeType || 'image/png'};base64,${data.image}` };
    }
    if (data.error === 'moderation_blocked') {
      return { state: 'blocked', message: data.message || ART_MESSAGES.blocked };
    }
    return { state: 'failed', message: data.message || ART_MESSAGES.failed };
  } catch {
    return { state: 'failed', message: ART_MESSAGES.failed };
  }
}

// ---------------------------------------------------------------------------
// Image compression (Stage 7)
// ---------------------------------------------------------------------------

const COMPRESS_MAX_SIZE = 512; // px, longest side
const COMPRESS_TARGET_BYTES = 100 * 1024;
// Tried in order until the image is under the target size.
const COMPRESS_QUALITIES = [0.8, 0.65, 0.5, 0.35];
const COMPRESS_FAILED_MESSAGE = 'The art got crumpled on its way to the BattleDex! Try saving again.';

// Decoded size of a base64 data URL, in bytes.
function dataUrlBytes(dataUrl) {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  return Math.floor((base64.length * 3) / 4) - padding;
}

function formatKB(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`;
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(COMPRESS_FAILED_MESSAGE));
    img.src = src;
  });
}

// Browsers that can't encode WebP silently return a PNG instead.
let webpSupported;
function canEncodeWebp() {
  if (webpSupported === undefined) {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 1;
    webpSupported = probe.toDataURL('image/webp').startsWith('data:image/webp');
  }
  return webpSupported;
}

// Takes an image (a base64 data URL), shrinks it to at most 512px on its
// longest side, and re-encodes it as WebP (JPEG if WebP isn't supported),
// lowering the quality until it's under ~100 KB. Resolves to a data URL.
async function compressImage(src) {
  const img = await loadImage(src);
  const scale = Math.min(1, COMPRESS_MAX_SIZE / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(COMPRESS_FAILED_MESSAGE);
  // White background, so a JPEG fallback doesn't turn transparent areas black.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const type = canEncodeWebp() ? 'image/webp' : 'image/jpeg';
  let result;
  let quality;
  for (quality of COMPRESS_QUALITIES) {
    result = canvas.toDataURL(type, quality);
    if (dataUrlBytes(result) <= COMPRESS_TARGET_BYTES) break;
  }

  console.info(
    `[compress] ${formatKB(dataUrlBytes(src))} -> ${formatKB(dataUrlBytes(result))} ` +
      `(${img.naturalWidth}x${img.naturalHeight} -> ${width}x${height}, ${type}, quality ${quality})`,
  );
  return result;
}

// ---------------------------------------------------------------------------
// BattleDex storage (Stage 8)
// One versioned localStorage key: { version: 1, fighters: [{ id, name, nameKey, image, createdAt }] }
// ---------------------------------------------------------------------------

const DEX_KEY = 'battleground.battledex';
const DEX_VERSION = 1;
const DEX_FULL_MESSAGE = 'The BattleDex is packed to the rafters! Delete a fighter to make room for a new champion.';
const DEX_UNAVAILABLE_MESSAGE = 'The BattleDex doors are locked! Your browser may be blocking storage.';

// "  Angry   GOOSE " -> "angry goose"
function toNameKey(name) {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function newId() {
  return crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isValidFighter(f) {
  return (
    f && typeof f.id === 'string' && typeof f.name === 'string' &&
    typeof f.nameKey === 'string' && typeof f.image === 'string' &&
    typeof f.createdAt === 'string'
  );
}

// Returns the saved fighters. Missing, unreadable or unknown-version data reads as empty.
function loadDex() {
  try {
    const raw = localStorage.getItem(DEX_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (data?.version !== DEX_VERSION || !Array.isArray(data.fighters)) return [];
    return data.fighters.filter(isValidFighter);
  } catch {
    return [];
  }
}

function isQuotaError(error) {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

// Writes the whole list. Throws an Error whose message is safe to show the user.
function writeDex(fighters) {
  try {
    localStorage.setItem(DEX_KEY, JSON.stringify({ version: DEX_VERSION, fighters }));
  } catch (error) {
    throw new Error(isQuotaError(error) ? DEX_FULL_MESSAGE : DEX_UNAVAILABLE_MESSAGE);
  }
}

// Puts one art slot into a state: loading, ready, blocked or failed.
function setArt(slot, name, { state, src, message }) {
  const img = slot.querySelector('.art-image');
  const status = slot.querySelector('.art-status');
  slot.dataset.state = state;
  slot.dataset.fighter = name;
  slot.querySelector('.art-name').textContent = name;

  status.textContent = message || ART_MESSAGES[state] || '';

  if (state === 'ready') {
    img.src = src;
    img.alt = `Art of ${name}`;
    img.hidden = false;
  } else {
    img.removeAttribute('src');
    img.alt = '';
    img.hidden = true;
  }
  refreshSaveButtons();
}

// ---------------------------------------------------------------------------
// BattleDex UI (Stage 8)
// ---------------------------------------------------------------------------

const dexButton = document.querySelector('[data-action="toggle-dex"]');
const dexLabel = dexButton.querySelector('.dex-label');
const dexCount = document.getElementById('dex-count');
const dexList = document.getElementById('dex-list');
const dexEmpty = document.getElementById('dex-empty');
const dexStatus = document.getElementById('dex-status');
const saveStatus = document.getElementById('save-status');
let viewBeforeDex = 'form';

function setStatus(element, message) {
  element.textContent = message || '';
  element.hidden = !message;
}

// Each Save button only shows once its art has arrived, and reads "Saved"
// if a fighter with the same nameKey is already in the BattleDex.
function refreshSaveButtons(fighters = loadDex()) {
  const savedKeys = new Set(fighters.map((f) => f.nameKey));
  artSlots.forEach((slot) => {
    const button = slot.querySelector('[data-action="save"]');
    const ready = slot.dataset.state === 'ready';
    button.hidden = !ready;
    if (!ready || slot.dataset.saving) return;
    const saved = savedKeys.has(toNameKey(slot.dataset.fighter));
    button.disabled = saved;
    button.textContent = saved ? 'Saved ✓' : 'Save to BattleDex';
  });
}

// Each card leans a little, cycling through these angles.
const DEX_TILTS = [-1.2, 1, 0.7, -0.8];

function renderDex(fighters) {
  dexEmpty.hidden = fighters.length > 0;
  // Specimen numbers count up in the order fighters were saved (oldest is No. 001),
  // but the newest are shown first.
  const oldestFirst = [...fighters].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const numbered = oldestFirst.map((fighter, i) => ({ fighter, no: String(i + 1).padStart(3, '0') }));
  const newestFirst = numbered.reverse();
  dexList.replaceChildren(
    ...newestFirst.map(({ fighter, no }, i) => {
      const item = document.createElement('li');
      item.className = 'dex-item';
      item.style.setProperty('--tilt', `${DEX_TILTS[i % DEX_TILTS.length]}deg`);

      const img = document.createElement('img');
      img.className = 'dex-image';
      img.src = fighter.image;
      img.alt = `Art of ${fighter.name}`;
      img.loading = 'lazy';

      const meta = document.createElement('p');
      meta.className = 'dex-meta';
      const label = document.createElement('span');
      label.textContent = 'Specimen';
      const number = document.createElement('span');
      number.textContent = `No. ${no}`;
      meta.append(label, number);

      const name = document.createElement('p');
      name.className = 'dex-name';
      name.textContent = fighter.name;

      const date = document.createElement('p');
      date.className = 'dex-date';
      date.textContent = `Saved ${new Date(fighter.createdAt).toLocaleDateString()}`;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-delete';
      remove.dataset.action = 'delete';
      remove.dataset.id = fighter.id;
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${fighter.name}`);

      item.append(img, meta, name, date, remove);
      return item;
    }),
  );
}

// Re-reads storage and updates everything that shows BattleDex data.
function refreshDex() {
  const fighters = loadDex();
  dexCount.textContent = fighters.length;
  refreshSaveButtons(fighters);
  renderDex(fighters);
}

async function saveFighter(slot) {
  const button = slot.querySelector('[data-action="save"]');
  // Capture these now: a new fight could replace the slot while we compress.
  const name = slot.dataset.fighter;
  const src = slot.querySelector('.art-image').src;

  setStatus(saveStatus, '');
  slot.dataset.saving = 'true';
  button.disabled = true;
  button.textContent = 'Saving...';

  try {
    const image = await compressImage(src);
    const fighters = loadDex();
    const nameKey = toNameKey(name);
    if (!fighters.some((f) => f.nameKey === nameKey)) {
      fighters.push({ id: newId(), name, nameKey, image, createdAt: new Date().toISOString() });
      writeDex(fighters);
    }
  } catch (error) {
    setStatus(saveStatus, error.message || DEX_UNAVAILABLE_MESSAGE);
  } finally {
    delete slot.dataset.saving;
    refreshDex();
  }
}

function deleteFighter(id) {
  const fighters = loadDex();
  const fighter = fighters.find((f) => f.id === id);
  if (!fighter) return refreshDex();
  if (!confirm(`Delete ${fighter.name} from your BattleDex?`)) return;

  setStatus(dexStatus, '');
  try {
    writeDex(fighters.filter((f) => f.id !== id));
  } catch (error) {
    setStatus(dexStatus, error.message);
  }
  refreshDex();
}

function currentView() {
  return [...views].find((view) => !view.hidden)?.dataset.view;
}

// Opens the BattleDex, or goes back to wherever you came from if it's already open.
function toggleDex() {
  const from = currentView();
  if (from === 'loading') return;
  if (from === 'battledex') return showView(viewBeforeDex);
  viewBeforeDex = from || 'form';
  setStatus(dexStatus, '');
  refreshDex();
  showView('battledex');
}

artSlots.forEach((slot) => {
  slot.querySelector('[data-action="save"]').addEventListener('click', () => saveFighter(slot));
});

dexList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action="delete"]');
  if (button) deleteFighter(button.dataset.id);
});

dexButton.addEventListener('click', toggleDex);

// Keep this tab in sync if the BattleDex changes in another tab.
window.addEventListener('storage', (event) => {
  if (event.key === DEX_KEY || event.key === null) refreshDex();
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (fightButton.disabled) return; // a fight is already in progress
  clearFormError();

  const fighter1 = fighter1Input.value.trim();
  const fighter2 = fighter2Input.value.trim();

  const error1 = validateName(fighter1, 'Fighter 1');
  if (error1) return showFormError(error1, fighter1Input);

  const error2 = validateName(fighter2, 'Fighter 2');
  if (error2) return showFormError(error2, fighter2Input);

  fightButton.disabled = true;
  dexButton.disabled = true; // don't leave the loading view mid-fight
  setStatus(saveStatus, '');
  loadingNames[0].textContent = fighter1;
  loadingNames[1].textContent = fighter2;
  showView('loading');

  // Start a new fight and drop any images still loading from the last one.
  const fightId = ++currentFight;
  imageController?.abort();
  imageController = new AbortController();

  // Ask for the verdict and both images at the same time, and stay on the
  // loading screen until all three are back. requestImage never throws, so
  // only a failed verdict rejects, and that shows the error straight away.
  const fighters = [fighter1, fighter2];
  const imageRequests = fighters.map((name) => requestImage(name, imageController.signal));

  try {
    const [verdict, ...images] = await Promise.all([
      requestVerdict(fighter1, fighter2),
      ...imageRequests,
    ]);
    if (fightId !== currentFight) return;
    // The server returns the winner exactly as typed. For identical names, fighter 1 wins.
    const winnerIndex = verdict.winner === fighter1 ? 0 : 1;
    const loserIndex = 1 - winnerIndex;
    setArt(winnerSlot, fighters[winnerIndex], images[winnerIndex]);
    setArt(loserSlot, fighters[loserIndex], images[loserIndex]);
    resultWinner.textContent = verdict.winner;
    resultMatchup.textContent = `${fighter1} vs ${fighter2}`;
    resultReasoning.textContent = verdict.reasoning;
    showView('result');
  } catch (error) {
    if (fightId !== currentFight) return;
    imageController.abort(); // no verdict, so the art isn't needed
    showError(error.message);
  } finally {
    if (fightId === currentFight) {
      fightButton.disabled = false;
      dexButton.disabled = false;
    }
  }
});

// Clear the error message as soon as the user starts fixing it.
[fighter1Input, fighter2Input].forEach((input) => {
  input.addEventListener('input', clearFormError);
});

// "Fight again" / "Try again" go back to the form.
document.querySelectorAll('[data-action="restart"]').forEach((button) => {
  button.addEventListener('click', () => {
    showView('form');
    fighter1Input.focus();
  });
});

// Handy for testing views from the browser console in Stage 1,
// e.g. showError('Test error') or showView('loading').
window.showView = showView;
window.showError = showError;
// Stage 7 testing, e.g. compressImage(document.querySelector('.art-image').src)
window.compressImage = compressImage;

refreshDex();
showView('form');
