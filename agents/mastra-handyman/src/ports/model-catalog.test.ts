// Unit tests for the model catalog: spec parsing, env overrides and error
// paths. No network: resolveModel only builds provider/model objects.
import { describe, expect, it } from 'vitest';
import { DEFAULT_ROLE_MODEL, resolveModel, resolveRoleModels } from './model-catalog';

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
    const model = resolveModel('zai/glm-5.2', { Z_AI_API_KEY: 'test-key' });
    expect(model).toBeDefined();
    expect(typeof model).not.toBe('string');
  });

  it('resolves kimi-coding specs', () => {
    const model = resolveModel('kimi-coding/k3', { KIMI_API_KEY: 'test-key' });
    expect(model).toBeDefined();
  });

  it('rejects specs without provider/model shape', () => {
    expect(() => resolveModel('glm-5.2', {})).toThrow(/provider\/model/);
  });

  it('rejects unknown providers', () => {
    expect(() => resolveModel('moonshotai/kimi-k2.6', {})).toThrow(/unknown provider/);
  });
});
