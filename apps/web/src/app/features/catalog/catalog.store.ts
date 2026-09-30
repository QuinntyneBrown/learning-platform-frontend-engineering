import { inject } from '@angular/core';
import { patchState, signalStore, withMethods, withState } from '@ngrx/signals';
import { rxMethod } from '@ngrx/signals/rxjs-interop';
import { CoursewrightApi, type CourseSummary, problemMessage } from '@cw/core';
import {
  EMPTY,
  catchError,
  debounceTime,
  distinctUntilChanged,
  exhaustMap,
  filter,
  finalize,
  map,
  pipe,
  switchMap,
  tap,
} from 'rxjs';

interface CatalogState {
  query: string;
  items: CourseSummary[];
  nextCursor: string | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  loadingMore: boolean;
  error: string | null;
}

const initialState: CatalogState = {
  query: '',
  items: [],
  nextCursor: null,
  status: 'idle',
  loadingMore: false,
  error: null,
};

export const CatalogStore = signalStore(
  withState(initialState),
  withMethods((store, api = inject(CoursewrightApi)) => {
    // Errors are caught inside each inner request: an error that reached the outer stream
    // would complete it, and the search box would silently stop working.
    const fail = (error: unknown) => {
      patchState(store, { status: 'error', error: problemMessage(error) });
      return EMPTY;
    };

    return {
      search: rxMethod<string>(
        pipe(
          debounceTime(250),
          map((query) => query.trim()),
          distinctUntilChanged(),
          tap((query) => patchState(store, { query, status: 'loading', error: null })),
          // switchMap cancels the stale request, so a slow response for an old query can't
          // arrive late and overwrite the results for the newer one.
          switchMap((query) =>
            api.searchCourses({ q: query }).pipe(
              tap(({ items, nextCursor }) =>
                patchState(store, { items, nextCursor, status: 'loaded' }),
              ),
              catchError(fail),
            ),
          ),
        ),
      ),

      loadMore: rxMethod<void>(
        pipe(
          filter(() => store.nextCursor() !== null),
          // exhaustMap ignores clicks while a page is loading, so the same cursor isn't fetched
          // twice and pages can't be appended out of order.
          exhaustMap(() => {
            const query = store.query();
            patchState(store, { loadingMore: true });
            return api.searchCourses({ q: query, cursor: store.nextCursor() ?? undefined }).pipe(
              tap(({ items, nextCursor }) => {
                // A new search may have started meanwhile; this page belongs to the old one.
                if (store.query() !== query) return;
                patchState(store, { items: [...store.items(), ...items], nextCursor });
              }),
              catchError(fail),
              finalize(() => patchState(store, { loadingMore: false })),
            );
          }),
        ),
      ),
    };
  }),
);
