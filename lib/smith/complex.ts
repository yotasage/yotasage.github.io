// Moved to lib/complex.ts (shared with the equation engine, EM step M2.4b) and re-exported here for anything that still
// imports it. The Smith chart's modules and its harness import lib/complex.ts directly: under tsx, loading this
// re-export made every call of the complex functions five to six times slower, also from modules that import
// lib/complex.ts directly (the network sweep of 10 parts at 10,000 points took 16.4 ms against 2.7 ms).
export * from '../complex';
