// tests/test-utils.js
let passed = 0, failed = 0
export function assert(desc, condition) {
  if (condition) { console.log(`%c✓ ${desc}`, 'color:green'); passed++ }
  else           { console.error(`✗ ${desc}`); failed++ }
}
export function summary() {
  console.log(`\n${passed} passed, ${failed} failed`)
}
