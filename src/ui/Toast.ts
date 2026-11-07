export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
  type?: 'info' | 'success' | 'warn';
}

let toastContainer: HTMLElement | null = null;

function ensureToastContainer(): HTMLElement {
  if (toastContainer && document.body.contains(toastContainer)) {
    return toastContainer;
  }
  toastContainer = document.createElement('div');
  toastContainer.className = 'ms-toast-container';
  toastContainer.setAttribute('aria-live', 'polite');
  document.body.appendChild(toastContainer);
  return toastContainer;
}

export function showToast(opts: ToastOptions | string): void {
  const options: ToastOptions = typeof opts === 'string' ? { message: opts } : opts;
  const container = ensureToastContainer();

  const item = document.createElement('div');
  item.className = `ms-toast visible ms-toast-${options.type ?? 'info'}`;

  const textSpan = document.createElement('span');
  textSpan.className = 'ms-toast-msg';
  textSpan.textContent = options.message;
  item.appendChild(textSpan);

  if (options.actionLabel && options.onAction) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ms-toast-btn';
    btn.textContent = options.actionLabel;
    btn.addEventListener('click', () => {
      options.onAction?.();
      item.remove();
    });
    item.appendChild(btn);
  }

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'ms-toast-close';
  closeBtn.setAttribute('aria-label', '关闭提示');
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', () => item.remove());
  item.appendChild(closeBtn);

  // Keep at most 1 active toast on mobile (<=760px) and 2 on desktop
  const maxActive = typeof window !== 'undefined' && window.innerWidth <= 760 ? 1 : 2;
  while (container.children.length >= maxActive) {
    container.firstElementChild?.remove();
  }
  container.appendChild(item);

  const dur = options.durationMs ?? (options.actionLabel ? 7000 : 4000);
  if (dur > 0) {
    window.setTimeout(() => {
      item.classList.add('ms-toast-exit');
      window.setTimeout(() => item.remove(), 220);
    }, dur);
  }
}
