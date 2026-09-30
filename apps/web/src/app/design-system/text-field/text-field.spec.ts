import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { TextField } from './text-field';

@Component({
  imports: [ReactiveFormsModule, TextField],
  template: `
    <cw-text-field
      label="Email"
      hint="We never share it."
      [error]="error()"
      [formControl]="email"
    />
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
class Host {
  readonly email = new FormControl('', { nonNullable: true });
  readonly error = signal<string | undefined>(undefined);
}

describe('TextField', () => {
  async function render() {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const input = element.querySelector('input')!;
    return { fixture, element, input };
  }

  it('associates the label with the input', async () => {
    const { element, input } = await render();
    const label = element.querySelector('label')!;

    expect(input.id).not.toBe('');
    expect(label.htmlFor).toBe(input.id);
    expect(label.textContent?.trim()).toBe('Email');
  });

  it('describes the input by its hint, and by its error when there is one', async () => {
    const { fixture, element, input } = await render();
    const hint = element.querySelector('.hint')!;
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
    expect(input.hasAttribute('aria-invalid')).toBe(false);

    fixture.componentInstance.error.set('Enter a valid email address.');
    await fixture.whenStable();

    const error = element.querySelector('.error')!;
    expect(input.getAttribute('aria-describedby')?.split(' ')).toEqual([hint.id, error.id]);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(error.getAttribute('role')).toBeNull();

    fixture.componentInstance.error.set(undefined);
    await fixture.whenStable();
    expect(input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('reads and writes the form control value', async () => {
    const { fixture, input } = await render();

    input.value = 'riley@acme.example';
    input.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.email.value).toBe('riley@acme.example');

    fixture.componentInstance.email.setValue('morgan@acme.example');
    await fixture.whenStable();
    expect(input.value).toBe('morgan@acme.example');
  });
});
