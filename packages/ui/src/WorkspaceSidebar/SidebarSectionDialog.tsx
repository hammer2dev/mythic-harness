import { useId, useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";

export function SidebarSectionDialog({
  title,
  initialName = "",
  onClose,
  onSubmit,
}: {
  title: string;
  initialName?: string;
  onClose: () => void;
  onSubmit: (name: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const inputId = useId();
  const [name, setName] = useState(initialName);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-sm" aria-describedby={undefined}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) return;
            onSubmit(name.trim());
            onClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-4">
            <label htmlFor={inputId} className="text-ui-base">
              {intl.formatMessage({ id: "sidebarSection.name" })}
            </label>
            <Input
              id={inputId}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={intl.formatMessage({ id: "sidebarSection.namePlaceholder" })}
              className="text-mobile-input-safe sm:text-ui-base"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {intl.formatMessage({ id: "common.save" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
