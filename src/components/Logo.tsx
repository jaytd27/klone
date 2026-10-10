import { useId } from 'react'
import { brand } from '../theme/tokens'

/*
 * The Kwoon mark: a crescent with a K page planted in its curve, inlined from
 * the theme package's kwoon-mark-themed.svg so components.css colours it from
 * the active theme. The crescent is the outer circle (27.95, 32, r 24) minus
 * the inner one (45.78, 32, r 20).
 */

interface LogoProps {
  size?: number
  /** Makes the mark stand for the product; without it the mark is decorative and hidden from assistive tech. */
  label?: string
  /** Loader: the crescent slowly waxes and the K page rises into place. */
  loading?: boolean
  className?: string
}

export function Logo({ size = 26, label, loading = false, className = '' }: LogoProps) {
  const maskId = useId()
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`kw-mark ${loading ? 'kw-mark--loading' : ''} ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {loading ? (
        <>
          <mask id={maskId}>
            <circle cx="27.95" cy="32" r="24" fill="#fff" />
            <circle className="kw-mark__cut" cx="45.78" cy="32" r="20" fill="#000" />
          </mask>
          <circle className="kw-mark__moon" cx="27.95" cy="32" r="24" mask={`url(#${maskId})`} />
        </>
      ) : (
        <path className="kw-mark__moon" d="M41.8 12.4A24 24 0 1 0 41.8 51.6A20 20 0 1 1 41.8 12.4z" />
      )}
      <circle className="kw-mark__crater" cx="12" cy="30" r="2.6" />
      <circle className="kw-mark__crater" cx="16" cy="44" r="2" />
      <ellipse className="kw-mark__crater" cx="32" cy="50.5" rx="7" ry="1.6" />
      <g className="kw-mark__planted">
        <path className="kw-mark__page" d="M30 18h16l5 5v14H30z" />
        <path className="kw-mark__fold" d="M46 18v5h5z" />
        <path className="kw-mark__k" d="M36 23v10M36.5 28l6.5-5.5M36.5 28l6.5 5.5" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path className="kw-mark__pole" d="M31 18v33" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  )
}

/** "Kwoon" with the two o's in the accent. `display` is for 24 px and up. */
export function Wordmark({ display = false, className = '' }: { display?: boolean; className?: string }) {
  return (
    <span className={`kw-wordmark ${display ? 'kw-wordmark--display' : ''} ${className}`}>
      Kw<span className="kw-wordmark__oo">oo</span>n
    </span>
  )
}

/** Mark, wordmark and tagline stacked: the splash and the empty state. */
export function StackedLockup({ loading = false }: { loading?: boolean }) {
  return (
    <div className="kw-lockup kw-lockup--stacked">
      <Logo loading={loading} />
      <Wordmark display />
      <p className="kw-tagline">{brand.tagline}</p>
    </div>
  )
}
