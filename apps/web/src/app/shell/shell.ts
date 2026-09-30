import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  computed,
  inject,
  viewChild,
} from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AuthStore } from '@cw/core';
import { Button } from '@cw/design-system';
import { focusPageOnNavigation } from './route-focus';

/** The root component: skip link, header and navigation, and the routed page in <main>. */
@Component({
  selector: 'cw-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Button],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
  // OnPush is already the default in v22; the house rule is to write it out anyway, so the
  // intent survives copy-paste into older code and is obvious in review.
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Shell {
  private readonly auth = inject(AuthStore);
  private readonly router = inject(Router);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  protected readonly user = this.auth.user;
  protected readonly isManager = computed(() => this.auth.hasRole('manager'));

  constructor() {
    focusPageOnNavigation();
  }

  // A plain href="#main" would resolve against <base href="/"> and navigate to "/#main",
  // so the link moves focus itself. It keeps the href so it's still a real link.
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }

  protected signOut(): void {
    this.auth.logout().subscribe(() => void this.router.navigateByUrl('/login'));
  }
}
