import ClaudeLogo from './ClaudeLogo';

type SessionProviderLogoProps = {
  provider?: string | null;
  className?: string;
};

// Frappe integration: Claude only (cursor/codex removed)
export default function SessionProviderLogo({
  className = 'w-5 h-5',
}: SessionProviderLogoProps) {
  return <ClaudeLogo className={className} />;
}
