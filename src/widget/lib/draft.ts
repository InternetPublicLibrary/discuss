/** Drafts survive sign-in and reloads in the widget's own storage; storage may be unavailable (WebViews): then no-op. */
export function loadDraft(key: string): string {
  try {
    return window.sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(key: string, value: string): void {
  try {
    if (value) window.sessionStorage.setItem(key, value);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage blocked: the draft simply is not kept.
  }
}
