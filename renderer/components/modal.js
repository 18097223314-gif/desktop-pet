/* ══════════════════════════════════════════════
   爪爪桌宠 — Modal 组件
   替代 native dialog (alert / confirm / prompt)

   API:
     Modal.confirm(title, message, confirmText?, cancelText?) => Promise<boolean>
     Modal.alert(title, message, okText?)                    => Promise<void>
     Modal.prompt(title, message, defaultValue?, confirmText?, cancelText?) => Promise<string|null>
     Modal.close()                                            void

   依赖：tokens.css + animations.css（需提前引入）
   ══════════════════════════════════════════════ */

const STYLE_ID = 'dp-modal-styles';

const CSS_TEXT = `
  .dp-modal-overlay {
    position: fixed;
    inset: 0;
    background: var(--dp-bg-overlay);
    backdrop-filter: var(--dp-blur-sm);
    -webkit-backdrop-filter: var(--dp-blur-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--dp-z-modal-backdrop);
  }
  .dp-modal-box {
    background: var(--dp-bg-panel);
    border: 1px solid var(--dp-border);
    border-radius: var(--dp-radius-md);
    box-shadow: var(--dp-shadow-lg);
    padding: var(--dp-space-xl);
    min-width: 320px;
    max-width: 420px;
    width: 90%;
    color: var(--dp-text-primary);
    font-family: var(--dp-font);
    font-size: var(--dp-font-md);
    line-height: var(--dp-line-height-normal);
  }
  .dp-modal-title {
    font-size: var(--dp-font-lg);
    font-weight: 600;
    color: var(--dp-text-primary);
    margin-bottom: var(--dp-space-md);
  }
  .dp-modal-message {
    font-size: var(--dp-font-sm);
    color: var(--dp-text-secondary);
    margin-bottom: var(--dp-space-lg);
    word-break: break-word;
  }
  .dp-modal-input {
    width: 100%;
    padding: var(--dp-space-sm) var(--dp-space-md);
    background: var(--dp-bg-input);
    border: 1px solid var(--dp-border);
    border-radius: var(--dp-radius-sm);
    color: var(--dp-text-primary);
    font-size: var(--dp-font-sm);
    font-family: var(--dp-font);
    outline: none;
    margin-bottom: var(--dp-space-lg);
    box-sizing: border-box;
    transition: border-color var(--dp-transition-fast);
  }
  .dp-modal-input:focus {
    border-color: var(--dp-primary);
  }
  .dp-modal-input::placeholder {
    color: var(--dp-text-muted);
  }
  .dp-modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--dp-space-sm);
  }
  .dp-modal-btn {
    padding: var(--dp-space-sm) var(--dp-space-lg);
    border-radius: var(--dp-radius-sm);
    font-size: var(--dp-font-sm);
    font-family: var(--dp-font);
    cursor: pointer;
    border: 1px solid var(--dp-border);
    background: var(--dp-bg-card);
    color: var(--dp-text-primary);
    transition: all var(--dp-transition-fast);
    min-width: 72px;
    text-align: center;
  }
  .dp-modal-btn:hover {
    background: var(--dp-bg-card-hover);
    border-color: var(--dp-border-light);
  }
  .dp-modal-btn-primary {
    background: var(--dp-primary);
    border-color: var(--dp-primary);
    color: #fff;
  }
  .dp-modal-btn-primary:hover {
    background: var(--dp-primary-dark);
    border-color: var(--dp-primary-dark);
  }
`;

function ensureStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_TEXT;
  document.head.appendChild(style);
}

let currentResolve = null;
let currentType = null; // 'alert' | 'confirm' | 'prompt'

function removeModal() {
  const existing = document.querySelector('.dp-modal-overlay');
  if (existing) {
    existing.remove();
  }
  currentResolve = null;
  currentType = null;
}

