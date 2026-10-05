let container: HTMLDivElement | null = null;

function getContainer(): HTMLDivElement {
  if (!container) {
    container = document.querySelector('.toast-container');
    if (!container) {
      container = document.createElement('div');
      container.className = 'toast-container';
      Object.assign(container.style, {
        position: 'fixed',
        right: '1rem',
        bottom: '1rem',
        zIndex: 9999,
      });
      document.body.appendChild(container);
    }
  }
  return container;
}

export function showToast(text: string): void {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  Object.assign(el.style, {
    background: 'rgba(0,0,0,0.8)',
    color: 'white',
    padding: '0.6rem 0.9rem',
    marginTop: '0.4rem',
    borderRadius: '6px',
    fontSize: '0.95rem',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
  });

  getContainer().appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 200ms ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, 2000);
}
