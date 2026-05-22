import api, {
  agentsApi,
  authApi,
  clearAccessToken,
  getAccessToken,
  healthApi,
  promptsApi,
  setAccessToken,
  subscribeToAuthFailures,
  tagsApi,
} from '../services/api';

function buildResponse(config, status, data) {
  return {
    data,
    status,
    statusText: status >= 400 ? 'Unauthorized' : 'OK',
    headers: {},
    config,
    request: {},
  };
}

function getAuthorizationHeader(config) {
  return config.headers?.Authorization || config.headers?.get?.('Authorization');
}

describe('API service structure', () => {
  afterEach(() => {
    clearAccessToken();
    api.defaults.adapter = undefined;
  });

  it('exposes the expected API groups', () => {
    expect(typeof authApi.register).toBe('function');
    expect(typeof authApi.login).toBe('function');
    expect(typeof authApi.refresh).toBe('function');
    expect(typeof authApi.logout).toBe('function');
    expect(typeof promptsApi.list).toBe('function');
    expect(typeof tagsApi.list).toBe('function');
    expect(typeof agentsApi.list).toBe('function');
    expect(typeof healthApi.check).toBe('function');
  });

  it('attaches the access token to protected requests', async () => {
    setAccessToken('access-token');
    api.defaults.adapter = async (config) => {
      expect(getAuthorizationHeader(config)).toBe('Bearer access-token');
      return buildResponse(config, 200, []);
    };

    await promptsApi.list();
  });

  it('refreshes an expired token and retries the original request', async () => {
    let refreshCalls = 0;
    setAccessToken('expired-token');

    api.defaults.adapter = async (config) => {
      const authorizationHeader = getAuthorizationHeader(config);

      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        return buildResponse(config, 200, { access_token: 'fresh-token', token_type: 'Bearer', expires_in: 900 });
      }

      if (config.url === '/api/prompts/' && authorizationHeader === 'Bearer expired-token') {
        return Promise.reject({ config, response: buildResponse(config, 401, { error: 'token_expired' }) });
      }

      if (config.url === '/api/prompts/' && authorizationHeader === 'Bearer fresh-token') {
        return buildResponse(config, 200, [{ id: 1, name: 'Prompt' }]);
      }

      throw new Error(`Unexpected request: ${config.url}`);
    };

    const response = await promptsApi.list();

    expect(refreshCalls).toBe(1);
    expect(response.data).toEqual([{ id: 1, name: 'Prompt' }]);
  });

  it('queues concurrent refresh attempts behind a single refresh call', async () => {
    let refreshCalls = 0;
    setAccessToken('expired-token');

    api.defaults.adapter = async (config) => {
      const authorizationHeader = getAuthorizationHeader(config);

      if (config.url === '/auth/refresh') {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        return buildResponse(config, 200, { access_token: 'fresh-token', token_type: 'Bearer', expires_in: 900 });
      }

      if (
        (config.url === '/api/prompts/' || config.url === '/api/tags/')
        && authorizationHeader === 'Bearer expired-token'
      ) {
        return Promise.reject({ config, response: buildResponse(config, 401, { error: 'token_expired' }) });
      }

      if (config.url === '/api/prompts/' && authorizationHeader === 'Bearer fresh-token') {
        return buildResponse(config, 200, [{ id: 1 }]);
      }

      if (config.url === '/api/tags/' && authorizationHeader === 'Bearer fresh-token') {
        return buildResponse(config, 200, [{ id: 2 }]);
      }

      throw new Error(`Unexpected request: ${config.url}`);
    };

    const [promptsResponse, tagsResponse] = await Promise.all([promptsApi.list(), tagsApi.list()]);

    expect(refreshCalls).toBe(1);
    expect(promptsResponse.data).toEqual([{ id: 1 }]);
    expect(tagsResponse.data).toEqual([{ id: 2 }]);
  });

  it('supports access token lifecycle helpers', () => {
    expect(getAccessToken()).toBeNull();

    setAccessToken('temporary-token');
    expect(getAccessToken()).toBe('temporary-token');

    clearAccessToken();
    expect(getAccessToken()).toBeNull();
  });

  it('notifies listeners and clears token when refresh endpoint returns 401', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAuthFailures(listener);

    setAccessToken('stale-token');
    api.defaults.adapter = async (config) => {
      if (config.url === '/auth/refresh') {
        return Promise.reject({ config, response: buildResponse(config, 401, { error: 'invalid_token' }) });
      }

      throw new Error(`Unexpected request: ${config.url}`);
    };

    await expect(authApi.refresh()).rejects.toBeTruthy();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(getAccessToken()).toBeNull();

    unsubscribe();
  });

  it('does not notify auth failure listeners when notification is explicitly skipped', async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToAuthFailures(listener);

    setAccessToken('still-valid-in-store');
    api.defaults.adapter = async (config) => {
      if (config.url === '/api/prompts/') {
        return Promise.reject({ config, response: buildResponse(config, 401, { error: 'invalid_token' }) });
      }

      throw new Error(`Unexpected request: ${config.url}`);
    };

    await expect(api.get('/api/prompts/', { _skipAuthFailureNotification: true })).rejects.toBeTruthy();
    expect(listener).not.toHaveBeenCalled();
    expect(getAccessToken()).toBe('still-valid-in-store');

    unsubscribe();
  });

  it('exposes wrapper methods that target expected endpoints', async () => {
    const calls = [];

    api.defaults.adapter = async (config) => {
      calls.push({
        method: config.method,
        url: config.url,
        hasData: config.data != null,
      });
      return buildResponse(config, 200, { ok: true });
    };

    await authApi.register({ email: 'new@example.com', password: 'secret1234' });
    await authApi.login({ email: 'new@example.com', password: 'secret1234' });
    await authApi.refresh();
    await authApi.logout();

    await promptsApi.list({ limit: 10 });
    await promptsApi.get(1);
    await promptsApi.create({ title: 'Prompt' });
    await promptsApi.update(1, { title: 'Prompt v2' });
    await promptsApi.delete(1);
    await promptsApi.createVersion(1, { content: 'new version' });
    await promptsApi.getVersions(1);
    await promptsApi.render(1, { topic: 'coverage' });
    await promptsApi.createExecution(1, { provider: 'openai' });
    await promptsApi.getExecutions(1);
    await promptsApi.addMetric(1, { score: 0.99 });
    await promptsApi.getMetrics(1);

    await tagsApi.list();
    await tagsApi.create({ name: 'new-tag' });
    await tagsApi.delete(2);

    await agentsApi.list();
    await agentsApi.get(3);
    await agentsApi.create({ name: 'agent-1' });
    await agentsApi.update(3, { name: 'agent-2' });
    await agentsApi.delete(3);

    await healthApi.check();

    expect(calls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ method: 'post', url: '/auth/register' }),
        expect.objectContaining({ method: 'post', url: '/auth/login' }),
        expect.objectContaining({ method: 'post', url: '/auth/refresh' }),
        expect.objectContaining({ method: 'post', url: '/auth/logout' }),
        expect.objectContaining({ method: 'get', url: '/api/prompts/' }),
        expect.objectContaining({ method: 'get', url: '/api/prompts/1' }),
        expect.objectContaining({ method: 'post', url: '/api/prompts/' }),
        expect.objectContaining({ method: 'put', url: '/api/prompts/1' }),
        expect.objectContaining({ method: 'delete', url: '/api/prompts/1' }),
        expect.objectContaining({ method: 'post', url: '/api/prompts/1/versions' }),
        expect.objectContaining({ method: 'get', url: '/api/prompts/1/versions' }),
        expect.objectContaining({ method: 'post', url: '/api/prompts/1/render' }),
        expect.objectContaining({ method: 'post', url: '/api/prompts/1/executions' }),
        expect.objectContaining({ method: 'get', url: '/api/prompts/1/executions' }),
        expect.objectContaining({ method: 'post', url: '/api/prompts/1/metrics' }),
        expect.objectContaining({ method: 'get', url: '/api/prompts/1/metrics' }),
        expect.objectContaining({ method: 'get', url: '/api/tags/' }),
        expect.objectContaining({ method: 'post', url: '/api/tags/' }),
        expect.objectContaining({ method: 'delete', url: '/api/tags/2' }),
        expect.objectContaining({ method: 'get', url: '/api/agents/' }),
        expect.objectContaining({ method: 'get', url: '/api/agents/3' }),
        expect.objectContaining({ method: 'post', url: '/api/agents/' }),
        expect.objectContaining({ method: 'put', url: '/api/agents/3' }),
        expect.objectContaining({ method: 'delete', url: '/api/agents/3' }),
        expect.objectContaining({ method: 'get', url: '/api/health' }),
      ]),
    );
  });
});
