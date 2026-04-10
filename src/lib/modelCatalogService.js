import { PROVIDER_MODELS, PROVIDER_ID_TO_ALIAS } from "open-sse/config/providerModels.js";
import { getSettings, getModelCatalogCache, setModelCatalogCache } from "@/lib/localDb";
import { KNOWN_MODEL_CAPABILITIES } from "@/shared/constants/modelCapabilities";

const MODELS_DEV_URL = "https://models.dev/api.json";
const FETCH_TIMEOUT_MS = 7000;
const DEFAULT_TTL_MINUTES = 720;
const MIN_TTL_MINUTES = 5;
const MAX_TTL_MINUTES = 10080;

const aliasToProviderId = Object.fromEntries(
  Object.entries(PROVIDER_ID_TO_ALIAS).map(([providerId, alias]) => [alias, providerId]),
);

const providerNameMap = {
  "github-copilot": "github",
  githubcopilot: "github",
  google: "gemini",
};

const state = {
  initialized: false,
  refreshPromise: null,
  cache: {
    etag: null,
    fetchedAt: null,
    providers: {},
    lastRefreshAt: null,
    lastRefreshStatus: "idle",
    lastError: null,
  },
};

const capabilityAliasMap = {
  tool_use: "tools",
  tool_calling: "tools",
  functioncalling: "function_calling",
  functions: "function_calling",
  vision_input: "vision",
  image: "vision",
  audio: "audio_input",
  reasoning_tokens: "reasoning",
  stream: "streaming",
  json: "json_mode",
};

function clampTtlMinutes(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return DEFAULT_TTL_MINUTES;
  return Math.min(MAX_TTL_MINUTES, Math.max(MIN_TTL_MINUTES, parsed));
}

function toIsoDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function toPositiveNumber(...candidates) {
  for (const value of candidates) {
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return null;
}

function normalizeCapability(value) {
  if (!value || typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (KNOWN_MODEL_CAPABILITIES.includes(normalized)) return normalized;
  if (capabilityAliasMap[normalized]) return capabilityAliasMap[normalized];
  return null;
}

function collectCapabilities(raw) {
  const found = new Set();

  const addCapability = (value) => {
    const normalized = normalizeCapability(value);
    if (normalized) found.add(normalized);
  };

  if (Array.isArray(raw?.capabilities)) raw.capabilities.forEach(addCapability);
  if (Array.isArray(raw?.modalities)) raw.modalities.forEach(addCapability);
  if (Array.isArray(raw?.input_modalities)) raw.input_modalities.forEach(addCapability);
  if (Array.isArray(raw?.output_modalities)) raw.output_modalities.forEach(addCapability);
  if (raw?.supports && typeof raw.supports === "object") {
    for (const [key, value] of Object.entries(raw.supports)) {
      if (value === true) addCapability(key);
    }
  }

  if (raw?.vision === true) found.add("vision");
  if (raw?.tools === true) found.add("tools");
  if (raw?.function_calling === true || raw?.functionCalling === true) found.add("function_calling");
  if (raw?.reasoning === true) found.add("reasoning");
  if (raw?.streaming === true) found.add("streaming");
  if (raw?.json_mode === true || raw?.jsonMode === true) found.add("json_mode");
  if (raw?.code === true) found.add("code");

  return Array.from(found);
}

function normalizeModelId(value) {
  if (typeof value !== "string") return "";
  return value.trim().toLowerCase();
}

function simplifyModelId(value) {
  return normalizeModelId(value)
    .replace(/^[a-z0-9_-]+\//, "")
    .replace(/^models?\//, "")
    .replace(/[^a-z0-9]/g, "");
}

function resolveProviderId(rawProvider) {
  if (!rawProvider || typeof rawProvider !== "string") return null;
  const normalized = rawProvider.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const mapped = providerNameMap[normalized] || normalized;

  if (PROVIDER_ID_TO_ALIAS[mapped]) return mapped;
  if (aliasToProviderId[mapped]) return aliasToProviderId[mapped];

  // handle namespaced values like "openai/gpt-4o"
  const firstSegment = mapped.split("/")[0];
  if (PROVIDER_ID_TO_ALIAS[firstSegment]) return firstSegment;
  if (aliasToProviderId[firstSegment]) return aliasToProviderId[firstSegment];

  return null;
}

function normalizeRemoteModel(rawModel, providerHint) {
  if (!rawModel) return null;
  const candidate = typeof rawModel === "string" ? { id: rawModel } : rawModel;
  if (typeof candidate !== "object" || Array.isArray(candidate)) return null;

  const id = candidate.id || candidate.model || candidate.slug || candidate.name;
  if (typeof id !== "string" || !id.trim()) return null;

  const providerId = resolveProviderId(
    candidate.provider || candidate.vendor || candidate.provider_id || providerHint,
  );
  if (!providerId) return null;

  const capabilities = collectCapabilities(candidate);

  return {
    id: id.trim(),
    provider: providerId,
    name: candidate.name || candidate.display_name || candidate.displayName || id.trim(),
    contextWindow: toPositiveNumber(
      candidate.contextWindow,
      candidate.context_window,
      candidate.contextLength,
      candidate.context_length,
      candidate.max_input_tokens,
      candidate.input_tokens,
    ),
    maxOutputTokens: toPositiveNumber(
      candidate.maxOutputTokens,
      candidate.max_output_tokens,
      candidate.max_tokens,
      candidate.output_tokens,
    ),
    capabilities,
    family: candidate.family || null,
    releasedAt: toIsoDate(candidate.releasedAt || candidate.released_at || candidate.release_date),
    deprecated: candidate.deprecated === true,
    source: "dynamic",
    lastUpdatedAt: toIsoDate(candidate.updatedAt || candidate.updated_at || candidate.last_updated),
  };
}

function extractProviderEntries(payload) {
  if (!payload || typeof payload !== "object") return [];
  const entries = [];

  if (Array.isArray(payload)) {
    entries.push([null, payload]);
  }

  if (Array.isArray(payload.models)) {
    entries.push([payload.provider || null, payload.models]);
  }

  if (payload.providers && typeof payload.providers === "object") {
    for (const [providerKey, providerValue] of Object.entries(payload.providers)) {
      if (Array.isArray(providerValue)) {
        entries.push([providerKey, providerValue]);
      } else if (providerValue && typeof providerValue === "object") {
        if (Array.isArray(providerValue.models)) {
          entries.push([providerKey, providerValue.models]);
        } else {
          entries.push([providerKey, Object.values(providerValue)]);
        }
      }
    }
  }

  return entries;
}

export function normalizeRemoteCatalogPayload(payload) {
  const providerEntries = extractProviderEntries(payload);
  if (providerEntries.length === 0) {
    throw new Error("Invalid model catalog schema");
  }

  const providers = {};
  for (const [providerHint, models] of providerEntries) {
    if (!Array.isArray(models)) continue;
    for (const rawModel of models) {
      const normalized = normalizeRemoteModel(rawModel, providerHint);
      if (!normalized) continue;
      if (!providers[normalized.provider]) providers[normalized.provider] = [];
      providers[normalized.provider].push(normalized);
    }
  }

  if (Object.keys(providers).length === 0) {
    throw new Error("No supported provider models found");
  }

  for (const [providerId, models] of Object.entries(providers)) {
    const deduped = new Map();
    for (const model of models) {
      const key = normalizeModelId(model.id);
      if (!deduped.has(key)) deduped.set(key, model);
    }
    providers[providerId] = Array.from(deduped.values());
  }

  return providers;
}

function createStaticProviders() {
  const providers = {};
  for (const [providerId, alias] of Object.entries(PROVIDER_ID_TO_ALIAS)) {
    const staticModels = PROVIDER_MODELS[alias] || [];
    providers[providerId] = staticModels.map((model) => ({
      ...model,
      provider: providerId,
      source: "static",
      contextWindow: model.contextWindow ?? null,
      maxOutputTokens: model.maxOutputTokens ?? null,
      capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
      family: model.family ?? null,
      releasedAt: model.releasedAt ?? null,
      deprecated: model.deprecated === true,
      lastUpdatedAt: model.lastUpdatedAt ?? null,
    }));
  }
  return providers;
}

function findDynamicMatch(staticModel, dynamicModels) {
  if (!Array.isArray(dynamicModels) || dynamicModels.length === 0) return null;
  const exact = dynamicModels.find((candidate) => normalizeModelId(candidate.id) === normalizeModelId(staticModel.id));
  if (exact) return exact;
  const simple = simplifyModelId(staticModel.id);
  return dynamicModels.find((candidate) => simplifyModelId(candidate.id) === simple) || null;
}

export function mergeCatalogProviders(staticProviders, dynamicProviders) {
  const merged = {};

  for (const [providerId, staticModels] of Object.entries(staticProviders)) {
    const dynamicModels = dynamicProviders[providerId] || [];
    const usedDynamicIds = new Set();

    const mergedModels = staticModels.map((staticModel) => {
      const dynamicMatch = findDynamicMatch(staticModel, dynamicModels);
      if (!dynamicMatch) return staticModel;
      usedDynamicIds.add(normalizeModelId(dynamicMatch.id));
      return {
        ...staticModel,
        name: dynamicMatch.name || staticModel.name,
        contextWindow: dynamicMatch.contextWindow ?? staticModel.contextWindow ?? null,
        maxOutputTokens: dynamicMatch.maxOutputTokens ?? staticModel.maxOutputTokens ?? null,
        capabilities: dynamicMatch.capabilities?.length
          ? dynamicMatch.capabilities
          : staticModel.capabilities || [],
        family: dynamicMatch.family ?? staticModel.family ?? null,
        releasedAt: dynamicMatch.releasedAt ?? staticModel.releasedAt ?? null,
        deprecated: dynamicMatch.deprecated === true || staticModel.deprecated === true,
        lastUpdatedAt: dynamicMatch.lastUpdatedAt ?? staticModel.lastUpdatedAt ?? null,
        source: "merged",
      };
    });

    const remoteOnly = dynamicModels
      .filter((model) => !usedDynamicIds.has(normalizeModelId(model.id)))
      .sort((a, b) => a.id.localeCompare(b.id));

    merged[providerId] = [...mergedModels, ...remoteOnly];
  }

  for (const [providerId, models] of Object.entries(dynamicProviders)) {
    if (merged[providerId]) continue;
    if (!PROVIDER_ID_TO_ALIAS[providerId]) continue;
    merged[providerId] = [...models].sort((a, b) => a.id.localeCompare(b.id));
  }

  return merged;
}

async function ensureInitialized() {
  if (state.initialized) return;
  try {
    const persisted = await getModelCatalogCache();
    state.cache = {
      ...state.cache,
      ...persisted,
    };
  } catch (error) {
    console.warn("Model catalog cache restore failed:", error?.message || "unknown error");
  } finally {
    state.initialized = true;
  }
}

async function fetchRemoteCatalog(etag) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(MODELS_DEV_URL, {
      method: "GET",
      headers: etag ? { "If-None-Match": etag } : {},
      cache: "no-store",
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function refreshDynamicCatalog({ force = false } = {}) {
  if (state.refreshPromise) return state.refreshPromise;

  state.refreshPromise = (async () => {
    try {
      const response = await fetchRemoteCatalog(force ? null : state.cache.etag);
      const now = new Date().toISOString();

      if (response.status === 304) {
        state.cache = {
          ...state.cache,
          fetchedAt: now,
          lastRefreshAt: now,
          lastRefreshStatus: "ok",
          lastError: null,
        };
        await setModelCatalogCache(state.cache);
        return;
      }

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const payload = await response.json();
      const providers = normalizeRemoteCatalogPayload(payload);

      state.cache = {
        ...state.cache,
        providers,
        etag: response.headers.get("etag"),
        fetchedAt: now,
        lastRefreshAt: now,
        lastRefreshStatus: "ok",
        lastError: null,
      };
      await setModelCatalogCache(state.cache);
    } catch (error) {
      const message = error?.message || "unknown error";
      console.warn("Model catalog refresh failed:", message);
      state.cache = {
        ...state.cache,
        lastRefreshAt: new Date().toISOString(),
        lastRefreshStatus: "error",
        lastError: message,
      };
      await setModelCatalogCache(state.cache);
    } finally {
      state.refreshPromise = null;
    }
  })();

  return state.refreshPromise;
}

function isFreshCache(ttlMinutes) {
  if (!state.cache.fetchedAt) return false;
  const fetchedAt = Date.parse(state.cache.fetchedAt);
  if (Number.isNaN(fetchedAt)) return false;
  return Date.now() - fetchedAt < ttlMinutes * 60 * 1000;
}

export async function getModelCatalog({ forceRefresh = false } = {}) {
  await ensureInitialized();

  const settings = await getSettings();
  const ttlMinutes = clampTtlMinutes(settings?.MODEL_CATALOG_TTL_MINUTES);
  const dynamicEnabled = settings?.ENABLE_DYNAMIC_MODEL_CATALOG !== false;

  if (dynamicEnabled) {
    if (forceRefresh) {
      await refreshDynamicCatalog({ force: true });
    } else if (!state.cache.fetchedAt) {
      await refreshDynamicCatalog();
    } else if (!isFreshCache(ttlMinutes)) {
      refreshDynamicCatalog().catch(() => {});
    }
  }

  const staticProviders = createStaticProviders();
  const providers = dynamicEnabled
    ? mergeCatalogProviders(staticProviders, state.cache.providers || {})
    : staticProviders;

  return {
    providers,
    catalogMeta: {
      dynamicEnabled,
      ttlMinutes,
      lastRefreshAt: state.cache.lastRefreshAt || null,
      lastRefreshStatus: dynamicEnabled ? state.cache.lastRefreshStatus || "idle" : "disabled",
      lastError: dynamicEnabled ? state.cache.lastError || null : null,
    },
  };
}

export function __resetModelCatalogServiceForTests() {
  state.initialized = false;
  state.refreshPromise = null;
  state.cache = {
    etag: null,
    fetchedAt: null,
    providers: {},
    lastRefreshAt: null,
    lastRefreshStatus: "idle",
    lastError: null,
  };
}

export { clampTtlMinutes };
