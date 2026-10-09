/**
 * The Kwoon paper-cat mark, inlined so components.css colours it from the
 * active theme. `label` makes it stand for the product; without it the mark
 * is decorative and hidden from assistive tech.
 */
export function Logo({ size = 26, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={`kw-mark ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path className="kw-mark__body" d="M14 18V6l12 10h12l12-10v40a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8z" />
      <path className="kw-mark__shade" d="M14 6l12 10H18zM50 6L38 16h8z" />
      <g className="kw-mark__eyes">
        <ellipse className="kw-mark__feature" cx="25" cy="30" rx="3" ry="4" />
        <ellipse className="kw-mark__feature" cx="39" cy="30" rx="3" ry="4" />
      </g>
      <path className="kw-mark__feature" d="M30 38h4l-2 3z" />
      <path className="kw-mark__whisker" d="M8 36h10M8 41h10M46 36h10M46 41h10" strokeWidth="2" strokeLinecap="round" fill="none" />
    </svg>
  )
}
