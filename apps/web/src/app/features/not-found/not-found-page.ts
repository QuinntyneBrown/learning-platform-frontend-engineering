import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'cw-not-found-page',
  imports: [RouterLink],
  template: `
    <h1>Page not found</h1>
    <p>The page you asked for doesn't exist, or you don't have access to it.</p>
    <p><a routerLink="/catalog">Go to the catalog</a></p>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotFoundPage {}
