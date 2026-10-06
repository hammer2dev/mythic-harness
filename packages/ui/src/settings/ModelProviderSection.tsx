import { useEffect, useState } from "react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { Button } from "@/components/ui/button.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useModelProviders } from "@/hooks/useModelProviders.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import {
  getProviderFormApiKeyManagementUrl,
  getProviderFormLabel,
} from "@/lib/providerSettingsFormTypes.js";
import type { ModelGatewayOpenTarget } from "@/lib/modelGatewayNavigation.js";
import { ModelProviderSectionLayout } from "./model-provider-section/SectionLayout.js";
import { InlineEditableProviderCard } from "./model-provider-section/InlineEditableProviderCard.js";
import { ProviderTemplatePicker } from "./model-provider-section/ProviderTemplatePicker.js";
import { confirmAndDeleteModelProvider } from "./model-provider-section/modelProviderActions.js";
import { createCustomProviderNodeKey } from "./model-provider-section/utils.js";
import type { ModelProviderNavGroup } from "./model-provider-section/constants.js";

export {
  fuzzyMatch,
  handleEndpointSuggestionPopoverOpenAutoFocus,
  resolveEndpointSuggestionOpenRequest,
} from "./model-provider-section/utils.js";

export function ModelProviderSection({
  workspacePath = "",
  connectivityWorkspacePath,
  connectivityWorkspaceRequired = false,
  pendingModelProviderTarget,
  onConsumePendingModelProviderTarget,
}: {
  workspacePath?: string;
  connectivityWorkspacePath?: string;
  connectivityWorkspaceRequired?: boolean;
  pendingModelProviderTarget?: Required<Pick<ModelGatewayOpenTarget, "providerId">>;
  onConsumePendingModelProviderTarget?: () => void;
} = {}) {
  const { intl, locale } = useZCodeIntl();
  const platform = usePlatform();
  const confirmDialog = useConfirmDialog();
  const model = useModelProviders({
    workspacePath,
    connectivityWorkspacePath,
    connectivityWorkspaceRequired,
    connectivityUnavailableMessage: intl.formatMessage({
      id: "settings.modelProvider.testModel.localWorkspaceUnavailable",
    }),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => {
    if (!pendingModelProviderTarget || model.loading) return;
    setSelectedId(pendingModelProviderTarget.providerId);
    setTemplatePickerOpen(false);
    onConsumePendingModelProviderTarget?.();
  }, [pendingModelProviderTarget, model.loading, onConsumePendingModelProviderTarget]);
  const selected =
    model.modelProviders.find((p) => p.providerId === selectedId) ?? model.modelProviders[0];
  const groups: ModelProviderNavGroup[] = [
    {
      id: "custom",
      title: intl.formatMessage({ id: "settings.modelProvider.customProviders" }),
      items: model.modelProviders.map((provider) => ({
        key: createCustomProviderNodeKey(provider.providerId),
        type: "custom",
        label: getProviderFormLabel(provider),
        provider,
      })),
    },
  ];
  async function create(input: { templateId?: string; providerName?: string }) {
    setCreating(true);
    try {
      const result = await model.createPersonalProvider({ ...input, locale });
      setSelectedId(result.providerId);
      setTemplatePickerOpen(false);
    } finally {
      setCreating(false);
    }
  }
  if (model.loadError)
    return (
      <div className="space-y-3 text-ui-base">
        <p className="text-destructive">{model.loadError.message}</p>
        <Button onClick={model.reload}>{intl.formatMessage({ id: "common.retry" })}</Button>
      </div>
    );
  return (
    <ModelProviderSectionLayout
      description={intl.formatMessage({ id: "settings.modelProviderDescription" })}
      refreshLabel={intl.formatMessage({ id: "settings.modelProvider.refresh" })}
      loadingLabel={intl.formatMessage({ id: "common.loading" })}
      presetLoading={false}
      customLoading={model.loading || model.refreshing}
      onRefresh={() => void model.refresh()}
      addProviderLabel={intl.formatMessage({ id: "settings.modelProvider.addProviderAction" })}
      onAddProvider={() => setTemplatePickerOpen(true)}
      navigationGroups={groups}
      selectedNodeKey={selected ? createCustomProviderNodeKey(selected.providerId) : null}
      onSelectNavItem={(item) => {
        setSelectedId(item.provider.providerId);
        setTemplatePickerOpen(false);
      }}
      onReorderProviderIds={(ids) => model.saveDisplayOrder({ providerIds: ids })}
      reorderableProviderIds={model.reorderableProviderIds}
    >
      {templatePickerOpen || (!selected && !model.loading) ? (
        <ProviderTemplatePicker
          templates={model.providerTemplates}
          creating={creating}
          onBack={() => setTemplatePickerOpen(false)}
          onCreateFromTemplate={(templateId) => create({ templateId })}
          onCreateCustom={(providerName) => create({ providerName })}
        />
      ) : selected ? (
        <InlineEditableProviderCard
          key={selected.providerId}
          provider={selected}
          settingsRevision={model.providerSettingsView?.revision}
          onSave={async (provider) => {
            await model.saveProvider(provider);
          }}
          onAddPersonalModel={model.addPersonalModel}
          onSavePersonalModelDraft={model.savePersonalModelDraft}
          onSetPersonalModelEnabled={model.setPersonalModelEnabled}
          onDeletePersonalModel={model.deletePersonalModel}
          onDelete={() =>
            confirmAndDeleteModelProvider({
              provider: selected,
              confirmDialog,
              intl,
              deleteProvider: model.deleteProvider,
            })
          }
          onReorderModelIds={(ids) => model.reorderProviderModels(selected.providerId, ids)}
          onTestModel={model.testModelConnectivity}
          presetApiKeyUrl={getProviderFormApiKeyManagementUrl(selected)}
          onOpenPresetApiKey={() => {
            const url = getProviderFormApiKeyManagementUrl(selected);
            if (url) void platform.openExternal(url);
          }}
          nameEditable
        />
      ) : null}
    </ModelProviderSectionLayout>
  );
}
