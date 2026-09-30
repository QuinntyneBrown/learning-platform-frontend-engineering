import { provideHttpClient, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { TitleStrategy, provideRouter, withComponentInputBinding } from '@angular/router';
import { AuthStore, GlobalErrorHandler, Rum, authInterceptor, traceInterceptor } from '@cw/core';
import { routes } from './app.routes';
import { PageTitleStrategy } from './shell/title-strategy';

// Zoneless is the default: there is no zone.js, and signals and template events schedule rendering.
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    // withComponentInputBinding: route params, query params and data arrive as component inputs.
    provideRouter(routes, withComponentInputBinding()),
    { provide: TitleStrategy, useClass: PageTitleStrategy },
    // HttpClient is fetch-backed by default in v22 (withFetch() is no longer needed).
    // Order matters: tracing runs first, so a refresh-and-retry keeps the same traceparent.
    provideHttpClient(withInterceptors([traceInterceptor, authInterceptor])),
    // Runs before the first navigation, so guards already know whether the user is signed in.
    provideAppInitializer(() => inject(AuthStore).restore()),
    provideAppInitializer(() => inject(Rum).start()),
  ],
};
