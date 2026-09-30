import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { LoginPage } from './login-page';
import { safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps paths inside the app', () => {
    expect(safeReturnUrl('/courses/c1?tab=lessons')).toBe('/courses/c1?tab=lessons');
  });

  it.each(['//evil.example', '/\\evil.example', 'https://evil.example/login', 'catalog', '', null])(
    'rejects %j (open-redirect guard)',
    (url) => expect(safeReturnUrl(url)).toBe('/catalog'),
  );
});

describe('LoginPage', () => {
  async function render(returnUrl?: string) {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    });
    const fixture = TestBed.createComponent(LoginPage);
    if (returnUrl) fixture.componentRef.setInput('returnUrl', returnUrl);
    await fixture.whenStable();
    const element: HTMLElement = fixture.nativeElement;
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    return { fixture, element, navigate, http: TestBed.inject(HttpTestingController) };
  }

  function type(element: HTMLElement, label: string, value: string) {
    const labelElement = [...element.querySelectorAll('label')].find(
      (l) => l.textContent?.trim() === label,
    )!;
    const input = element.querySelector<HTMLInputElement>(`#${labelElement.htmlFor}`)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
  }

  function submit(element: HTMLElement) {
    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
  }

  it('shows one alert when the credentials are wrong', async () => {
    const { fixture, element, http } = await render();
    type(element, 'Username', 'learner.acme');
    type(element, 'Password', 'wrong');
    submit(element);

    http
      .expectOne('/api/auth/login')
      .flush(
        { type: '/problems/invalid-credentials', title: 'Unauthorized', status: 401 },
        { status: 401, statusText: 'Unauthorized' },
      );
    await fixture.whenStable();

    const alerts = element.querySelectorAll('[role="alert"]');
    expect(alerts).toHaveLength(1);
    expect(alerts[0].textContent?.trim()).toBe('Username or password is incorrect.');
  });

  it('flags empty fields without calling the API', async () => {
    const { fixture, element, http } = await render();
    submit(element);
    await fixture.whenStable();

    http.expectNone('/api/auth/login');
    expect(element.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'Enter your username and password.',
    );
    expect(element.querySelectorAll('input[aria-invalid="true"]')).toHaveLength(2);
  });

  it('ignores an off-site returnUrl after signing in', async () => {
    const { element, http, navigate } = await render('https://evil.example');
    type(element, 'Username', 'learner.acme');
    type(element, 'Password', 'Coursewright2026!');
    submit(element);

    http.expectOne('/api/auth/login').flush({
      accessToken: 't',
      expiresIn: 900,
      user: {
        id: 'u1',
        username: 'learner.acme',
        displayName: 'Riley Chen',
        tenantId: 't1',
        tenantName: 'Acme Corp',
        roles: ['learner'],
      },
    });

    expect(navigate).toHaveBeenCalledWith('/catalog');
  });
});
