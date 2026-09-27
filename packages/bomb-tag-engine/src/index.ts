export * from './config';
export * from './errors';
export * from './collision';
export * from './state';
// Shared arena primitives (geometry/movement/random) ab `@rmc/arena-kit` me hain — yahan se bhi
// re-export karte hain taaki is package ke purane consumers (service/tests) waise hi chalein.
export * from '@rmc/arena-kit';
