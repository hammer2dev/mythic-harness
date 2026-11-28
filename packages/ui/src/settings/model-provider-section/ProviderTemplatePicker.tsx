import type { ProviderSettingsCreateInput } from "@zcode/provider";
import { resolveProviderTemplateName } from "@zcode/provider";
import type { ProviderSettingsView } from "@zcode/services";
import { toZhOrEnLocale } from "@zcode/shared";
import {
  TID_MODEL_PROVIDER_TEMPLATE_ITEM,
  TID_MODEL_PROVIDER_TEMPLATE_PICKER,
  testId,
} from "@zcode/shared/test-ids";
import { ChevronRightIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ProviderLogo } from "./ProviderLogo.js";

const providerPresets = [
  { id: "openai" },
  { id: "anthropic" },
  { id: "deepseek" },
  { id: "moonshot-kimi" },
  { id: "minimax" },
  { id: "bigmodel-standard-api", label: "BigModel" },
  { id: "zai-standard-api", label: "Z.ai" },
  { id: "qwen-alibaba-model-studio-cn", label: "Alibaba Model Studio", zh: "阿里百炼" },
  { id: "xiaomi-mimo", label: "Xiaomi" },
  { id: "xai" },
  { id: "openrouter" },
  { id: "opencode-go-responses", label: "OpenCode" },
  { id: "siliconflow-cn", label: "SiliconFlow", zh: "硅基流动" },
  { id: "tencent-tokenhub-cn", label: "Tencent TokenHub", zh: "腾讯 TokenHub" },
  { id: "volcengine-ark", label: "Volcengine Ark", zh: "火山方舟" },
  { id: "stepfun", label: "StepFun", zh: "阶跃星辰" },
];

export function ProviderTemplatePicker({
  templates,
  onSelect,
}: {
  templates: ProviderSettingsView["providerTemplates"];
  onSelect(input: ProviderSettingsCreateInput): void;
}) {
  const { intl, locale } = useZCodeIntl();
  const templateLocale = toZhOrEnLocale(locale);
  const templatesById = new Map(templates.map((template) => [template.templateId, template]));
  return (
    <div
      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
      data-testid={TID_MODEL_PROVIDER_TEMPLATE_PICKER}
    >
      <ProviderTemplateCard
        label={intl.formatMessage({ id: "settings.modelProvider.createCustomProvider" })}
        id="custom"
        icon={
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-hover">
            <PlusIcon className="size-4" aria-hidden="true" />
          </span>
        }
        onClick={() =>
          onSelect({
            providerName: intl.formatMessage({ id: "settings.modelProvider.newProviderName" }),
          })
        }
      />
      {providerPresets.map(({ id, label, zh }) => {
        const template = templatesById.get(id);
        if (!template) return null;
        const name = resolveProviderTemplateName(id, template, templateLocale);
        return (
          <ProviderTemplateCard
            key={id}
            label={(templateLocale === "zh-CN" ? zh : undefined) ?? label ?? name}
            id={id}
            icon={
              <span className="flex size-9 shrink-0 items-center justify-center">
                <ProviderLogo logo={template.config.logo} className="size-8" />
              </span>
            }
            onClick={() => onSelect({ templateId: id, locale: templateLocale })}
          />
        );
      })}
    </div>
  );
}

function ProviderTemplateCard({
  label,
  id,
  icon,
  onClick,
}: {
  label: string;
  id: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <ControlHintTooltip title={label}>
      <button
        type="button"
        data-testid={testId(TID_MODEL_PROVIDER_TEMPLATE_ITEM, id)}
        onClick={onClick}
        className="flex min-h-16 min-w-0 items-center gap-3 rounded-lg border border-border bg-surface px-4 py-3 text-left outline-none transition-colors hover:border-border-hover hover:bg-hover focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
      >
        {icon}
        <span className="min-w-0 flex-1 break-words text-ui-base font-medium">{label}</span>
        <ChevronRightIcon className="size-4 shrink-0 text-foreground-subtlest" aria-hidden="true" />
      </button>
    </ControlHintTooltip>
  );
}
