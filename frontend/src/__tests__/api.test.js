import axios from 'axios';
import { promptsApi, tagsApi, agentsApi } from '../services/api';

jest.mock('axios');

const mockGet = jest.fn();
const mockPost = jest.fn();
const mockPut = jest.fn();
const mockDelete = jest.fn();

axios.create.mockReturnValue({
  get: mockGet,
  post: mockPost,
  put: mockPut,
  delete: mockDelete,
});

// Re-import after mock to pick up the mocked axios instance
jest.resetModules();

describe('API service structure', () => {
  it('promptsApi has required methods', () => {
    expect(typeof promptsApi.list).toBe('function');
    expect(typeof promptsApi.get).toBe('function');
    expect(typeof promptsApi.create).toBe('function');
    expect(typeof promptsApi.update).toBe('function');
    expect(typeof promptsApi.delete).toBe('function');
    expect(typeof promptsApi.render).toBe('function');
    expect(typeof promptsApi.createVersion).toBe('function');
    expect(typeof promptsApi.getVersions).toBe('function');
    expect(typeof promptsApi.createExecution).toBe('function');
    expect(typeof promptsApi.getExecutions).toBe('function');
    expect(typeof promptsApi.addMetric).toBe('function');
    expect(typeof promptsApi.getMetrics).toBe('function');
  });

  it('tagsApi has required methods', () => {
    expect(typeof tagsApi.list).toBe('function');
    expect(typeof tagsApi.create).toBe('function');
    expect(typeof tagsApi.delete).toBe('function');
  });

  it('agentsApi has required methods', () => {
    expect(typeof agentsApi.list).toBe('function');
    expect(typeof agentsApi.get).toBe('function');
    expect(typeof agentsApi.create).toBe('function');
    expect(typeof agentsApi.update).toBe('function');
    expect(typeof agentsApi.delete).toBe('function');
  });
});
