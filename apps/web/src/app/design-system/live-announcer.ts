import { DOCUMENT, Injectable, inject } from '@angular/core';

/**
 * One app-wide polite live region, for changes a screen reader user would otherwise miss:
 * a route change in a single-page app, or a button that has been replaced by its result.
 */
@Injectable({ providedIn: 'root' })
export class LiveAnnouncer {
  private readonly document = inject(DOCUMENT);
  private region: HTMLElement | null = null;
  private pending?: ReturnType<typeof setTimeout>;

  announce(message: string): void {
    const region = (this.region ??= this.createRegion());
    // Clear, then set on a later task: screen readers announce changes to a region, so this
    // also re-announces a message identical to the previous one. The region must already be in
    // the DOM when its text changes, which is why the first call creates it before setting text.
    region.textContent = '';
    clearTimeout(this.pending);
    this.pending = setTimeout(() => (region.textContent = message), 100);
  }

  private createRegion(): HTMLElement {
    const region = this.document.createElement('div');
    region.className = 'cw-visually-hidden';
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    this.document.body.appendChild(region);
    return region;
  }
}
