// Unit tests for the model catalog: spec parsing, env overrides and error
// paths. No network: resolveModel only builds provider/model objects.
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertCatalogModel,
  DEFAULT_ROLE_MODEL,
  loadCatalogProviders,
  resolveModel,
  resolveRoleModels,
  roleDefaultOptions,
} from './model-catalog';

// The shipped catalog at the package root (tests run with cwd = package dir).
const SHIPPED_CATALOG = join(process.cwd(), 'model-catalog.json');

describe('resolveRoleModels', () => {
  it('defaults every role to the Z.AI GLM default', () => {
    const models = resolveRoleModels({});
    expect(models).toEqual({
      leader: DEFAULT_ROLE_MODEL,
      implementer: DEFAULT_ROLE_MODEL,
      reviewer: DEFAULT_ROLE_MODEL,
    });
  });

  it('honors per-role env overrides', () => {
    const models = resolveRoleModels({ HANDYMAN_REVIEWER_MODEL: 'kimi-coding/k2p7' });
    expect(models.reviewer).toBe('kimi-coding/k2p7');
    expect(models.leader).toBe(DEFAULT_ROLE_MODEL);
  });
});

describe('resolveModel', () => {
  it('resolves a known provider/model spec to a model instance', () => {
    const model = resolveModel('zai/glm-5.2', { env: { Z_AI_API_KEY: 'test-key' } });
    expect(model).toBeDefined();
    expect(typeof model).not.toBe('string');
  });

  it('resolves kimi-coding specs', () => {
    const model = resolveModel('kimi-coding/k3', { env: { KIMI_API_KEY: 'test-key' } });
    expect(model).toBeDefined();
  });

  it('rejects specs without provider/model shape', () => {
    expect(() => resolveModel('glm-5.2', {})).toThrow(/provider\/model/);
  });

  it('passes unknown providers through to the Mastra model router as strings', () => {
    // Dynamic catalog (2026-07-28): any built-in-registry provider (159 —
    // openrouter, openai, google…) resolves by naming it, no factory needed.
    expect(resolveModel('openrouter/z-ai/glm-5.2', {})).toBe('openrouter/z-ai/glm-5.2');
    expect(resolveModel('moonshotai/kimi-k2.6', {})).toBe('moonshotai/kimi-k2.6');
  });

  it('applies per-model capability defaults', () => {
    const openrouter = roleDefaultOptions('openrouter/z-ai/glm-5.2');
    expect(openrouter.modelSettings.maxOutputTokens).toBe(65_536);
    expect(openrouter.modelSettings).toMatchObject({ reasoning: 'high' });
    const fallback = roleDefaultOptions('zai/glm-5.2');
    expect(fallback.modelSettings.maxOutputTokens).toBe(16_384);
    expect('reasoning' in fallback.modelSettings).toBe(false);
  });
});

describe('personal catalog (local providers)', () => {
  it('loads the shipped model-catalog.json with the two local examples', () => {
    const providers = loadCatalogProviders(SHIPPED_CATALOG);
    expect(Object.keys(providers)).toEqual(['ollama', 'lmstudio']);
    expect(providers.ollama?.baseURL).toBe('http://127.0.0.1:11434/v1');
    expect(providers.ollama?.apiKeyEnv).toBeNull();
  });

  it('returns empty for a missing catalog path (never throws)', () => {
    expect(loadCatalogProviders('/nonexistent/model-catalog.json')).toEqual({});
  });

  it('resolves catalog specs to Anthropic-protocol instances without a key', () => {
    const model = resolveModel('ollama/qwen3:32b', { catalogPath: SHIPPED_CATALOG });
    expect(model).toBeDefined();
    expect(typeof model).not.toBe('string');
  });

  it('assertCatalogModel enforces declared model lists', () => {
    const provider = {
      id: 'ollama',
      baseURL: 'http://127.0.0.1:11434/v1',
      apiKeyEnv: null,
      protocol: 'anthropic' as const,
      models: ['qwen3:32b'],
    };
    expect(() => assertCatalogModel(provider, 'qwen3:32b')).not.toThrow();
    expect(() => assertCatalogModel(provider, 'otro:7b')).toThrow(/not declared/);
    // Empty/absent list = any model the server has loaded.
    expect(() => assertCatalogModel({ ...provider, models: [] }, 'otro:7b')).not.toThrow();
  });
});
