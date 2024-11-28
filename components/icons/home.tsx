import * as React from "react"
import { SVGProps } from "react"

export default function HomeIcon(props) {

    let width = props.width;
    let height = props.height;
    let color = props.color;

    if (width === undefined) {
        width = 50
    }

    if (height === undefined) {
        height = 50
    }

    if (color === undefined) {
        color = "#fff"
    }

    return (
        <SvgHomeIcon width={width} height={height} color={color}></SvgHomeIcon>
    )
}

// Original SVG drawn in Inkscape can be found as home.svg in the public folder.
// SvgHomeIcon has been generated based on the home.svg using the following website:
// https://react-svgr.com/playground/?typescript=true

const SvgHomeIcon = (props) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={props.width}
        height={props.height}
        viewBox="0 0 3.253 3.703"
        {...props}
    >
        <path
        d="M103.21 149.91h-.499v-2.206l1.502-1.247 1.502 1.247v2.206h-1.502c-.5 0-.5-.41-.5-.755v-.75h.997v.995"
        style={{
            fill: "none",
            stroke: props.color,
            strokeWidth: 0.25,
            strokeLinecap: "round",
            strokeLinejoin: "round",
            strokeMiterlimit: 1,
            strokeDasharray: "none",
            paintOrder: "markers stroke fill",
        }}
        transform="translate(-102.586 -146.332)"
        />
    </svg>
)
// export default SvgHomeIcon