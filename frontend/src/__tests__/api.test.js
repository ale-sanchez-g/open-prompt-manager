import api, {
  agentsApi,
  authApi,
  clearAccessToken,
  healthApi,
  promptsApi,
  setAccessToken,
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
});
