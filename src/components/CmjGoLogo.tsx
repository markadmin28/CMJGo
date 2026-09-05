import { useId } from 'react'

type CmjGoLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  showWordmark?: boolean
  className?: string
}

const sizes = {
  sm: { icon: 20, gap: 6 },
  md: { icon: 24, gap: 8 },
  lg: { icon: 28, gap: 10 },
} as const

export function CmjGoLogo({
  size = 'md',
  showWordmark = true,
  className = '',
}: CmjGoLogoProps) {
  const { icon, gap } = sizes[size]
  const uid = useId().replace(/:/g, '')

  return (
    <div
      className={`cmj-logo cmj-logo--${size} ${className}`.trim()}
      style={{ gap }}
      aria-label="CMJGo"
    >
      <svg
        className="cmj-logo__mark"
        width={icon}
        height={icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={`${uid}-bg`} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
            <stop stopColor="#8B5CF6" />
            <stop offset="0.5" stopColor="#3B82F6" />
            <stop offset="1" stopColor="#3ECF8E" />
          </linearGradient>
        </defs>

        <rect width="48" height="48" rx="12" fill={`url(#${uid}-bg)`} />
        <path
          d="M14 30.5c0-7.5 5.2-13.5 12.2-13.5"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.95"
        />
        <path
          d="M16.5 34.5c0-9.2 6.4-16.5 15-16.5"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M28 17l7.2 3.2-3.5 6.8"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity="0.95"
        />
        <circle cx="33.5" cy="20.5" r="2.4" fill="#ECFDF5" />
      </svg>

      {showWordmark ? (
        <span className="cmj-logo__word">
          CMJ<span className="cmj-logo__go">Go</span>
        </span>
      ) : null}
    </div>
  )
}
