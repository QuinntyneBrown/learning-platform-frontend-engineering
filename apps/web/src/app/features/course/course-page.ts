import { TitleCasePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  type ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { CoursewrightApi, problemMessage } from '@cw/core';
import { Button, Card } from '@cw/design-system';
import { EnrollmentController } from './enrollment-controller';

@Component({
  selector: 'cw-course-page',
  imports: [RouterLink, TitleCasePipe, Button, Card],
  providers: [EnrollmentController],
  templateUrl: './course-page.html',
  styleUrl: './course-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CoursePage {
  /** Bound from the `:courseId` route parameter (withComponentInputBinding). */
  readonly courseId = input.required<string>();

  private readonly api = inject(CoursewrightApi);
  private readonly title = inject(Title);
  protected readonly enrollment = inject(EnrollmentController);
  private readonly enrolledStatus = viewChild<ElementRef<HTMLElement>>('enrolledStatus');

  protected readonly course = this.api.course(this.courseId);
  protected readonly notFound = computed(() => this.course.statusCode() === 404);
  protected readonly errorMessage = computed(() => problemMessage(this.course.error()));
  protected readonly enrolled = computed(
    () =>
      (this.course.hasValue() && this.course.value().enrolled) ||
      this.enrollment.status() === 'enrolled',
  );

  // One h1 whose text changes, rather than one h1 per state: route focus lands on it while
  // the course is still loading, and replacing the element would drop that focus.
  protected readonly heading = computed(() => {
    if (this.course.hasValue()) return this.course.value().title;
    if (this.notFound()) return 'Course not found';
    if (this.course.error()) return 'Course unavailable';
    return 'Loading course…';
  });

  constructor() {
    // The route's title is only "Course"; once loaded, the browser tab names the course.
    effect(() => {
      if (this.course.hasValue()) {
        this.title.setTitle(`${this.course.value().title} · Coursewright`);
      }
    });

    // The Enroll button had focus and has just been removed; without this, focus falls back
    // to <body> and a keyboard user starts again from the top of the page.
    afterRenderEffect(() => {
      if (this.enrollment.status() === 'enrolled') this.enrolledStatus()?.nativeElement.focus();
    });
  }
}
