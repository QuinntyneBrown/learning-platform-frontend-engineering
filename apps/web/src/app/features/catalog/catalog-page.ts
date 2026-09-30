import { TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Button, Card } from '@cw/design-system';
import { CatalogStore } from './catalog.store';
import { MyEnrollments } from './my-enrollments';

@Component({
  selector: 'cw-catalog-page',
  imports: [RouterLink, TitleCasePipe, Button, Card, MyEnrollments],
  providers: [CatalogStore],
  templateUrl: './catalog-page.html',
  styleUrl: './catalog-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CatalogPage {
  protected readonly store = inject(CatalogStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Bound from `?q=`, so a search can be bookmarked, shared, and restored by Back. */
  readonly q = input<string>();

  /** The search box's value: local, seeded from the URL, and reset whenever the URL changes. */
  protected readonly query = linkedSignal(() => this.q() ?? '');

  protected readonly statusText = computed(() => {
    const { status, items, query, nextCursor, error } = this.store;
    const count = items().length;
    switch (status()) {
      case 'idle':
        return '';
      case 'loading':
        return 'Searching…';
      case 'error':
        return error() ?? '';
      case 'loaded':
        if (count === 0) return query() ? `No courses match "${query()}"` : 'No courses yet';
        return `${count}${nextCursor() ? '+' : ''} ${count === 1 ? 'course' : 'courses'} found`;
    }
  });

  constructor() {
    // Every change goes to the store, which debounces, trims and de-duplicates it.
    this.store.search(this.query);
  }

  protected onSearch(value: string): void {
    this.query.set(value);
    // replaceUrl: one history entry for the page, not one per keystroke.
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { q: value || null },
      replaceUrl: true,
    });
  }
}
