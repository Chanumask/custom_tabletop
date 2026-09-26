/**
 * Small hand-drawn line-art icons for the session menu's tab bar
 * (Milestone 10 follow-up, user request) — plain inline SVG, no icon
 * library dependency, `currentColor`-stroked so each inherits its
 * button's text color/state for free.
 */
interface IconProps {
  className?: string;
}

const SIZE = 18;

export function MapIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9 4v14M15 6v14" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function DiceIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="8.5" cy="8.5" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="8.5" r="1.3" fill="currentColor" />
      <circle cx="8.5" cy="15.5" r="1.3" fill="currentColor" />
      <circle cx="15.5" cy="15.5" r="1.3" fill="currentColor" />
      <circle cx="12" cy="12" r="1.3" fill="currentColor" />
    </svg>
  );
}

export function SoundIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path
        d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The speaker, crossed out: someone's sounds silenced (only for you). */
export function SoundOffIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" fill="currentColor" />
      <path
        d="M16.5 9.5l5 5M21.5 9.5l-5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlayersIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <circle cx="17" cy="9" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M15 19c.3-2.2 1.7-3.6 3.5-3.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SettingsIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M12 3v2.2M12 18.8V21M21 12h-2.2M5.2 12H3M18.4 5.6l-1.5 1.5M7.1 16.9l-1.5 1.5M18.4 18.4l-1.5-1.5M7.1 7.1 5.6 5.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function HostIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M4.5 17.5 3.5 8l4.8 3.6L12 5l3.7 6.6L20.5 8l-1 9.5h-15Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M5 20.5h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function CameraIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M9 6.5 10.2 4h3.6L15 6.5h3.2A1.8 1.8 0 0 1 20 8.3v9.2a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5V8.3a1.8 1.8 0 0 1 1.8-1.8H9Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function FlashlightIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M7 9 4 6v-.5h6.5L14 9H7Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <rect
        x="7"
        y="9"
        width="9"
        height="4.5"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M16 9.5h2.5L21 12l-2.5 2.5H16Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 8.5 22 6M19.5 15.5 22 18"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function WalkieIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path d="M11 4h2l.6 2.5h-3.2L11 4Z" fill="currentColor" />
      <rect
        x="8"
        y="6.5"
        width="8"
        height="13.5"
        rx="1.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M9.3 10h5.4M9.3 13h5.4"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <circle cx="12" cy="16.5" r="1.1" fill="currentColor" />
    </svg>
  );
}

export function CalculatorIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <rect
        x="5"
        y="3.5"
        width="14"
        height="17"
        rx="1.8"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="7"
        y="5.5"
        width="10"
        height="3.5"
        rx="0.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <circle cx="8.2" cy="12.5" r="0.9" fill="currentColor" />
      <circle cx="12" cy="12.5" r="0.9" fill="currentColor" />
      <circle cx="15.8" cy="12.5" r="0.9" fill="currentColor" />
      <circle cx="8.2" cy="16" r="0.9" fill="currentColor" />
      <circle cx="12" cy="16" r="0.9" fill="currentColor" />
      <circle cx="15.8" cy="16" r="0.9" fill="currentColor" />
    </svg>
  );
}

export function MugIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M5 9h11v6.5a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M8.5 6.5c0-1 1-1.2 1-2.2M12 6.5c0-1 1-1.2 1-2.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A sheet of paper with lines — a player's profile (their character
 * sheet, usually). */
export function SheetIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" width={SIZE} height={SIZE} className={className} aria-hidden="true">
      <path
        d="M6 3h8.5L19 7.5V21H6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M14 3v5h5M9 12h7M9 15.5h7M9 19h4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
