import Head from 'next/head'
import Link from 'next/link';
import React, { useEffect } from "react";

import styles from '../../../styles/Home.module.css';

export default function CalcBox(props) {
  const [f0, setf0] = React.useState(1000);
  const [fs, setfs] = React.useState(10000);
  const [ncyc, setncyc] = React.useState(3);
  const [npts, setnpts] = React.useState(1024);

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
          
            f0
            <input type="number" readOnly={props.f0_readOnly} name="f0" value={f0} onChange={updateValue_f0}/><br/>

            Fs
            <input type="number" readOnly={props.fs_readOnly} name="fs" value={fs} onChange={updateValue_fs}/><br/>

            Ncyc
            <input type="number" readOnly={props.ncyc_readOnly} name="ncyc" value={ncyc} onChange={updateValue_ncyc}/><br/>

            Npts
            <input type="number" readOnly={props.npts_readOnly} name="npts" value={npts} onChange={updateValue_npts}/><br/>

          </div>

          <div className={styles.card}>
            
            T0
            <input type="number" readOnly={true} name="T0" value={T0}/><br/>

            Ts
            <input type="number" readOnly={true} name="TS" value={Ts}/><br/>

            f_res
            <input type="number" readOnly={true} name="ncyc" value={f_res}/><br/>

            Npts0
            <input type="number" readOnly={true} name="npts" value={npts0}/><br/>

          </div>

          <div className={styles.card}>
            
            t_start
            <input type="number" readOnly={true} name="T0" value={tstart}/><br/>

            t_stop
            <input type="number" readOnly={true} name="TS" value={tstop}/><br/>

          </div>

        </div>
        
      </div>
  )
}