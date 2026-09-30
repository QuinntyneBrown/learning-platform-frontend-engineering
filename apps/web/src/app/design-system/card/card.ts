import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * A surface for grouped content. Pass `heading` for a plain-text title at the level the page's
 * outline needs, or leave it out and project your own heading (for example one with a link).
 */
@Component({
  selector: 'cw-card',
  template: `
    @if (heading(); as text) {
      @switch (headingLevel()) {
        @case (2) {
          <h2 class="heading">{{ text }}</h2>
        }
        @case (3) {
          <h3 class="heading">{{ text }}</h3>
        }
        @case (4) {
          <h4 class="heading">{{ text }}</h4>
        }
      }
    }
    <ng-content />
  `,
  styles: `
    :host {
      display: block;
      padding: var(--cw-space-4);
      border: 1px solid var(--cw-color-border);
      border-radius: var(--cw-radius-md);
      background: var(--cw-color-surface);
    }
    .heading {
      margin: 0 0 var(--cw-space-2);
      font-size: var(--cw-font-size-lg);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Card {
  readonly heading = input<string>();
  readonly headingLevel = input<2 | 3 | 4>(2);
}
