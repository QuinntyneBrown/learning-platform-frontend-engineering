import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary';

/**
 * An attribute component on the native element, so keyboard handling, form submission, link
 * semantics and the accessible name all stay the browser's job.
 *
 * `busy` sets aria-busy instead of `disabled`: a disabled button drops focus and swallows
 * clicks, which would hide double-submits from the code designed to absorb them (exhaustMap).
 */
@Component({
  selector: 'button[cwButton], a[cwButton]',
  template: '<ng-content />',
  styleUrl: './button.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cw-button',
    '[class.cw-button--secondary]': "variant() === 'secondary'",
    '[attr.aria-busy]': 'busy() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('primary');
  readonly busy = input(false);
}
