import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthStore, problemMessage } from '@cw/core';
import { Button } from '@cw/design-system';
import { TextField } from '@cw/design-system/forms';
import { safeReturnUrl } from './return-url';

@Component({
  selector: 'cw-login-page',
  imports: [ReactiveFormsModule, Button, TextField],
  templateUrl: './login-page.html',
  styleUrl: './login-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginPage {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);

  /** Bound from the `?returnUrl=` query parameter (withComponentInputBinding). */
  readonly returnUrl = input<string>();

  protected readonly form = inject(NonNullableFormBuilder).group({
    username: ['', Validators.required],
    password: ['', Validators.required],
  });
  protected readonly submitted = signal(false);
  protected readonly pending = signal(false);
  protected readonly errorMessage = signal<string | null>(null);

  protected fieldError(field: 'username' | 'password', message: string): string | undefined {
    return this.submitted() && this.form.controls[field].invalid ? message : undefined;
  }

  protected submit(): void {
    if (this.pending()) return;
    this.submitted.set(true);
    if (this.form.invalid) {
      this.errorMessage.set('Enter your username and password.');
      return;
    }

    this.pending.set(true);
    this.errorMessage.set(null);
    this.auth.login(this.form.getRawValue()).subscribe({
      next: () => void this.router.navigateByUrl(safeReturnUrl(this.returnUrl())),
      error: (error: unknown) => {
        this.pending.set(false);
        this.errorMessage.set(
          error instanceof HttpErrorResponse && error.status === 401
            ? 'Username or password is incorrect.'
            : problemMessage(error),
        );
      },
    });
  }
}
