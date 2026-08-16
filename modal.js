// Popups maison à la DA BLOC ZEN, remplacent confirm()/alert() du navigateur.
// zenConfirm({...}) → Promise<bool> · zenAlert({...}) → Promise<void>
(function () {
  function open({ icon, title, message, confirmText, cancelText, danger, onDone }) {
    const overlay = document.createElement('div');
    overlay.className = 'zen-modal-overlay';
    overlay.innerHTML = `
      <div class="zen-modal" role="dialog" aria-modal="true">
        ${icon ? `<div class="zen-modal-icon">${icon}</div>` : ''}
        <h3>${title || ''}</h3>
        ${message ? `<p>${message}</p>` : ''}
        <div class="zen-modal-actions">
          <button class="${danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${confirmText || 'OK'}</button>
          ${cancelText ? `<button class="btn-secondary" data-act="cancel">${cancelText}</button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));

    const close = (val) => {
      overlay.classList.remove('show');
      setTimeout(() => { overlay.remove(); onDone(val); }, 200);
    };

    overlay.querySelector('[data-act="ok"]').onclick = () => close(true);
    const cancelBtn = overlay.querySelector('[data-act="cancel"]');
    if (cancelBtn) cancelBtn.onclick = () => close(false);
    // Cliquer en dehors = annuler (équivaut à "non")
    overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { document.removeEventListener('keydown', esc); close(false); }
    });
  }

  window.zenConfirm = (opts) => new Promise(resolve => open({
    icon: opts.icon || '🌿',
    title: opts.title || 'Confirmer ?',
    message: opts.message || '',
    confirmText: opts.confirmText || 'Oui',
    cancelText: opts.cancelText || 'Annuler',
    danger: opts.danger,
    onDone: resolve
  }));

  window.zenAlert = (opts) => new Promise(resolve => open({
    icon: opts.icon || '🌿',
    title: opts.title || '',
    message: opts.message || '',
    confirmText: opts.confirmText || 'OK',
    cancelText: null,
    onDone: () => resolve()
  }));
})();
