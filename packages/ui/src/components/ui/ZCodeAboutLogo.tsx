import appLogoUrl from "@/assets/app-logo.png";
import { cn } from "@/components/lib/utils.js";

export function ZCodeAboutLogo({ className }: { className?: string }) {
  return (
    <img
      src={appLogoUrl}
      className={cn("shrink-0 object-contain", className)}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

export function ZCodeWordmarkLogo({ className }: { className?: string }) {
  return <ZCodeAboutLogo className={className} />;
}
