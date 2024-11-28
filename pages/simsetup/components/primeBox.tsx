import Head from 'next/head'
import Link from 'next/link';
import React, { useEffect } from "react";

import styles from '../styles/Home.module.css';

import nextPrime, {prevPrime, isPrime} from '../tools/primes';

export default function PrimeBox() {
  const [prime, setprime] = React.useState(11);
  const [isprime, setisprime] = React.useState(true);

  function updateValue_prime(e) {
    let new_value = Math.round(e.target.value);
    
    if (new_value > 0) {
      setisprime(isPrime(new_value));
      setprime(new_value);
    }
  }

  function onNextPrime(op, num) {
    // console.log(op, num)

    let ref_number = 1
    let new_value = 1

    if (op == 0) {
      ref_number = Math.round(prime / num);
      new_value = nextPrime(ref_number);
    }
    else if (op == 1) {
      ref_number = Math.round(prime * num);
      new_value = nextPrime(ref_number);
    }
    else if (op == 2) {
      new_value = prevPrime(prime);
    }
    else if (op == 3) {
      new_value = nextPrime(prime);
    }

    setisprime(true);
    
    if (new_value > 0) {
      setprime(new_value);
    }
  }

  let isprime_text = null
  if (isprime) {
    isprime_text = <>Yes✅</>
  }
  else {
    isprime_text = <>No ❌</>
  }

  return (
    <div className={styles.grid}>
    <div className={styles.card}>
      <h3>Prime</h3>

      <p>Prime number: {isprime_text}</p>
      
      <input type="number" readOnly={false} name="prime" value={prime} onChange={updateValue_prime}/><br/>
      <button onClick={function(){onNextPrime(0, 1000);}}>/1000</button>
      <button onClick={function(){onNextPrime(0, 10);}}>/10</button>
      <button onClick={function(){onNextPrime(0, 2);}}>/2</button>
      <button onClick={function(){onNextPrime(2, 1);}}>prev</button>
      <button onClick={function(){onNextPrime(3, 1);}}>next</button>
      <button onClick={function(){onNextPrime(1, 2);}}>2x</button>
      <button onClick={function(){onNextPrime(1, 10);}}>10x</button>
      <button onClick={function(){onNextPrime(1, 1000);}}>1000x</button>
    </div>
  </div>
  )
}