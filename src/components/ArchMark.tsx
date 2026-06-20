import type { CSSProperties } from "react";

/**
 * The Almonry mark — a Romanesque almonry arch with two open doors.
 * Brass voussoirs (stones) ring an oxblood doorway. Transparent background
 * so it sits on parchment or white equally well. Sized by `height`.
 */
export function ArchMark({
  height = 40,
  style,
  title = "Almonry",
}: {
  height?: number;
  style?: CSSProperties;
  title?: string;
}) {
  return (
    <svg
      height={height}
      viewBox="0 0 48 52"
      fill="none"
      role="img"
      aria-label={title}
      style={{ display: "block", ...style }}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* doorway */}
      <g fill="var(--oxblood, #6E2A2A)">
        <path d="M12.25,48 L12.25,35 Q12.25,27 19.75,27 L19.75,48 Z" />
        <path d="M29.25,48 L29.25,35 Q29.25,27 21.75,27 L21.75,48 Z" />
      </g>
      {/* voussoirs + piers */}
      <g fill="var(--brass, #A9854B)">
        <path d="M11.75,27.59 L5.76,27.46 L6.03,24.37 L11.96,25.28 Z" />
        <path d="M12.10,24.47 L6.22,23.30 L7.02,20.31 L12.70,22.23 Z" />
        <path d="M12.98,21.46 L7.39,19.28 L8.70,16.47 L13.96,19.36 Z" />
        <path d="M14.37,18.65 L9.24,15.53 L11.02,12.99 L15.70,16.75 Z" />
        <path d="M16.23,16.12 L11.72,12.16 L13.91,9.97 L17.87,14.48 Z" />
        <path d="M18.50,13.95 L14.74,9.27 L17.28,7.49 L20.40,12.62 Z" />
        <path d="M21.10,12.62 L24.22,7.49 L26.76,9.27 L23.00,13.95 Z" />
        <path d="M23.63,14.48 L27.59,9.97 L29.78,12.16 L25.27,16.12 Z" />
        <path d="M25.80,16.75 L30.48,12.99 L32.26,15.53 L27.13,18.65 Z" />
        <path d="M27.54,19.36 L32.80,16.47 L34.11,19.28 L28.52,21.46 Z" />
        <path d="M28.80,22.23 L34.48,20.31 L35.28,23.30 L29.40,24.47 Z" />
        <path d="M29.54,25.28 L35.47,24.37 L35.74,27.46 L29.75,27.59 Z" />
        <path d="M17.25,8.5 L24.25,8.5 L22.05,13.8 L19.45,13.8 Z" />
        <path d="M5.75,28.00 h6.00 v9.50 h-6.00 Z" />
        <path d="M5.75,38.50 h6.00 v9.50 h-6.00 Z" />
        <path d="M29.75,28.00 h6.00 v9.50 h-6.00 Z" />
        <path d="M29.75,38.50 h6.00 v9.50 h-6.00 Z" />
        <path d="M5.25,48 h7 v2 h1.5 v3 h-10 v-3 h1.5 Z" />
        <path d="M29.25,48 h7 v2 h1.5 v3 h-10 v-3 h1.5 Z" />
      </g>
    </svg>
  );
}

export default ArchMark;
