import { useId, type KeyboardEvent } from "react";
import type { ModelConfigObject } from "@zcode/provider";
import { Input } from "@/components/ui/input.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import type { ProviderModelDraftValues } from "./ProviderModelMetadata.js";
import { ModelConfigInputLabel } from "./ModelConfigHelp.js";
import { modelEditorControlStyle } from "./modelEditorControlStyle.js";

export function ModelLimitsEditor({
  draft,
  inheritedConfig,
  overrides,
  onChange,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: {
  draft: ProviderModelDraftValues;
  inheritedConfig?: ModelConfigObject;
  overrides?: ReadonlySet<string>;
  onChange: (patch: Partial<ProviderModelDraftValues>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}) {
  const id = useId();
  return (
    <section className="space-y-4" data-model-settings-group="tokens">
      {(["contextWindow", "maxOutputTokens"] as const).map((field) => {
        const draftField = `${field}Value` as const;
        const inherited =
          field === "contextWindow"
            ? inheritedConfig?.properties?.contextWindow
            : inheritedConfig?.optionSpecs?.maxOutputTokens?.max;
        const overridden = overrides?.has(draftField) ?? Boolean(draft[draftField].trim());
        return (
          <div key={field}>
            <div className="mb-1 text-ui-base text-foreground-subtle">
              <ModelConfigInputLabel field={field} htmlFor={`${id}-${field}`} />
            </div>
            <Input
              {...TECHNICAL_INPUT_ATTRIBUTES}
              id={`${id}-${field}`}
              type="text"
              size="lg"
              inputMode="numeric"
              pattern="[0-9]*"
              autoFocus={field === "contextWindow"}
              value={draft[draftField]}
              placeholder={inherited == null ? undefined : String(inherited)}
              data-personal-override={overridden}
              className={modelEditorControlStyle(overridden)}
              onChange={(event) => onChange({ [draftField]: event.target.value })}
              onFocus={(event) => event.currentTarget.select()}
              onKeyDown={onKeyDown}
              onCompositionStart={onCompositionStart}
              onCompositionEnd={onCompositionEnd}
            />
          </div>
        );
      })}
    </section>
  );
}
