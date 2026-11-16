import type { JumpscareKind } from '../game/types';

interface JumpscareOverlayProps {
  active: boolean;
  kind: JumpscareKind | null;
}

export function JumpscareOverlay({ active, kind }: JumpscareOverlayProps) {
  if (!active || !kind) return null;

  const isCapture = kind === 'capture';

  return (
    <div
      data-testid="jumpscare-overlay"
      data-kind={kind}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-30 flex items-center justify-center overflow-hidden"
      style={{
        background: isCapture
          ? 'radial-gradient(circle at center, rgba(165, 8, 8, 0.42) 0%, rgba(18, 0, 0, 0.92) 72%)'
          : 'radial-gradient(circle at center, rgba(135, 6, 6, 0.25) 0%, rgba(10, 0, 0, 0.72) 78%)',
      }}
    >
      <svg
        viewBox="0 0 320 320"
        className={`animate-jumpscare select-none ${
          isCapture ? 'w-[92vmin] h-[92vmin] opacity-95' : 'w-[76vmin] h-[76vmin] opacity-75'
        }`}
      >
        {/* Jagged Crimson Aura */}
        <circle cx="160" cy="160" r="142" fill="rgba(45, 2, 2, 0.55)" />

        {/* Curved Horns */}
        <path
          d="M94 98 C58 55, 56 26, 76 14 C74 42, 90 66, 118 88 Z"
          fill="#260c0a"
          stroke="#060101"
          strokeWidth="4"
        />
        <path
          d="M226 98 C262 55, 264 26, 244 14 C246 42, 230 66, 202 88 Z"
          fill="#260c0a"
          stroke="#060101"
          strokeWidth="4"
        />

        {/* Gaunt Cranium */}
        <path
          d="M96 110 C96 58, 224 58, 224 110 L216 196 L192 272 L160 288 L128 272 L104 196 Z"
          fill="#1b0404"
          stroke="#050101"
          strokeWidth="5"
        />

        {/* Brow & Cheek Creases */}
        <path d="M108 118 L148 138 M212 118 L172 138" stroke="#610c0c" strokeWidth="5" strokeLinecap="round" />
        <path d="M112 184 L134 218 M208 184 L186 218" stroke="#470707" strokeWidth="4" strokeLinecap="round" />

        {/* Deep Eye Sockets & Blazing Predatory Eyes */}
        <ellipse cx="128" cy="142" rx="22" ry="15" fill="#050000" />
        <ellipse cx="192" cy="142" rx="22" ry="15" fill="#050000" />
        <circle cx="128" cy="142" r="9.5" fill="#ff2200" />
        <circle cx="192" cy="142" r="9.5" fill="#ff2200" />
        <circle cx="128" cy="142" r="3.8" fill="#ffe580" />
        <circle cx="192" cy="142" r="3.8" fill="#ffe580" />

        {/* Hollow Nasal Slits */}
        <path d="M153 166 L148 184 L158 180 Z M167 166 L172 184 L162 180 Z" fill="#070000" />

        {/* Unhinged Screaming Jaw & Jagged Fangs */}
        <path
          d="M118 202 Q160 186 202 202 L194 264 Q160 278 126 264 Z"
          fill="#060000"
          stroke="#4d0808"
          strokeWidth="3"
        />
        <path
          d="M126 202 L134 224 L142 200 L150 220 L160 198 L170 220 L178 200 L186 224 L194 202"
          fill="#cbb59c"
          stroke="#140404"
          strokeWidth="1.5"
        />
        <path
          d="M130 262 L138 242 L146 264 L154 246 L160 266 L166 246 L174 264 L182 242 L190 262"
          fill="#b89f84"
          stroke="#140404"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}
