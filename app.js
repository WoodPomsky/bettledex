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

// Show exactly one view and hide all the others.
function showView(name) {
  views.forEach((view) => {
    view.hidden = view.dataset.view !== name;
  });
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
  if (name.length === 0) return `${label} needs a name.`;
  if (name.length > MAX_NAME_LENGTH) return `${label} is too long (max ${MAX_NAME_LENGTH} characters).`;
  return null;
}

function showError(message) {
  errorMessage.textContent = message || 'Something went wrong. Give it another go.';
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
    throw new Error("Couldn't reach the arena. Check your connection and try again.");
  }

  const data = await response.json().catch(() => ({}));

  if (response.status === 429) {
    throw new Error(data.error || 'Whoa, slow down! Wait a minute and try again.');
  }
  if (!response.ok) {
    throw new Error(data.error || 'Something went wrong. Give it another go.');
  }
  return data;
}

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
  showView('loading');

  try {
    const verdict = await requestVerdict(fighter1, fighter2);
    resultWinner.textContent = verdict.winner;
    resultMatchup.textContent = `${fighter1} vs ${fighter2}`;
    resultReasoning.textContent = verdict.reasoning;
    showView('result');
  } catch (error) {
    showError(error.message);
  } finally {
    fightButton.disabled = false;
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

showView('form');
