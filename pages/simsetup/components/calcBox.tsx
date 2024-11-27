import Head from 'next/head'
import Link from 'next/link';
import React, { useEffect } from "react";

import styles from '../styles/Home.module.css';

import containsPrefix from '../tools/my_numbers'
import calcEqivalentValue from '../tools/my_numbers'

export default function CalcBox(props) {
  const [f0, setf0] = React.useState('1000');
  const [ncyc, setncyc] = React.useState('7');
  const [npts, setnpts] = React.useState('16384');
  const [fs, setfs] = React.useState(calcFs(npts, f0, ncyc));

  const [T0, setT0] = React.useState(calcT0(f0));
  const [Ts, setTs] = React.useState(calcTs(fs));
  const [f_res, setf_res] = React.useState(calcfres(fs, npts));
  const [npts0, setnpts0] = React.useState(calcnpts0(npts, ncyc));

  const [tstart, settstart] = React.useState(0);
  const [tstop, settstop] = React.useState(calc_tstop(tstart, T0, ncyc));

  /**
   * f0 = ncyc * fs / npts
   * @param ncyc number of cycles/periods of f0
   * @param fs sampling frequency
   * @param npts number of samples
   * @returns f0
   */
  function calcF0(ncyc: number | string, fs: number | string, npts: number | string) {
    ncyc = calcEqivalentValue(ncyc);
    fs = calcEqivalentValue(fs);
    npts = calcEqivalentValue(npts);

    if (npts <= 0) {
      return ''
    }

    // return (Number(ncyc)*Number(fs)/Number(npts)).toString()
    return (ncyc*fs/npts).toString()
  }

  /**
   * Fs = npts * f0 / ncyc
   * @param npts number of samples
   * @param f0 fundamental frequency
   * @param ncyc number of cycles/periods of f0
   * @returns Fs
   */
  function calcFs(npts: number | string, f0: number | string, ncyc: number | string) {
    npts = calcEqivalentValue(npts);
    f0 = calcEqivalentValue(f0);
    ncyc = calcEqivalentValue(ncyc);

    if (ncyc <= 0) {
      return ''
    }

    // return (Number(npts)*Number(f0)/Number(ncyc)).toString()
    return (npts*f0/ncyc).toString()
  }

  function calcNcyc(npts: number | string, f0: number | string, fs: number | string) {
    npts = calcEqivalentValue(npts);
    f0 = calcEqivalentValue(f0);
    fs = calcEqivalentValue(fs);

    if (fs <= 0) {
      return ''
    }

    // return (Number(npts)*Number(f0)/Number(fs)).toString()
    return (npts*f0/fs).toString()
  }

  function calcNpts(ncyc: number | string, fs: number | string, f0: number | string) {
    ncyc = calcEqivalentValue(ncyc);
    fs = calcEqivalentValue(fs);
    f0 = calcEqivalentValue(f0);

    if (f0 <= 0) {
      return ''
    }

    // return (Number(ncyc)*Number(fs)/Number(f0)).toString()
    return (ncyc*fs/f0).toString()
  }

  function calcT0(f0: number | string) {
    f0 = calcEqivalentValue(f0);

    if (f0 <= 0) {
      return ''
    }

    // console.log(f0)

    // return (Number(1)/Number(f0)).toString()
    return (1/f0).toString()
  }

  /**
   * Ts = 1/Fs
   * @param fs sampling frequency
   * @returns Ts
   */
  function calcTs(fs: number | string) {
    fs = calcEqivalentValue(fs);

    if (fs <= 0) {
      return ''
    }

    // return (Number(1)/Number(fs)).toString()
    return (1/fs).toString()
  }

  function calcfres(fs: number | string, npts: number | string) {
    fs = calcEqivalentValue(fs);
    npts = calcEqivalentValue(npts);

    if (npts <= 0) {
      return ''
    }

    // return (Number(fs)/Number(npts)).toString()
    return (fs/npts).toString()
  }

  function calcnpts0(npts: number | string, ncyc: number | string) {
    npts = calcEqivalentValue(npts);
    ncyc = calcEqivalentValue(ncyc);

    if (ncyc <= 0) {
      return ''
    }

    // return (Number(npts)/Number(ncyc)).toString()
    return (npts/ncyc).toString()
  }

  function calc_tstop(tstart: number | string, T0: number | string, ncyc: number | string) {
    tstart = calcEqivalentValue(tstart);
    T0 = calcEqivalentValue(T0);
    ncyc = calcEqivalentValue(ncyc);

    // return (Number(tstart) + Number(T0)*Number(ncyc)).toString()
    return (tstart + T0*ncyc).toString()
  }

  useEffect(() => {
    // run something every time something in the dependency array changes
    update_values()
  }, [f0, fs, ncyc, npts, props.precision]); // <-- dependency array

  useEffect(() => {
    setT0(calcT0(f0));
  }, [f0]);

  useEffect(() => {
    setTs(calcTs(fs));
  }, [fs]);

  useEffect(() => {
    setf_res(calcfres(fs, npts))
  }, [fs, npts]);

  useEffect(() => {
    setnpts0(calcnpts0(npts, ncyc))
  }, [npts, ncyc]);

  useEffect(() => {
    settstop(calc_tstop(tstart, T0, ncyc))
  }, [tstart, T0, ncyc]);

  function update_values() {
    if (props.f0_readOnly) {
      let f0 = calcF0(ncyc, fs, npts)
      if (!containsPrefix(f0)) {
        let value = calcEqivalentValue(f0);
        f0 = value.toPrecision(props.precision)
      }
      setf0(f0)
    }
    else if (props.fs_readOnly) {
      let fs = calcFs(npts, f0, ncyc)
      if (!containsPrefix(fs)) {
        let value = calcEqivalentValue(fs);
        fs = value.toPrecision(props.precision)
      }
      setfs(fs)
    }
    else if (props.ncyc_readOnly) {
      let ncyc = calcNcyc(npts, f0, fs)
      if (!containsPrefix(ncyc)) {
        let value = calcEqivalentValue(ncyc);
        ncyc = value.toPrecision(props.precision)
      }
      setncyc(ncyc)
    }
    else if (props.npts_readOnly) {
      let npts = calcNpts(ncyc, fs, f0)
      if (!containsPrefix(npts)) {
        let value = calcEqivalentValue(npts);
        npts = value.toPrecision(props.precision)
      }
      setnpts(npts)
    }
  }

  function updateValue_f0(e) {
    let new_value = e.target.value as string;
    let value = calcEqivalentValue(new_value);

    // if (!containsPrefix(new_value)) {
    //   new_value = value.toPrecision(props.precision)
    // }

    if (value >= 0) {
      setf0(new_value);
    }
  }

  function updateValue_ncyc(e) {
    let new_value = e.target.value as string;
    let value = calcEqivalentValue(new_value);

    if (value >= 0) {
      setncyc(new_value);
    }
  }

  function updateValue_npts(e) {
    let new_value = e.target.value as string;
    let value = calcEqivalentValue(new_value);

    if (value >= 0) {
      setnpts(new_value);
    }
  }

  function updateValue_fs(e) {
    let new_value = e.target.value as string;
    let value = calcEqivalentValue(new_value);

    if (value >= 0) {
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
            <input type="text" className={styles.calcBox} readOnly={props.f0_readOnly} name="f0" id="f0" value={f0} onChange={updateValue_f0}/>

            <br/>
            <label htmlFor="fs">Fs</label>
            <input type="text" className={styles.calcBox} readOnly={props.fs_readOnly} name="fs" id="fs" value={fs} onChange={updateValue_fs}/>

            <br/>
            <label htmlFor="ncyc">Ncyc</label>
            <input type="text" className={styles.calcBox} readOnly={props.ncyc_readOnly} name="ncyc" id="ncyc" value={ncyc} onChange={updateValue_ncyc}/>

            <br/>
            <label htmlFor="npts">Npts</label>
            <input type="text" className={styles.calcBox} readOnly={props.npts_readOnly} name="npts" id="npts" value={npts} onChange={updateValue_npts}/>

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
            <label htmlFor="npts0">Npts0</label>
            <input type="number" className={styles.calcBox} readOnly={true} name="npts0" id="npts0" value={npts0}/>

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