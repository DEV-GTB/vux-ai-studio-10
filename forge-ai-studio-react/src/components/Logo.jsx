import { useId } from 'react'

export function Logo({ className = 'h-8 w-8', title = 'Vux AI Studio' }) {
  const gradientId = useId()

  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      role="img"
      aria-label={title}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id={gradientId} x1="4" y1="4" x2="44" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4cd7f6" />
          <stop offset="0.55" stopColor="#06b6d4" />
          <stop offset="1" stopColor="#e89337" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="44" height="44" rx="13" fill={`url(#${gradientId})`} />
      <path
        d="M12 14 L24 34 L36 14"
        fill="none"
        stroke="#052430"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="36" cy="14" r="3.2" fill="#052430" />
    </svg>
  )
}

export default Logo
