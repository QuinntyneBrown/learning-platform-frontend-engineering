import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Shell } from './shell';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

describe('Shell', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('starts with a skip link that moves focus to <main>', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    document.body.appendChild(element); // focus() only works on attached elements

    const skipLink = element.querySelector<HTMLAnchorElement>(FOCUSABLE)!;
    expect(skipLink.textContent?.trim()).toBe('Skip to main content');
    expect(skipLink.getAttribute('href')).toBe('#main');

    skipLink.click();
    const main = element.querySelector('main')!;
    expect(main.id).toBe('main');
    expect(document.activeElement).toBe(main);
    element.remove();
  });

  it('shows no navigation while signed out', async () => {
    const fixture = TestBed.createComponent(Shell);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;

    expect(element.querySelector('header')?.textContent).toContain('Coursewright');
    expect(element.querySelector('nav')).toBeNull();
  });
});
