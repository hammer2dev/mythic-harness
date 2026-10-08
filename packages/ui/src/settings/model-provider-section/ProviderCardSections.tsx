import { AddModelsDialog } from "./AddModelsDialog.js";
import { useModelCatalog } from "@/hooks/useModelCatalog.js";
/* eslint-disable max-lines -- 模型供应商卡片仍在迁移期集中维护多个紧耦合区块，后续拆分时再移除。 */
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import type {
  ProviderSettingsFormProvider,
  ProviderSettingsFormModel,
} from "@/lib/providerSettingsFormTypes.js";
import type { ModelConnectivityResult } from "@zcode/shared";
import type { ProviderApiType } from "@zcode/provider";
import {
  TID_MODEL_PROVIDER_ADD_MODEL_BUTTON,
  TID_MODEL_PROVIDER_BASE_URL_INPUT,
  TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON,
  TID_MODEL_PROVIDER_MODEL_INPUT,
  TID_MODEL_PROVIDER_NAME_INPUT,
  testId,
} from "@zcode/shared";
import {
  Download,
  InfoIcon,
  Loader2,
  LockKeyholeIcon,
  Plus,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useServices } from "@/hooks/useServices.js";
import { TECHNICAL_INPUT_ATTRIBUTES } from "@/lib/technicalInputAttributes.js";
import { ApiKeyInput } from "./ApiKeyInput.js";
import { ModelRowInput } from "./ProviderFormControls.js";
import {
  ProviderApiFormatSelect,
  resolveProviderConnectionApiFormatDisplayLabel,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { SortableProviderModelList } from "@/settings/model-provider-section/SortableProviderModelList.js";
import { ProviderLogo } from "@/settings/model-provider-section/ProviderLogo.js";
import type { ProviderConfigObject } from "@zcode/provider";

export { formatModelContextWindowLabel } from "@/lib/tokenNumberFormat.js";
export {
  resolveProviderConnectionApiFormatDisplayLabel,
  resolveProviderConnectionApiFormatOptions,
} from "@/settings/model-provider-section/ProviderApiFormatSelect.js";

function shouldShowProviderApiFormat(
  _provider: Pick<ProviderSettingsFormProvider, "providerId">,
): boolean {
  return true;
}

export function ProviderCardHeader({
  providerName,
  logo,
  onDelete,
  actionsVisible = true,
  providerToggle,
}: {
  providerName: string;
  logo?: ProviderConfigObject["logo"];
  onDelete?: () => void;
  actionsVisible?: boolean;
  providerToggle?: ReactNode;
}) {
  const { intl } = useZCodeIntl();
  return (
    <div className="flex items-center justify-between gap-3" data-testid="model-provider-header">
      <div className="flex min-w-0 items-center gap-2">
        <ProviderLogo logo={logo} className="size-5" />
        <div className="min-w-0 truncate text-ui-lg font-semibold text-foreground">
          {providerName}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {providerToggle}
        {actionsVisible && onDelete ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                data-testid="model-provider-actions-button"
                aria-label={intl.formatMessage({ id: "common.more" })}
              >
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem variant="destructive" onSelect={onDelete}>
                <Trash2 className="size-3.5" />
                {intl.formatMessage({ id: "common.delete" })}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
    </div>
  );
}

export function ProviderNameSection({
  value,
  onChange,
  onBlur,
  onKeyDown,
  onCompositionStart,
  onCompositionEnd,
}: {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onCompositionStart: () => void;
  onCompositionEnd: () => void;
}) {
  const { intl } = useZCodeIntl();
  const label = intl.formatMessage({ id: "settings.modelProvider.name" });
  return (
    <div>
      <label className="mb-1 block text-ui-base text-foreground-subtle">{label}</label>
      <Input
        aria-label={label}
        data-testid={TID_MODEL_PROVIDER_NAME_INPUT}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
      />
    </div>
  );
}

export function ProviderConnectionSection({
  provider,
  readOnly,
  apiFormat,
  baseUrlValue,
  onApiFormatChange,
  onBaseUrlChange,
  onBaseUrlBlur,
  onBaseUrlKeyDown,
  onBaseUrlCompositionStart,
  onBaseUrlCompositionEnd,
}: {
  provider: ProviderSettingsFormProvider;
  readOnly?: boolean;
  apiFormat: ProviderApiType;
  baseUrlValue: string;
  onApiFormatChange: (value: ProviderApiType) => void;
  onBaseUrlChange: (value: string) => void;
  onBaseUrlBlur: () => void;
  onBaseUrlKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onBaseUrlCompositionStart?: () => void;
  onBaseUrlCompositionEnd?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const showApiFormat = shouldShowProviderApiFormat(provider);
  const readOnlyBaseUrl = provider.config.api?.baseUrl ?? "";
  const resolvedApiFormat = provider.config.api?.type ?? "anthropic-messages";

  const renderReadOnlyField = (label: string, value: string) => (
    <div>
      <label className="mb-1 block text-ui-base text-foreground-subtle">{label}</label>
      <div className="flex min-h-8 items-center gap-2 rounded-lg border border-input-border bg-input px-3 py-1.5 text-ui-base text-foreground">
        <span className="min-w-0 flex-1 break-all">{value || "-"}</span>
        <span
          role="img"
          aria-label={intl.formatMessage(
            { id: "settings.modelProvider.readOnlyField" },
            { field: label },
          )}
          className="shrink-0 text-foreground-subtle"
        >
          <LockKeyholeIcon className="size-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  if (readOnly) {
    return (
      <>
        {renderReadOnlyField(
          intl.formatMessage({ id: "settings.modelProvider.baseUrl" }),
          readOnlyBaseUrl,
        )}
        {showApiFormat
          ? renderReadOnlyField(
              intl.formatMessage({ id: "settings.modelProvider.apiFormat" }),
              resolveProviderConnectionApiFormatDisplayLabel(intl, resolvedApiFormat),
            )
          : null}
      </>
    );
  }

  return (
    <>
      <div>
        <label className="mb-1 block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.baseUrl" })}
        </label>
        <Input
          {...TECHNICAL_INPUT_ATTRIBUTES}
          type="text"
          size="lg"
          data-testid={TID_MODEL_PROVIDER_BASE_URL_INPUT}
          value={baseUrlValue}
          placeholder={intl.formatMessage({
            id: "settings.modelProvider.baseUrlPlaceholder",
          })}
          onChange={(event) => onBaseUrlChange(event.target.value)}
          onBlur={onBaseUrlBlur}
          onKeyDown={onBaseUrlKeyDown}
          onCompositionStart={onBaseUrlCompositionStart}
          onCompositionEnd={onBaseUrlCompositionEnd}
        />
      </div>
      {showApiFormat ? (
        <div>
          <label className="mb-1 block text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: "settings.modelProvider.apiFormat" })}
          </label>
          <ProviderApiFormatSelect value={apiFormat} onChange={onApiFormatChange} />
        </div>
      ) : null}
    </>
  );
}

