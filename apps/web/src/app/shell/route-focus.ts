import { DOCUMENT, Injector, afterNextRender, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, TitleStrategy } from '@angular/router';
import { LiveAnnouncer } from '@cw/design-system';
import { distinctUntilChanged, filter, map, skip } from 'rxjs';

/**
 * A single-page app swaps content without a page load, so a screen reader stays wherever it
 * was and says nothing. After each route change, move focus to the new page's h1 (or <main>)
 * and announce the page. Call from an injection context.
 */
export function focusPageOnNavigation(): void {
  const router = inject(Router);
  const titles = inject(TitleStrategy);
  const announcer = inject(LiveAnnouncer);
  const document = inject(DOCUMENT);
  const injector = inject(Injector);

  router.events
    .pipe(
      filter((event) => event instanceof NavigationEnd),
      // Only a new path counts: query-only changes (the catalog's ?q=) must not steal focus
      // from the search box while the user types.
      map((event) => event.urlAfterRedirects.split(/[?#]/)[0]),
      distinctUntilChanged(),
      // On the initial load the screen reader already reads the new document from the top.
      skip(1),
      takeUntilDestroyed(),
    )
    .subscribe(() => {
      afterNextRender(
        () => {
          const target =
            document.querySelector<HTMLElement>('main h1') ?? document.getElementById('main');
          if (target) {
            target.setAttribute('tabindex', '-1');
            target.focus();
          }
          const title = titles.buildTitle(router.routerState.snapshot);
          if (title) announcer.announce(`${title} page loaded`);
        },
        { injector },
      );
    });
}
