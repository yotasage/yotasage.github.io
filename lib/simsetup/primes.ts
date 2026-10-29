// Prime numbers of any size, using BigInt.
//
// Numbers are first divided by the primes below 1000. Larger candidates go through the
// Miller–Rabin test with the first 13 primes (2 to 41) as bases:
// https://en.wikipedia.org/wiki/Miller%E2%80%93Rabin_primality_test
// With these bases the test is exact for every number below EXACT_LIMIT, the smallest number
// that passes all 13 bases without being prime (https://oeis.org/A014233). Above that limit a few
// rare composite numbers also pass, so a positive answer means "probably prime".

export const EXACT_LIMIT = 3317044064679887385961981n;

const BASES = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n, 41n];

// Sieve of Eratosthenes: https://en.wikipedia.org/wiki/Sieve_of_Eratosthenes
function primesBelow(limit: number): bigint[] {
  const composite = new Uint8Array(limit);
  const primes: bigint[] = [];
  for (let i = 2; i < limit; i++) {
    if (composite[i]) continue;
    primes.push(BigInt(i));
    for (let j = i * i; j < limit; j += i) composite[j] = 1;
  }
  return primes;
}

const SMALL_PRIMES = primesBelow(1000);
const LARGEST_SMALL_PRIME = SMALL_PRIMES[SMALL_PRIMES.length - 1];

function modPow(base: bigint, exponent: bigint, modulus: bigint): bigint {
  let result = 1n;
  base %= modulus;
  while (exponent > 0n) {
    if (exponent & 1n) result = (result * base) % modulus;
    base = (base * base) % modulus;
    exponent >>= 1n;
  }
  return result;
}

export function isPrime(n: bigint): boolean {
  if (n < 2n) return false;
  for (const p of SMALL_PRIMES) {
    if (n === p) return true;
    if (n % p === 0n) return false;
  }
  // No factor up to the largest small prime, so n is prime if it is below that prime squared.
  if (n < LARGEST_SMALL_PRIME * LARGEST_SMALL_PRIME) return true;

  // n - 1 = d * 2^s with d odd
  let d = n - 1n;
  let s = 0;
  while ((d & 1n) === 0n) {
    d >>= 1n;
    s++;
  }

  nextBase: for (const a of BASES) {
    let x = modPow(a, d, n);
    if (x === 1n || x === n - 1n) continue;
    for (let i = 1; i < s; i++) {
      x = (x * x) % n;
      if (x === n - 1n) continue nextBase;
    }
    return false;
  }
  return true;
}

/** The smallest prime larger than n. */
export function nextPrime(n: bigint): bigint {
  if (n < 2n) return 2n;
  let candidate = n + 1n;
  if ((candidate & 1n) === 0n) candidate++;
  while (!isPrime(candidate)) candidate += 2n;
  return candidate;
}

/** The largest prime smaller than n, or null when there is none (n ≤ 2). */
export function prevPrime(n: bigint): bigint | null {
  if (n <= 2n) return null;
  if (n === 3n) return 2n;
  let candidate = n - 1n;
  if ((candidate & 1n) === 0n) candidate--;
  while (!isPrime(candidate)) candidate -= 2n;
  return candidate;
}

export function gcd(a: bigint, b: bigint): bigint {
  while (b !== 0n) [a, b] = [b, a % b];
  return a < 0n ? -a : a;
}
