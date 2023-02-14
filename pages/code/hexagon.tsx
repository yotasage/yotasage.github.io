import Head from 'next/head'
import Link from 'next/link';

import styles from '../../styles/Home.module.css';
import boardstyles from '../dndem/styles/board.module.css';

export default function Hexagon() {
    //let viewBox = this.state.viewBox.x + ' ' + this.state.viewBox.y + ' ' + this.state.viewBox.h + ' ' + this.state.viewBox.w
    let viewBox = '-150 -125 300 300'

    return (
        <div className={styles.container}>
            <Head>
                <title>Create Next App</title>
                <link rel="icon" href="/favicon.ico" />
            </Head>

            <main>
                <h1 className={styles.title}>
                    Welcome to Jonathan's Hexagon project based on <a href="https://nextjs.org">Next.js!</a>
                </h1>

                <p className={styles.description}>
                    Get started by checking out the cool stuff below.
                </p>

                <div className={styles.grid}>
                    <Link href="/" className={styles.card}>
                        <h3>Return to Homepage &rarr;</h3>
                        <p>Go back to the previous page</p>
                    </Link>
                    <Link href="../dndem/indexDndem" className={styles.card}>
                        <h3>DnD encounter map &rarr;</h3>
                        <p>Check out the DnD encounter map</p>
                    </Link>

                    <div id={styles.card}>
                        <svg xmlns="http://www.w3.org/2000/svg" version="1.1" id={boardstyles.Map} strokeWidth="0.2" stroke="black"
                             viewBox={viewBox}>
                            <polygon points="6.92820323027551,-3.9999999999999996 6.92820323027551,3.9999999999999996 4.898587196589413e-16,8 -6.92820323027551,3.9999999999999996 -6.928203230275509,-4.000000000000001 -1.4695761589768238e-15,-8 "></polygon>
                        </svg>
                    </div>
                </div>


            </main>

            <footer>
                <a
                    href="https://vercel.com?utm_source=create-next-app&utm_medium=default-template&utm_campaign=create-next-app"
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Powered by{' '}
                    <img src="/vercel.svg" alt="Vercel" className={styles.logo} />
                </a>
            </footer>

            <style jsx>{`
        main {
          padding: 5rem 0;
          flex: 1;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        footer {
          width: 100%;
          height: 100px;
          border-top: 1px solid #eaeaea;
          display: flex;
          justify-content: center;
          align-items: center;
        }
        footer img {
          margin-left: 0.5rem;
        }
        footer a {
          display: flex;
          justify-content: center;
          align-items: center;
          text-decoration: none;
          color: inherit;
        }
        code {
          background: #fafafa;
          border-radius: 5px;
          padding: 0.75rem;
          font-size: 1.1rem;
          font-family: Menlo, Monaco, Lucida Console, Liberation Mono,
            DejaVu Sans Mono, Bitstream Vera Sans Mono, Courier New, monospace;
        }
      `}</style>

            <style jsx global>{`
        html,
        body {
          padding: 0;
          margin: 0;
          font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto,
            Oxygen, Ubuntu, Cantarell, Fira Sans, Droid Sans, Helvetica Neue,
            sans-serif;
        }
        * {
          box-sizing: border-box;
        }
      `}</style>
        </div>
    )
}