// A separate entry point, because TextField pulls in @angular/forms (about 56 kB). Barrel
// re-exports aren't tree-shaken here, so exporting it from index.ts would put forms in the
// initial bundle of every page. Only the lazy login feature imports this.
export { TextField } from './text-field/text-field';
