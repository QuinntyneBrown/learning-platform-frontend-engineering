import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextId = 0;

/**
 * A native <progress>: it already has the progressbar role and exposes its value to assistive
 * technology, so the only thing to add is a visible label, which gives it its accessible name.
 */
@Component({
  selector: 'cw-progress',
  template: `
    <label class="label" [for]="id">{{ label() }}</label>
    <div class="track">
      <progress [id]="id" max="100" [value]="value()"></progress>
      <span class="percent" aria-hidden="true">{{ value() }}%</span>
    </div>
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--cw-space-1);
    }
    .label {
      font-weight: 600;
    }
    .track {
      display: flex;
      align-items: center;
      gap: var(--cw-space-3);
    }
    progress {
      flex: 1;
      height: 0.75rem;
      accent-color: var(--cw-color-primary);
    }
    .percent {
      min-width: 3ch;
      font-variant-numeric: tabular-nums;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Progress {
  readonly label = input.required<string>();
  /** 0 to 100. */
  readonly value = input(0);

  protected readonly id = `cw-progress-${nextId++}`;
}
