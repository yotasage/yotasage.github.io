// https://en.wikipedia.org/wiki/Metric_prefix

/**
 * Advanced numbers
 */
// export default class Anum {
    // constructor(value, prefix) {
    //     this.value: Number = value;
    //     this
    // }
    
    export default function calcEqivalentValue(number: string | number): number { // , prefix?: undefined | string
        if (typeof number === "number") {
            return number;
        }
        
        let value = Number(number.toString().replace(/[^0-9.Ee+-]/g,'')); // /\D/g
        let prefix: string = number.toString().replace(/[0-9.e+-]/g, '')
        let prefix_value = prefixes[prefix] as number | undefined;

        if (prefix_value === undefined) {
            prefix_value = 1
        }

        // console.log(value, prefix, prefix_value)

        return value*prefix_value as number
    }

    export function containsPrefix(number: string | number): boolean {
        if (typeof number === "number") {
            return false;
        }

        let prefix: string = number.toString().replace(/[0-9.e+-]/g, '')
        // console.log(prefix)

        if (prefix != '') {
            return true
        }
        return false;
    }
// }


export const prefixes = {
    Q: 10**30,  // quetta
    R: 10**27,  // ronna
    Y: 10**24,  // yotta
    Z: 10**21,  // zetta
    E: 10**18,  // exa
    P: 10**15,  // peta
    T: 10**12,  // tera
    G: 10**9,   // giga
    M: 10**6,   // mega
    k: 10**3,   // kilo
    h: 10**2,   // hecto
    da: 10**1,  // deca

    d: 10**-1,  // deci
    c: 10**-2,  // centi
    m: 10**-3,  // milli
    u: 10**-6,  // micro
    µ: 10**-6,  // micro
    n: 10**-9,  // nano
    p: 10**-12, // pico
    f: 10**-15, // femto
    a: 10**-18, // atto
    z: 10**-21, // zepto
    y: 10**-24, // yocto
    r: 10**-27, // ronto
    q: 10**-30  // quecto
}