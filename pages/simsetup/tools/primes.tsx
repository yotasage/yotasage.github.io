// https://cr.yp.to/primegen.html


// The browser seems to not be able to handle numbers much larger than 8802407208871841


// https://www.geeksforgeeks.org/sieve-of-atkin/
// Author: nitin gfgking
// Updated: 2023-03-31
// Read: 2024-11-25

// Javascript program for implementation
// of Sieve of Atkin

export function SieveOfAtkin(limit)
{
     
    // 2 and 3 are known to be prime
    if (limit > 2)
        document.write(2 + " ");
    if (limit > 3)
        document.write(3 + " ");
 
    // Initialise the sieve array with false values
    let sieve = new Array()
    sieve[limit+1] = 0;
    for (let i = 0; i <= limit; i++)
        sieve[i] = false;
 
    /* Mark sieve[n] is true if one
       of the following is true:
    a) n = (4*x*x)+(y*y) has odd number of
       solutions, i.e., there exist
       odd number of distinct pairs (x, y)
       that satisfy the equation and
       n % 12 = 1 or n % 12 = 5.
    b) n = (3*x*x)+(y*y) has odd number of
       solutions and n % 12 = 7
    c) n = (3*x*x)-(y*y) has odd number of
       solutions, x > y and n % 12 = 11 
    */
    for (let x = 1; x * x <= limit; x++)
    {
        for (let y = 1; y * y <= limit; y++)
        {
             
            // Main part of Sieve of Atkin
            let n = (4 * x * x) + (y * y);
            if (n <= limit && (n % 12 == 1 ||
                                n % 12 == 5))
                sieve[n] ^= true;
 
            n = (3 * x * x) + (y * y);
            if (n <= limit && n % 12 == 7)
                sieve[n] ^= true;
 
            n = (3 * x * x) - (y * y);
            if (x > y && n <= limit &&
                            n % 12 == 11)
                sieve[n] ^= true;
        }
    }
 
    // Mark all multiples of
    // squares as non-prime
    for (let r = 5; r * r <= limit; r++) {
        if (sieve[r]) {
            for (i = r * r; i <= limit;
                            i += r * r)
                sieve[i] = false;
        }
    }
 
    // Print primes
    // using sieve[]
    for (let a = 5; a <= limit; a++)
        if (sieve[a])
            document.write(a , " ");
        document.write("<br>");
}

 
// https://www.geeksforgeeks.org/segmented-sieve-print-primes-in-a-range/
// Author: phaisng17
// Updated: 2023-01-27
// Read: 2024-11-25


export function sieveOfEratosthenes(n) { 
  
    // Create boolean array and fill true 
    let prime = new Array(n + 1).fill(true); 
      
    // Make mulltiples of prime number false 
    for (let i = 2; i <= n; ++i) { 
        if (prime[i]) 
            for (let j = i * i; j < n + 1; j += i) { 
                prime[j] = false; 
            } 
    } 
      
    // Extract all indexes for true values 
    let primeArray = prime.reduce((acc, e, i) => { 
        if (e == true && i >= 2) { 
            acc.push(i); 
        } 
        return acc; 
    }, []); 
    // Return resultant array 
    return primeArray; 
}



// https://www.geeksforgeeks.org/javascript-program-for-sieve-of-eratosthenes/
// Author:
// Updated: 2023-09-20
// Read: 2024-11-25
 
// fillPrime function fills primes from 2 to sqrt of high in
// chprime list
function fillPrimes(chprime, high)
{
 
    var ck = Array(high + 1).fill(true);
 
    var l = Math.sqrt(high);
    for (let i = 2; i <= l; i++) {
        if (ck[i]) {
            for (let j = i * i; j <= l; j += i) {
                ck[j] = false;
            }
        }
    }
    for (let k = 2; k <= l; k++) {
        if (ck[k]) {
            chprime.push(k);
        }
    }
}
 
// in segmented sieve we check for prime from range [low,
// high]
export function segmentedSieve(low, high)
{
 
    var chprime = [];
    fillPrimes(chprime, high);
 
    // chprimes has primes in range [2,sqrt(n)]
    // we take primes from 2 to sqrt[n] because the
    // multiples of all primes below high are marked by these
    // primes in range 2 to sqrt[n] for eg: for number 7 its
    // multiples i.e 14 is marked by 2, 21 is marked by 3,
    // 28 is marked by 4, 35 is marked by 5, 42 is marked 6,
    // so 49 will be first marked by 7 so all number before
    // 49 are marked by primes in range [2,sqrt(49)]
    var prime = Array(high - low + 1).fill(true);
    for (let i of chprime) {
        var lower = Math.floor(low / i);
        // here lower means the first multiple of prime
        // which is in range [low,high] for eg: 3's first
        // multiple in range [28,40] is 30
        if (lower <= 1) {
            lower = i + i;
        }
        else if ((low % i) != 0) {
            lower = (lower * i) + i;
        }
        else {
            lower = lower * i;
        }
        for (var j = lower; j <= high; j = j + i) {
            prime[j - low] = false;
        }
    }
 
    // Extract all indexes for true values 
    let primeArray = prime.reduce((acc, e, i) => { 
        if (e == true && i >= 2) { 
            acc.push(i); 
        } 
        return acc; 
    }, []); 
    // Return resultant array 
    return primeArray; 

    // for (var i = low; i <= high; i++) {
    //     if (prime[i - low] == true) {
    //         process.stdout.write(i + " ");
    //     }
    // }
}


// https://www.geeksforgeeks.org/program-to-find-the-next-prime-number/
// Author: Mayank Tyagi
// Updated: 2021-07-27
// Read: 2024-11-25
 
// Function that returns true if n is prime else returns false 
export function isPrime(n) 
{ 
    // Corner cases 
    if (n <= 1) return false; 
    if (n <= 3) return true; 
     
    // This is checked so that we can skip 
    // middle five numbers in below loop 
    if (n%2 == 0 || n%3 == 0) return false; 
     
    for (let i=5; i*i<=n; i=i+6) 
        if (n%i == 0 || n%(i+2) == 0) 
        return false; 
     
    return true; 
} 
 
// Function to return the smallest 
// prime number greater than N 
 
export default function nextPrime(N) 
{ 
 
    // Base case 
    if (N <= 1) 
        return 2; 
 
    let prime = N; 
    let found = false; 
 
    // Loop continuously until isPrime returns 
    // true for a number greater than n 
    while (!found) { 
        prime++; 
 
        if (isPrime(prime)) 
            found = true; 
    } 
 
    return prime; 
}

// Based on the above.

export function prevPrime(N) 
{ 
 
    // Base case 
    if (N <= 2) 
        return 2; 
 
    let prime = N; 
    let found = false; 
 
    // Loop continuously until isPrime returns 
    // true for a number greater than n 
    while (!found) { 
        prime--; 
 
        if (isPrime(prime)) 
            found = true; 
    } 
 
    return prime; 
} 