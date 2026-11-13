export function MudraIcon({ filled = true, className = 'w-5 h-5' }: { filled?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="10"
        fill={filled ? '#9a6e17' : 'rgba(26, 16, 12, 0.7)'}
        stroke="#0a0605"
        strokeWidth="1.5"
      />
      <circle
        cx="12"
        cy="12"
        r="7.8"
        fill={filled ? '#e5b84b' : 'none'}
        stroke={filled ? '#fff0a8' : '#5e462a'}
        strokeWidth="1"
      />
      <rect
        x="9.2"
        y="9.2"
        width="5.6"
        height="5.6"
        transform="rotate(45 12 12)"
        fill={filled ? '#6b4709' : 'none'}
        stroke={filled ? '#ffdf7a' : '#5e462a'}
        strokeWidth="1"
      />
    </svg>
  );
}

export function DoughDollIcon({ active = true, className = 'w-5 h-5' }: { active?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 3.2a2.7 2.7 0 0 1 2.7 2.7c0 1-.55 1.88-1.36 2.34l2.86 1.56a1.1 1.1 0 0 1-.95 1.98L13.6 11v4.4l1.6 4.4a1.1 1.1 0 0 1-2.06.76L12 17.4l-1.14 3.16a1.1 1.1 0 0 1-2.06-.76l1.6-4.4V11l-1.65.78a1.1 1.1 0 0 1-.95-1.98l2.86-1.56A2.7 2.7 0 0 1 9.3 5.9 2.7 2.7 0 0 1 12 3.2Z"
        fill={active ? '#dfc292' : 'rgba(26, 16, 12, 0.7)'}
        stroke="#0a0605"
        strokeWidth="1.4"
      />
      {active && <circle cx="12" cy="5.5" r="0.7" fill="#b81d18" />}
    </svg>
  );
}

export function TumbbadCrest({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden="true">
      <circle cx="40" cy="40" r="36" fill="rgba(18, 6, 6, 0.75)" stroke="#7b5a2b" strokeWidth="1.5" />
      <circle cx="40" cy="40" r="29" fill="none" stroke="#c89d42" strokeWidth="0.9" strokeDasharray="3 3" />
      <path
        d="M40 13 C52 24, 57 38, 40 66 C23 38, 28 24, 40 13 Z"
        fill="rgba(130, 14, 14, 0.55)"
        stroke="#d4af37"
        strokeWidth="1.6"
      />
      <rect
        x="33"
        y="33"
        width="14"
        height="14"
        transform="rotate(45 40 40)"
        fill="#e5b84b"
        stroke="#1b0d06"
        strokeWidth="1.5"
      />
      <circle cx="40" cy="40" r="2.6" fill="#7d0c0c" />
    </svg>
  );
}

export function SoundIcon({ muted }: { muted: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor" fillOpacity="0.2" />
      {muted ? (
        <>
          <path d="m16 9 5 6" />
          <path d="m21 9-5 6" />
        </>
      ) : (
        <>
          <path d="M15.5 8.5a5 5 0 0 1 0 7" />
          <path d="M18.5 6a8.5 8.5 0 0 1 0 12" />
        </>
      )}
    </svg>
  );
}

export function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  );
}

export function RestartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M4 12a8 8 0 1 0 2.3-5.6L4 8.7" />
      <path d="M4 4v4.7h4.7" />
    </svg>
  );
}
