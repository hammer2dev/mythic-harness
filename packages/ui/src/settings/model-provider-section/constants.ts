import { createUuid } from "@zcode/shared";
import {
  getProviderFormLabel,
  type ProviderSettingsFormProvider,
} from "@/lib/providerSettingsFormTypes.js";
export function generateId(): string {
  return createUuid();
}
export function resolveModelProviderDisplayName(provider: ProviderSettingsFormProvider): string {
  return getProviderFormLabel(provider);
}
export interface ModelProviderNavItem {
  key: string;
  type: "custom";
  label: string;
  provider: ProviderSettingsFormProvider;
}
export type ModelProviderNavGroupId = "custom";
export interface ModelProviderNavGroup {
  id: ModelProviderNavGroupId;
  title: string;
  items: ModelProviderNavItem[];
}
