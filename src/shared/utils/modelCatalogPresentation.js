import { MODEL_CAPABILITY_META } from "@/shared/constants/modelCapabilities";

export function formatContextWindow(value) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value >= 1000000) {
    const compact = (value / 1000000).toFixed(value % 1000000 === 0 ? 0 : 1);
    return `${compact}m`;
  }
  if (value >= 1000) {
    const compact = (value / 1000).toFixed(value % 1000 === 0 ? 0 : 1);
    return `${compact}k`;
  }
  return `${value}`;
}

export function getCapabilityDisplay(capability) {
  if (!capability || typeof capability !== "string") {
    return { key: "unknown", icon: "help", label: "Unknown" };
  }
  const normalized = capability.trim().toLowerCase();
  const meta = MODEL_CAPABILITY_META[normalized];
  if (meta) {
    return { key: normalized, ...meta };
  }
  return {
    key: normalized,
    icon: "help",
    label: normalized.replace(/_/g, " "),
  };
}
