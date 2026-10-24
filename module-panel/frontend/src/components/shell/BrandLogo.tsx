// Plain signal-bars-in-a-tile mark, drawn from scratch for this project.
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="22" height="22" rx="6" fill="#2563eb" />
      <rect x="5" y="14" width="2.6" height="5" rx="1" fill="#fff" />
      <rect x="9" y="11" width="2.6" height="8" rx="1" fill="#fff" />
      <rect x="13" y="8" width="2.6" height="11" rx="1" fill="#fff" />
      <rect x="17" y="5" width="2.6" height="14" rx="1" fill="#fff" />
    </svg>
  );
}
