import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { CoursewrightApi } from '@cw/core';

/** Loaded with @defer (on viewport) by the catalog page, so it costs nothing until it's seen. */
@Component({
  selector: 'cw-my-enrollments',
  imports: [DatePipe, RouterLink],
  template: `
    <section class="enrollments" aria-labelledby="enrollments-heading">
      <h2 id="enrollments-heading">Your enrollments</h2>
      @if (enrollments.hasValue()) {
        @let items = enrollments.value().items;
        @if (items.length > 0) {
          <ul>
            @for (enrollment of items; track enrollment.id) {
              <li>
                <a [routerLink]="['/courses', enrollment.courseId]">{{ enrollment.courseTitle }}</a>
                <span class="enrolled-at">
                  enrolled
                  <time [attr.datetime]="enrollment.enrolledAt">
                    {{ enrollment.enrolledAt | date: 'mediumDate' }}
                  </time>
                </span>
              </li>
            }
          </ul>
        } @else {
          <p>You haven't enrolled in any courses yet.</p>
        }
      } @else if (enrollments.error()) {
        <p>We couldn't load your enrollments. Reload the page to try again.</p>
      } @else {
        <p>Loading your enrollments…</p>
      }
    </section>
  `,
  styles: `
    .enrollments {
      margin-top: var(--cw-space-8);
    }
    h2 {
      font-size: var(--cw-font-size-lg);
    }
    .enrolled-at {
      color: var(--cw-color-text-muted);
      font-size: var(--cw-font-size-sm);
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyEnrollments {
  private readonly api = inject(CoursewrightApi);

  // rxResource turns an Observable into signals for value, status and error.
  protected readonly enrollments = rxResource({ stream: () => this.api.myEnrollments() });
}