function createModal({ type, title, message, input, confirmText, cancelText, onResolve }) {
  ensureStyles();
  currentType = type;
  currentResolve = onResolve;

  const overlay = document.createElement('div');
  overlay.className = 'dp-modal-overlay anim-panel-in';

  const box = document.createElement('div');
  box.className = 'dp-modal-box anim-modal-in';

  // Title
  const titleEl = document.createElement('div');
  titleEl.className = 'dp-modal-title';
  titleEl.textContent = title;
  box.appendChild(titleEl);

  // Message
  const msgEl = document.createElement('div');
  msgEl.className = 'dp-modal-message';
  msgEl.textContent = message;
  box.appendChild(msgEl);

  // Input (prompt only)
  let inputEl = null;
  if (type === 'prompt' && input !== null) {
    inputEl = document.createElement('input');
    inputEl.className = 'dp-modal-input';
    inputEl.type = 'text';
    inputEl.value = input.defaultValue;
    inputEl.placeholder = input.placeholder || '';
    box.appendChild(inputEl);
  }

  // Actions
  const actions = document.createElement('div');
  actions.className = 'dp-modal-actions';

  if (type === 'alert') {
    const okBtn = document.createElement('button');
    okBtn.className = 'dp-modal-btn dp-modal-btn-primary';
    okBtn.textContent = confirmText;
    okBtn.addEventListener('click', () => {
      box.classList.remove('anim-modal-in');
      box.classList.add('anim-modal-out');
      setTimeout(() => {
        removeModal();
      }, 200);
      onResolve();
    });
    actions.appendChild(okBtn);
  } else {
    // confirm or prompt
    if (cancelText) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'dp-modal-btn';
      cancelBtn.textContent = cancelText;
      cancelBtn.addEventListener('click', () => {
        box.classList.remove('anim-modal-in');
        box.classList.add('anim-modal-out');
        setTimeout(() => {
          removeModal();
        }, 200);
        onResolve(type === 'confirm' ? false : null);
      });
      actions.appendChild(cancelBtn);
    }

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'dp-modal-btn dp-modal-btn-primary';
    confirmBtn.textContent = confirmText;
    confirmBtn.addEventListener('click', () => {
      box.classList.remove('anim-modal-in');
      box.classList.add('anim-modal-out');
      setTimeout(() => {
        removeModal();
      }, 200);
      if (type === 'prompt') {
        onResolve(inputEl ? inputEl.value : null);
      } else {
        onResolve(true);
      }
    });
    actions.appendChild(confirmBtn);
  }

  box.appendChild(actions);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Overlay click — only alert closes on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay && currentType === 'alert') {
      box.classList.remove('anim-modal-in');
      box.classList.add('anim-modal-out');
      setTimeout(() => {
        removeModal();
      }, 200);
      onResolve();
    }
  });

  // ESC key
  const onKey = (e) => {
    if (e.key === 'Escape') {
      if (currentType === 'alert') {
        box.classList.remove('anim-modal-in');
        box.classList.add('anim-modal-out');
        setTimeout(() => {
          removeModal();
        }, 200);
        onResolve();
      } else {
        box.classList.remove('anim-modal-in');
        box.classList.add('anim-modal-out');
        setTimeout(() => {
          removeModal();
        }, 200);
        onResolve(false);
      }
      document.removeEventListener('keydown', onKey);
    }
    // Enter key for prompt
    if (e.key === 'Enter' && currentType === 'prompt' && e.target === inputEl) {
      confirmBtn.click();
    }
  };
  document.addEventListener('keydown', onKey);

  // Focus input or confirm button
  if (inputEl) {
    inputEl.focus();
    inputEl.select();
  } else {
    const primaryBtn = actions.querySelector('.dp-modal-btn-primary');
    if (primaryBtn) primaryBtn.focus();
  }
}

const Modal = {
  confirm(title, message, confirmText = '确定', cancelText = '取消') {
    return new Promise((resolve) => {
      // Close any existing modal first
      if (currentResolve) removeModal();
      createModal({
        type: 'confirm',
        title,
        message,
        confirmText,
        cancelText,
        onResolve: resolve,
      });
    });
  },

  alert(title, message, okText = '好的') {
    return new Promise((resolve) => {
      if (currentResolve) removeModal();
      createModal({
        type: 'alert',
        title,
        message,
        confirmText: okText,
        onResolve: resolve,
      });
    });
  },

  prompt(title, message, defaultValue = '', confirmText = '确定', cancelText = '取消') {
    return new Promise((resolve) => {
      if (currentResolve) removeModal();
      createModal({
        type: 'prompt',
        title,
        message,
        input: { defaultValue, placeholder: '请输入...' },
        confirmText,
        cancelText,
        onResolve: resolve,
      });
    });
  },

  close() {
    if (currentResolve) {
      removeModal();
    }
  },
};
