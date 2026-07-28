import { ShieldCheck } from "lucide-react";

/**
 * Blue shield shown next to the name of users whose identity is verified (KYC).
 * Render only when the user has verified identity (dniVerified).
 */
export default function VerifiedBadge({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <span title="Identidad verificada" className={`inline-flex items-center align-middle ${className}`}>
      <ShieldCheck size={size} className="text-sky-500" fill="currentColor" stroke="#ffffff" strokeWidth={2} />
    </span>
  );
}
