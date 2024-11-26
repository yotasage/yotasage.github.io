import Head from 'next/head'
import Link from 'next/link';
import React, { useEffect } from "react";

import styles from '../styles/Home.module.css';

export default function CalcBox(props) {
  const [f0, setf0] = React.useState(1000);
  const [ncyc, setncyc] = React.useState(3);
  const [npts, setnpts] = React.useState(1024);
  const [fs, setfs] = React.useState(npts*f0/ncyc);

  const [T0, setT0] = React.useState(1/f0);
  const [Ts, setTs] = React.useState(1/fs);
  const [f_res, setf_res] = React.useState(fs/npts);
  const [npts0, setnpts0] = React.useState(npts/ncyc);

  const [tstart, settstart] = React.useState(0);
  const [tstop, settstop] = React.useState(T0*ncyc);

  useEffect(() => {
    // run something every time something in the dependency array changes
    update_values()
  }, [f0, fs, ncyc, npts]); // <-- dependency array

  useEffect(() => {
    setT0(1/f0);
  }, [f0]);

  useEffect(() => {
    setTs(1/fs);
    setf_res(fs/npts)
  }, [fs]);

  useEffect(() => {
    setf_res(fs/npts)
  }, [npts]);

  useEffect(() => {
    setnpts0(npts/ncyc)
  }, [npts, ncyc]);

  useEffect(() => {
    settstop(tstart + T0*ncyc)
  }, [tstart, T0, ncyc]);

  function update_values() {
    if (props.f0_readOnly) {
      setf0(ncyc*fs/npts)
    }
    else if (props.fs_readOnly) {
      setfs(npts*f0/ncyc)
    }
    else if (props.ncyc_readOnly) {
      setncyc(npts*f0/fs)
    }
    else if (props.npts_readOnly) {
      setnpts(ncyc*fs/f0)
    }
  }

  function updateValue_f0(e) {
    let new_value = e.target.value;
    if (new_value > 0) {
      setf0(new_value);
    }
  }

  function updateValue_ncyc(e) {
    let new_value = e.target.value;
    if (new_value > 0) {
      setncyc(new_value);
    }
  }

  function updateValue_npts(e) {
    let new_value = e.target.value;
    if (new_value > 0) {
      setnpts(new_value);
    }
  }

  function updateValue_fs(e) {
    let new_value = e.target.value;
    if (new_value > 0) {
      setfs(new_value);
    }
  }

  let header = null
  if (props.f0_readOnly) {
    header = <p>Calculating f0</p>
  }
  else if (props.fs_readOnly) {
    header = <p>Calculating Fs</p>
  }
  else if (props.ncyc_readOnly) {
    header = <p>Calculating Ncyc</p>
  }
  else if (props.npts_readOnly) {
    header = <p>Calculating Npts</p>
  }

  return (
      <div className={styles.card}>
        {header}

        <div className={styles.grid}>
          <div className={styles.card}>
          
            <label htmlFor="f0">f0</label>
            <input type="number" className={styles.calcBox} readOnly={props.f0_readOnly} name="f0" id="f0" value={f0} onChange={updateValue_f0}/>

            <br/>
            <label htmlFor="fs">Fs</label>
            <input type="number" className={styles.calcBox} readOnly={props.fs_readOnly} name="fs" id="fs" value={fs} onChange={updateValue_fs}/>

            <br/>
            <label htmlFor="ncyc">Ncyc</label>
            <input type="number" className={styles.calcBox} readOnly={props.ncyc_readOnly} name="ncyc" id="ncyc" value={ncyc} onChange={updateValue_ncyc}/>

            <br/>
            <label htmlFor="npts">Npts</label>
            <input type="number" className={styles.calcBox} readOnly={props.npts_readOnly} name="npts" id="npts" value={npts} onChange={updateValue_npts}/>

          </div>

          <div className={styles.card}>
            
            <label htmlFor="T0">T0</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="T0" id="T0" value={T0}/>

            <br/>
            <label htmlFor="TS">Ts</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="TS" id="TS" value={Ts}/>

            <br/>
            <label htmlFor="f_Res">f_Res</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="f_Res" id="f_Res" value={f_res}/>

            <br/>
            <label htmlFor="npts">Npts</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="npts" id="npts" value={npts0}/>

          </div>

          <div className={styles.card}>
            
            <label htmlFor="t_start">t_start</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="t_start" id="t_start" value={tstart}/>

            <br/>
            <label htmlFor="t_stop">t_stop</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="t_stop" id="t_stop" value={tstop}/>

          </div>

        </div>
        
      </div>
  )
}