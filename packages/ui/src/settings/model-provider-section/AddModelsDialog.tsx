import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import type { useModelCatalog } from "@/hooks/useModelCatalog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ModelCatalogPicker } from "./ModelCatalogPicker.js";

/** 添加只持有 ID 选择；能力与整批成员由 Host 在一次提交后解析。 */
export function AddModelsDialog({
  open,
  onOpenChange,
  catalog,
  existingIds,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: Pick<ReturnType<typeof useModelCatalog>, "status" | "ids">;
  existingIds: readonly string[];
  onAdd: (ids: readonly string[]) => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const [selected, setSelected] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    if (open) {
      setSelected([]);
      setError(null);
    }
  }, [open]);
  const ids = selected.map((id) => id.trim()).filter(Boolean);
  const commit = async () => {
    if (savingRef.current || ids.length === 0) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      await onAdd(ids);
      onOpenChange(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!savingRef.current) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[min(48rem,calc(100vh-4rem))] max-w-2xl grid-rows-[auto_minmax(0,1fr)_auto] overflow-clip">
        <DialogHeader className="pr-8">
          <DialogTitle>{intl.formatMessage({ id: "settings.modelProvider.addModel" })}</DialogTitle>
          <DialogDescription className="sr-only">
            {intl.formatMessage({ id: "settings.modelProvider.catalog.addHint" })}
          </DialogDescription>
        </DialogHeader>
        <div inert={saving} className="min-h-0 min-w-0 space-y-3 overflow-y-auto">
          {open ? (
            <ModelCatalogPicker
              value={selected}
              onChange={(next) => {
                setSelected(next);
                setError(null);
              }}
              catalog={catalog}
              existingIds={existingIds}
              onManualSubmit={() => void commit()}
            />
          ) : null}
          <p className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({ id: "settings.modelProvider.catalog.addHint" })}
          </p>
          {error ? (
            <p className="text-ui-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            disabled={saving}
            onClick={() => onOpenChange(false)}
          >
            {intl.formatMessage({ id: "common.cancel" })}
          </Button>
          <Button
            type="button"
            disabled={saving || ids.length === 0}
            onClick={() => void commit()}
            data-testid="model-catalog-add-selected"
          >
            {saving
              ? intl.formatMessage({ id: "common.loading" })
              : intl.formatMessage(
                  { id: "settings.modelProvider.catalog.addSelected" },
                  { count: ids.length },
                )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
