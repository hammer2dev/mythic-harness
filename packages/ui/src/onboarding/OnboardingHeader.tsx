import { Button } from "@/components/ui/button.js";
import { X } from "lucide-react";

export function OnboardingHeader({
  saving,
  t,
  onClose,
}: {
  saving: boolean;
  t: (key: string) => string;
  onClose: () => void;
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-end px-6 sm:px-10 [@media(max-height:740px)]:h-10">
      <Button
        variant="ghost"
        size="icon"
        disabled={saving}
        aria-label={t("close")}
        title={t("close")}
        className="size-9 rounded-xl text-foreground-subtle"
        onClick={onClose}
      >
        <X className="size-4" />
      </Button>
    </header>
  );
}
