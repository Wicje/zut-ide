import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const NESTED = {
  connected: ['opencode', 'openrouter'],
  all: [
    {
      id: 'opencode',
      models: {
        'mimo-v2.6-flash-free': {
          id: 'mimo-v2.6-flash-free',
          providerID: 'opencode',
          name: 'MiMo-V2.6-Flash Free',
          cost: { input: 0, output: 0 },
        },
      },
    },
    {
      id: 'openrouter',
      models: {
        'kimi-k2': {
          id: 'kimi-k2',
          providerID: 'openrouter',
          name: 'Kimi K2',
          cost: { input: 3, output: 15 },
        },
      },
    },
    {
      id: 'disconnected',
      models: {
        'hidden': { id: 'hidden', providerID: 'disconnected', name: 'Hidden' },
      },
    },
  ],
};

const FLAT = {
  connected: ['opencode'],
  all: [
    { id: 'mimo-v2.6-flash-free', providerID: 'opencode', name: 'MiMo', cost: { input: 0, output: 0 } },
    { id: 'kimi-k2', providerID: 'openrouter', name: 'Kimi' },
  ],
};

function mockProvider(body: unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })),
  );
}

async function loadAdapter() {
  vi.resetModules();
  return import('./opencode');
}

describe('listOpencodeModels', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reads providers that nest their models', async () => {
    mockProvider(NESTED);
    const { listOpencodeModels } = await loadAdapter();
    const models = await listOpencodeModels();
    expect(models).toEqual([
      { providerID: 'opencode', id: 'mimo-v2.6-flash-free', name: 'MiMo-V2.6-Flash Free', free: true },
      { providerID: 'openrouter', id: 'kimi-k2', name: 'Kimi K2', free: false },
    ]);
  });

  it('still reads a flat model list', async () => {
    mockProvider(FLAT);
    const { listOpencodeModels } = await loadAdapter();
    const models = await listOpencodeModels();
    expect(models.map((m) => m.id)).toEqual(['mimo-v2.6-flash-free']);
  });

  it('does not cache an empty list', async () => {
    mockProvider({ connected: [], all: [] });
    const { listOpencodeModels } = await loadAdapter();
    expect(await listOpencodeModels()).toEqual([]);
    mockProvider(NESTED);
    expect((await listOpencodeModels()).length).toBe(2);
  });
});
