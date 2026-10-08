import { useRef, useState } from "react";
import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.js";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandItem,
} from "@/components/ui/command.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { useModelCatalog } from "@/hooks/useModelCatalog.js";
import { isImeComposingKeyEvent } from "@/lib/imeComposition.js";

export function ModelCatalogPicker({
  value,
  onChange,
  catalog,
  existingIds,
  onManualSubmit,
}: {
  value: readonly string[];
  onChange: (ids: string[]) => void;
  catalog: Pick<ReturnType<typeof useModelCatalog>, "status" | "ids">;
  existingIds: readonly string[];
  onManualSubmit: () => void;
}) {
  const { intl } = useZCodeIntl();
  const [manual, setManual] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const compositionActive = useRef(false);
  const message = (suffix: string) =>
    intl.formatMessage({ id: `settings.modelProvider.catalog.${suffix}` });
  return (
    <div className="space-y-3">
      {manual ? (
        <Input
          autoFocus
          aria-label={intl.formatMessage({ id: "settings.modelProvider.modelId" })}
          className="font-mono"
          value={value[0] ?? ""}
          onChange={(event) => onChange([event.target.value])}
          onCompositionStart={() => {
            compositionActive.current = true;
          }}
          onCompositionEnd={() => {
            compositionActive.current = false;
          }}
          onKeyDown={(event) => {
            if (
              event.key !== "Enter" ||
              isImeComposingKeyEvent({
                compositionActive: compositionActive.current,
                nativeEvent: event.nativeEvent,
              })
            )
              return;
            event.preventDefault();
            onManualSubmit();
          }}
        />
      ) : (
        <Popover open={expanded} onOpenChange={setExpanded}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={expanded}
              disabled={catalog.status !== "success" || catalog.ids.length === 0}
              className="w-full justify-between font-mono"
              data-testid="model-catalog-select"
            >
              <span className="min-w-0 truncate">
                {value.length
                  ? intl.formatMessage(
                      { id: "settings.modelProvider.catalog.selected" },
                      { count: value.length },
                    )
                  : message("select")}
              </span>
              <ChevronsUpDown className="size-4 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-[var(--radix-popover-trigger-width)] p-0"
            align="start"
            onEscapeKeyDown={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              // Enter 先交给 Command 选择候选，再阻止传到外层；输入框拦截会阻断 Command 的键盘处理。
              if (event.key === "Enter") event.stopPropagation();
            }}
          >
            <Command>
              <CommandInput placeholder={message("search")} />
              <CommandList
                // 下拉 Portal 位于 Dialog 外，阻止滚轮冒泡到其 document 滚动锁，保留列表原生滚动。
                onWheel={(event) => event.stopPropagation()}
              >
                <CommandEmpty>{message("noMatch")}</CommandEmpty>
                {catalog.ids.map((id) => (
                  <CommandItem
                    key={id}
                    value={id}
                    disabled={existingIds.includes(id)}
                    onSelect={() => {
                      onChange(
                        value.includes(id)
                          ? value.filter((selected) => selected !== id)
                          : [...value, id],
                      );
                    }}
                    className="font-mono"
                  >
                    <Check
                      className={`size-4 ${value.includes(id) ? "opacity-100" : "opacity-0"}`}
                    />
                    <span className="min-w-0 flex-1 break-all">{id}</span>
                    {existingIds.includes(id) ? (
                      <span className="text-ui-xs text-foreground-subtle">{message("added")}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
      <Button
        type="button"
        variant="link"
        size="sm"
        className="px-0"
        onClick={() => {
          setExpanded(false);
          setManual((value) => !value);
          onChange([]);
        }}
      >
        {message(manual ? "useList" : "manual")}
      </Button>
      {!manual && value.length > 0 ? (
        <div className="flex flex-wrap gap-2" data-testid="model-catalog-selected">
          {value.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-md bg-hover px-2 py-1"
            >
              <span className="min-w-0 break-all font-mono text-ui-sm">{id}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={intl.formatMessage(
                  { id: "settings.modelProvider.catalog.removeSelection" },
                  { model: id },
                )}
                onClick={() => onChange(value.filter((selected) => selected !== id))}
              >
                <X className="size-3" aria-hidden="true" />
              </Button>
            </span>
          ))}
        </div>
      ) : null}
      {catalog.status === "idle" || (catalog.status === "success" && catalog.ids.length === 0) ? (
        <p className="text-ui-sm text-foreground-subtle" role="status">
          {message(catalog.status === "idle" ? "idle" : "empty")}
        </p>
      ) : null}
    </div>
  );
}
