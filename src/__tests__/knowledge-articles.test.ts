import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RTClient } from '../rt-client.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function mockResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 404 ? 'Not Found' : 'Error',
    json: async () => body,
  });
}

describe('Knowledge Article REST API', () => {
  let client: RTClient;

  beforeEach(() => {
    mockFetch.mockReset();
    client = new RTClient('http://rt.example.com', 'test-token');
  });

  describe('searchKnowledgeArticles', () => {
    it('sends a POST with JSON search conditions', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ total: 1, items: [{ id: 1 }] })
      );

      const result = await client.searchKnowledgeArticles('VPN');

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/REST/2.0/articles');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual([
        { field: 'Name', operator: 'LIKE', value: 'VPN' },
      ]);
      expect(result).toMatchObject({ total: 1 });
    });

    it('rejects empty search terms', () => {
      expect(() => client.searchKnowledgeArticles('  '))
        .toThrow('Search query must not be empty');
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('getKnowledgeArticle', () => {
    it('reads an article by ID', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({
          id: 1,
          Name: 'VPN',
          CustomFields: [
            { name: 'Content', values: ['Solution'] },
          ],
        })
      );

      const result = await client.getKnowledgeArticle(1);
      const [url, options] = mockFetch.mock.calls[0];

      expect(url).toContain('/REST/2.0/article/1');
      expect(options.method).toBe('GET');
      expect(result).toMatchObject({ id: 1 });
    });

    it.each([0, -1, 1.5, NaN])(
      'rejects invalid ID %s',
      (id) => {
        expect(() => client.getKnowledgeArticle(id)).toThrow();
        expect(mockFetch).not.toHaveBeenCalled();
      }
    );

    it('propagates HTTP 404', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ message: 'Article not found' }, 404)
      );

      await expect(client.getKnowledgeArticle(999))
        .rejects.toThrow('Article not found');
    });
  });

  describe('createKnowledgeArticle', () => {
    it('creates an article with its Content custom field', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ id: 2, type: 'article' }, 201)
      );

      await client.createKnowledgeArticle(
        'VPN Guide', 'VPN troubleshooting', 'Step 1', 1
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/REST/2.0/article');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({
        Name: 'VPN Guide',
        Summary: 'VPN troubleshooting',
        Class: 1,
        CustomFields: { Content: 'Step 1' },
      });
    });

    it('rejects an empty title', () => {
      expect(() =>
        client.createKnowledgeArticle('', 'Summary', 'Content')
      ).toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects empty content', () => {
      expect(() =>
        client.createKnowledgeArticle('Title', 'Summary', ' ')
      ).toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an invalid class', () => {
      expect(() =>
        client.createKnowledgeArticle('Title', 'Summary', 'Content', 0)
      ).toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('updateKnowledgeArticle', () => {
    it('updates only the specified summary', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse(['Article updated'])
      );

      await client.updateKnowledgeArticle(
        1, undefined, 'New summary', undefined, '"513"'
      );

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toContain('/REST/2.0/article/1');
      expect(options.method).toBe('PUT');
      expect(JSON.parse(options.body)).toEqual({
        Summary: 'New summary',
      });
    });

    it('sends replacement content in CustomFields', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse(['Article updated'])
      );

      await client.updateKnowledgeArticle(
        1, undefined, undefined, 'New content', '"513"'
      );

      const [, options] = mockFetch.mock.calls[0];
      expect(JSON.parse(options.body)).toEqual({
        CustomFields: { Content: 'New content' },
      });
    });

    it('rejects an update without fields', () => {
      expect(() => client.updateKnowledgeArticle(1)).toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('rejects an invalid ID', () => {
      expect(() =>
        client.updateKnowledgeArticle(0, 'New title')
      ).toThrow();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('propagates HTTP 500', async () => {
      mockFetch.mockReturnValueOnce(
        mockResponse({ message: 'Internal error' }, 500)
      );

      await expect(
        client.updateKnowledgeArticle(
          1, 'New title', undefined, undefined, '"513"'
        )
      ).rejects.toThrow('Internal error');
    });
  });

describe('Knowledge Article ETag protection', () => {
  it('sends If-Match on update', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(['Updated'])
    );

    await client.updateKnowledgeArticle(
      1, 'New title', undefined, undefined, '"513"'
    );

    const [, options] = mockFetch.mock.calls[0];
    expect(options.headers['If-Match']).toBe('"513"');
  });

  it('rejects updates without an ETag', () => {
    expect(() =>
      client.updateKnowledgeArticle(1, 'New title')
    ).toThrow(/ETag/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects weak or wildcard ETags', () => {
    for (const value of ['*', 'W/"513"', '513']) {
      expect(() =>
        client.updateKnowledgeArticle(
          1, 'New title', undefined, undefined, value
        )
      ).toThrow(/ETag/);
    }

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('propagates HTTP 412 on version conflicts', async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse({ message: 'Precondition Failed' }, 412)
    );

    await expect(
      client.updateKnowledgeArticle(
        1, 'New title', undefined, undefined, '"old"'
      )
    ).rejects.toThrow(/412/);
  });

  it('returns ETag when reading an article', async () => {
    mockFetch.mockReturnValueOnce(
      Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === 'etag' ? '"513"' : null
        },
        json: async () => ({ id: 1, Name: 'VPN' }),
      })
    );

    const result = await client.getKnowledgeArticle(1);
    expect(result).toMatchObject({
      id: 1,
      ETag: '"513"',
    });
  });
});

});
