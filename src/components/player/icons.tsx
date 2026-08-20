/**
 * Oynatıcı ikonları.
 *
 * Bağımlılık eklemeden inline SVG: her biri tek bir yolun taşıyıcısı, hepsi
 * `currentColor` kullanıyor ki renk çağıran taraftan gelsin.
 */

import type { SVGProps } from "react";

export function ListenersIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-3 w-3"
      aria-hidden
      {...props}
    >
      <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-6 1.8-6 4v2h12v-2c0-2.2-2.7-4-6-4Z" />
      <path
        d="M17.5 12a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm.5 1.5c-.7 0-1.4.1-2 .3 1.3.9 2 2.1 2 3.4V19h4v-1.6c0-2-2.4-3.4-4-3.9Z"
        opacity=".6"
      />
    </svg>
  );
}

export function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="ml-0.5 h-6 w-6"
      {...props}
    >
      <path d="M8 5.14v13.72a1 1 0 0 0 1.54.84l10.29-6.86a1 1 0 0 0 0-1.68L9.54 4.3A1 1 0 0 0 8 5.14Z" />
    </svg>
  );
}

export function PauseIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6" {...props}>
      <path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" />
    </svg>
  );
}

export function SpeakerIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
      {...props}
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
      <path
        d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MutedIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      className="h-5 w-5"
      {...props}
    >
      <path d="M11 5 6.5 9H3v6h3.5L11 19V5Z" strokeLinejoin="round" />
      <path d="m16 10 4 4m0-4-4 4" strokeLinecap="round" />
    </svg>
  );
}

export function ArrowUpIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 12V4m-3.5 3.5L8 4l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ArrowDownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="M8 4v8m3.5-3.5L8 12 4.5 8.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function XIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 16 16" fill="none" aria-hidden="true" {...props}>
      <path
        d="m4.5 4.5 7 7m0-7-7 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
