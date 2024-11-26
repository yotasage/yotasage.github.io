import Head from 'next/head'
import Link from 'next/link';
import React, { useEffect } from "react";

import styles from '../styles/Home.module.css';

export default function PowerBox() {
  const [power, setpower] = React.useState(16);
  const [isexactpower, setisexactpower] = React.useState(true);

  function updateValue_power(e) {
    let new_value = e.target.value;

    if (new_value > 0) {
      setpower(new_value);
      setisexactpower(new_value && !(new_value & (new_value-1)));
    }
  }

  function onNextPower(op, num) {
    // console.log(op, num)

    let ref_number = 1
    let new_value = 1

    if (op == 0) {
      new_value = power << num;
    }
    else if (op == 1) {
      new_value = power >> num;
    }
    
    if (new_value > 0) {
      setpower(new_value);
      setisexactpower(new_value && !(new_value & (new_value-1)));
    }
  }

  let isexactpower_text = null
  if (isexactpower) {
    isexactpower_text = <p>Yes✅</p>
  }
  else {
    isexactpower_text = <p>No ❌</p>
  }

  return (
    <div className={styles.grid}>
    <div className={styles.card}>
      <p>Power of 2</p><br></br>

      <p>Exact power of 2:</p>
      {isexactpower_text}
      <input type="number" readOnly={false} name="power" value={power} onChange={updateValue_power}/><br/>
      <button onClick={function(){onNextPower(0, 4);}}>&lt;&lt;4</button>
      <button onClick={function(){onNextPower(0, 1);}}>&lt;&lt;1</button>
      <button onClick={function(){onNextPower(1, 1);}}>&gt;&gt;1</button>
      <button onClick={function(){onNextPower(1, 4);}}>&gt;&gt;4</button>

    </div>
  </div>
  )
}