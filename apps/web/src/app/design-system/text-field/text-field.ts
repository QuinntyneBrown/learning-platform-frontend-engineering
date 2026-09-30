import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  signal,
} from '@angular/core';
import { type ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

let nextId = 0;

/**
 * A labelled text input that works with reactive forms (ControlValueAccessor).
 *
 * The hint and error are tied to the input with aria-describedby, so a screen reader reads
 * them when the field gets focus. The error deliberately has no role="alert": a form with
 * several invalid fields would fire several alerts at once. The form's summary announces.
 */
@Component({
  selector: 'cw-text-field',
  templateUrl: './text-field.html',
  styleUrl: './text-field.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => TextField), multi: true },
  ],
})
export class TextField implements ControlValueAccessor {
  readonly label = input.required<string>();
  readonly type = input<'text' | 'password' | 'email' | 'search'>('text');
  readonly autocomplete = input<string>();
  readonly hint = input<string>();
  readonly error = input<string>();

  private readonly id = `cw-text-field-${nextId++}`;
  protected readonly inputId = `${this.id}-input`;
  protected readonly hintId = `${this.id}-hint`;
  protected readonly errorId = `${this.id}-error`;

  protected readonly value = signal('');
  protected readonly disabled = signal(false);
  protected readonly describedBy = computed(
    () =>
      [this.hint() && this.hintId, this.error() && this.errorId].filter(Boolean).join(' ') || null,
  );

  private onChange: (value: string) => void = () => undefined;
  protected onTouched: () => void = () => undefined;

  protected onInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.value.set(value);
    this.onChange(value);
  }

  writeValue(value: string | null): void {
    this.value.set(value ?? '');
  }

  registerOnChange(onChange: (value: string) => void): void {
    this.onChange = onChange;
  }

  registerOnTouched(onTouched: () => void): void {
    this.onTouched = onTouched;
  }

  setDisabledState(disabled: boolean): void {
    this.disabled.set(disabled);
  }
}
