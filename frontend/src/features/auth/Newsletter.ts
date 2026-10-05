import { api } from '@api/client.ts';
import { showToast } from '@components/ui/Toast.ts';
import { getSubscriberEmail, setSubscriberEmail } from '@utils/storage.ts';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SUCCESS_PLACEHOLDER = 'Thanks — you’re on the list!';

/**
 * Newsletter sign-up.
 *
 * Posts to `POST /api/subscribers`. If the API is unreachable the address is
 * still remembered locally so the field can be pre-filled later, and the user
 * gets an honest message rather than a fake success.
 */
export function initNewsletter(): void {
  document
    .querySelectorAll<HTMLFormElement>('form.subscribe-form, form.footer-email')
    .forEach((form) => {
      const input = form.querySelector<HTMLInputElement>('input[type="email"], input');
      if (!input) return;

      // Remember a previous sign-up from this browser.
      const saved = getSubscriberEmail();
      if (saved && !input.value) input.placeholder = saved;

      form.addEventListener('submit', (event) => {
        event.preventDefault();
        void handleSubscribe(form, input);
      });
    });
}

async function handleSubscribe(form: HTMLFormElement, input: HTMLInputElement): Promise<void> {
  const email = input.value.trim();

  if (!email) {
    markInvalid(input, 'Please enter your email address.');
    return;
  }

  if (!EMAIL_PATTERN.test(email)) {
    markInvalid(input, 'That doesn’t look like a valid email address.');
    return;
  }

  clearInvalid(input);

  const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"], button');
  const originalLabel = submitButton?.textContent ?? 'Subscribe';
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Signing up…';
  }

  try {
    const result = await api.subscribers.subscribe(email);
    setSubscriberEmail(email);
    input.value = '';
    input.placeholder = SUCCESS_PLACEHOLDER;
    showToast(result.alreadySubscribed ? 'You’re already on the list 💌' : 'Welcome to the style list!');
  } catch (error) {
    console.warn('Newsletter sign-up failed:', error);
    setSubscriberEmail(email);
    input.value = '';
    input.placeholder = email;
    showToast('Saved on this device — we’ll sync your sign-up when we’re back online.');
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = originalLabel;
    }
  }
}

function markInvalid(input: HTMLInputElement, message: string): void {
  input.classList.add('invalid');
  input.setAttribute('aria-invalid', 'true');

  const field = input.closest('label') ?? input.parentElement;
  let error = field?.querySelector<HTMLDivElement>('.field-error');
  if (field && !error) {
    error = document.createElement('div');
    error.className = 'field-error';
    error.id = `${input.id || 'newsletter'}-error`;
    error.setAttribute('role', 'alert');
    field.appendChild(error);
  }
  if (error) {
    error.textContent = message;
    input.setAttribute('aria-describedby', error.id);
  }
  input.focus();
}

function clearInvalid(input: HTMLInputElement): void {
  input.classList.remove('invalid');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
  (input.closest('label') ?? input.parentElement)?.querySelector('.field-error')?.remove();
}
