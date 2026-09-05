import logoSrc from '../assets/cmjgo-logo.png'

type CmjGoLogoProps = {
  size?: 'sm' | 'md' | 'lg'
  /** Extra text beside the seal. Off by default — the image already includes CMJgo. */
  showWordmark?: boolean
  className?: string
}

const sizes = {
  sm: { icon: 36, gap: 8 },
  md: { icon: 88, gap: 10 },
  lg: { icon: 140, gap: 12 },
} as const

export function CmjGoLogo({
  size = 'md',
  showWordmark = false,
  className = '',
}: CmjGoLogoProps) {
  const { icon, gap } = sizes[size]

  return (
    <div
      className={`cmj-logo cmj-logo--${size} ${className}`.trim()}
      style={{ gap }}
      aria-label="CMJgo Corporation"
    >
      <img
        className="cmj-logo__mark"
        src={logoSrc}
        width={icon}
        height={icon}
        alt=""
        draggable={false}
      />

      {showWordmark ? (
        <span className="cmj-logo__word">
          CMJ<span className="cmj-logo__go">go</span>
        </span>
      ) : null}
    </div>
  )
}