export function ProviderApiKeySection({
  apiKeyValue,
  apiKeyVisible,
  readOnly,
  onApiKeyChange,
  onApiKeyBlur,
  onApiKeyKeyDown,
  onApiKeyCompositionStart,
  onApiKeyCompositionEnd,
  onToggleApiKeyVisibility,
}: {
  apiKeyValue: string;
  apiKeyVisible: boolean;
  readOnly?: boolean;
  onApiKeyChange: (value: string) => void;
  onApiKeyBlur: () => void;
  onApiKeyKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onApiKeyCompositionStart?: () => void;
  onApiKeyCompositionEnd?: () => void;
  onToggleApiKeyVisibility: () => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="block text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.apiKey" })}
        </label>
      </div>
      <ApiKeyInput
        value={apiKeyValue}
        visible={apiKeyVisible}
        readOnly={readOnly}
        onChange={onApiKeyChange}
        onBlur={onApiKeyBlur}
        onKeyDown={onApiKeyKeyDown}
        onCompositionStart={onApiKeyCompositionStart}
        onCompositionEnd={onApiKeyCompositionEnd}
        onToggleVisibility={onToggleApiKeyVisibility}
      />
    </div>
  );
}

export function ProviderModelsSection({
  providerId,
  providerName,
  providerEnabled = true,
  providerAccess,
  models,
  onTestModel,
  onModelCommit,
  onModelEnabledChange,
  onDeleteModel,
  onAddModels,
  onReorderModelIds,
  settingsRevision = 0,
  connectionKey,
  connectionReady,
  prepareConnection,
}: {
  providerId: string;
  providerName?: string;
  providerEnabled?: boolean;
  providerAccess?: ProviderConfigObject["access"];
  models: ProviderSettingsFormModel[];
  onTestModel?: (model: string) => Promise<ModelConnectivityResult>;
  onModelCommit: (
    originalModelId: string,
    model: ProviderSettingsFormModel,
    basedOnRevision: number,
  ) => void | Promise<void>;
  onDeleteModel: (modelId: string) => void;
  onModelEnabledChange?: (modelId: string, enabled: boolean) => void | Promise<void>;
  onAddModels: (modelIds: readonly string[]) => Promise<void>;
  onReorderModelIds?: (modelIds: string[]) => void;
  settingsRevision?: number;
  connectionKey: string;
  connectionReady: boolean;
  prepareConnection: () => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const { providerSettingsService } = useServices();
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const catalog = useModelCatalog({
    providerId,
    connectionKey,
    prepareConnection,
  });
  const [lastAddedModelId, setLastAddedModelId] = useState<string | null>(null);
  const addedRow = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!addDialogOpen && lastAddedModelId && addedRow.current) {
      addedRow.current.scrollIntoView({ block: "nearest" });
      setLastAddedModelId(null);
    }
  }, [addDialogOpen, lastAddedModelId, models]);
  const catalogMessage = (suffix: string) =>
    intl.formatMessage({ id: `settings.modelProvider.catalog.${suffix}` });
  const catalogFeedback = !connectionReady
    ? catalogMessage("connectionRequired")
    : catalog.status === "error"
      ? `${catalogMessage("failed")}${catalog.error ? ` · ${catalog.error}` : ""}`
      : catalog.status === "success"
        ? catalog.ids.length === 0
          ? catalogMessage("empty")
          : intl.formatMessage(
              { id: "settings.modelProvider.catalog.fetched" },
              { count: catalog.ids.length },
            )
        : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <span className="text-ui-base text-foreground-subtle">
          {intl.formatMessage({ id: "settings.modelProvider.models" })}
        </span>
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="rounded-lg"
            disabled={!connectionReady || catalog.status === "loading"}
            onClick={() => void catalog.load()}
            data-testid="model-catalog-fetch"
          >
            {catalog.status === "loading" ? (
              <Loader2 data-icon="inline-start" className="animate-spin" aria-hidden="true" />
            ) : (
              <Download data-icon="inline-start" aria-hidden="true" />
            )}
            {catalogMessage(catalog.status === "loading" ? "loading" : "fetch")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="default"
            className="rounded-lg"
            data-testid={TID_MODEL_PROVIDER_ADD_MODEL_BUTTON}
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus data-icon="inline-start" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.modelProvider.addModel" })}
          </Button>
        </div>
      </div>
      {catalogFeedback ? (
        <p
          className={`mb-2 text-ui-sm ${catalog.status === "error" ? "text-destructive" : "text-foreground-subtle"}`}
          role={catalog.status === "error" ? "alert" : "status"}
        >
          {catalogFeedback}
        </p>
      ) : null}
      {models.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-input-border bg-input">
          <SortableProviderModelList
            modelIds={models.map((model) => model.modelId)}
            sortableModelIds={models.map((model) => model.modelId)}
            onReorder={onReorderModelIds}
            renderModel={(_modelId, index) => {
              const model = models[index]!;
              const inputFormat = model.config.properties?.inputFormat;
              const outputFormat = model.config.properties?.outputFormat;
              const completeProperties =
                model.config.properties?.contextWindow != null &&
                inputFormat?.supportsText != null &&
                inputFormat.supportsImage != null &&
                inputFormat.supportsVideo != null &&
                inputFormat.supportsAudio != null &&
                inputFormat.supportsPdf != null &&
                outputFormat?.supportsText != null;
              return (
                <div ref={model.modelId === lastAddedModelId ? addedRow : undefined}>
                  <ModelRowInput
                    key={`${providerId}/${model.modelId}`}
                    providerId={providerId}
                    providerName={providerName}
                    providerEnabled={providerEnabled}
                    providerAccess={providerAccess}
                    connectionKey={connectionKey}
                    inputTestId={testId(TID_MODEL_PROVIDER_MODEL_INPUT, String(index))}
                    deleteTestId={testId(TID_MODEL_PROVIDER_MODEL_DELETE_BUTTON, String(index))}
                    model={model}
                    onCommit={(value, basedOnRevision) =>
                      onModelCommit(model.modelId, value, basedOnRevision)
                    }
                    onResolveDraft={(nextModelId, personalConfig) =>
                      providerSettingsService.resolveModelConfig({
                        providerId,
                        originalModelId: model.modelId,
                        modelId: nextModelId,
                        personalConfig: structuredClone(personalConfig),
                      })
                    }
                    settingsRevision={settingsRevision}
                    onDelete={!model.builtin ? () => onDeleteModel(model.modelId) : undefined}
                    onEnabledChange={(enabled) => {
                      void Promise.resolve(onModelEnabledChange?.(model.modelId, enabled)).catch(
                        () => undefined,
                      );
                    }}
                    onTest={onTestModel}
                  />
                  {(!completeProperties || Boolean(model.issues?.length)) && (
                    <div className="px-3 pb-2 text-ui-sm text-destructive">
                      {model.issues?.some(
                        (issue) =>
                          issue.path.at(-1) === "contextWindow" || issue.path.at(-1) === "max",
                      )
                        ? intl.formatMessage({ id: "settings.modelProvider.missingLimits" })
                        : (model.issues?.[0]?.message ??
                          intl.formatMessage({
                            id: "settings.modelProvider.modelConfigIncomplete",
                          }))}
                    </div>
                  )}
                </div>
              );
            }}
          />
        </div>
      ) : (
        <div className="mt-1 flex min-h-12 items-center justify-start gap-2 rounded-lg border border-dashed border-border px-4 py-3 text-left text-ui-base text-foreground-subtle">
          {/* 窄屏提示会换行，最小高度替代固定高度，避免文字溢出虚线框。 */}
          <InfoIcon className="size-4 shrink-0" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.modelProvider.modelsEmpty" })}
        </div>
      )}
      <AddModelsDialog
        open={addDialogOpen}
        onOpenChange={setAddDialogOpen}
        catalog={catalog}
        existingIds={models.map((model) => model.modelId)}
        onAdd={async (ids) => {
          await onAddModels(ids);
          setLastAddedModelId(ids.at(-1) ?? null);
        }}
      />
    </div>
  );
}
