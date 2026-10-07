const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getRepositoryStatusCount,
  normalizeRepositoryPayload,
  shouldReuseRefresh
} = require('./app-logic.js');

test('normalizeRepositoryPayload keeps valid non-fork repositories and sorts by update time', () => {
  const payload = [
    {
      name: 'older',
      html_url: 'https://github.com/example/older',
      description: 'older repo',
      language: 'JavaScript',
      stargazers_count: 2,
      open_issues_count: 1,
      updated_at: '2026-09-10T10:00:00Z',
      fork: false
    },
    {
      name: 'forked',
      html_url: 'https://github.com/example/forked',
      updated_at: '2026-09-11T10:00:00Z',
      fork: true
    },
    {
      name: 'newer',
      html_url: 'https://github.com/example/newer',
      description: '',
      language: null,
      stargazers_count: 5,
      open_issues_count: 3,
      updated_at: '2026-09-11T10:00:00Z',
      fork: false
    },
    {
      message: 'rate limited'
    }
  ];

  assert.deepEqual(normalizeRepositoryPayload(payload), [
    {
      name: 'newer',
      html_url: 'https://github.com/example/newer',
      description: '',
      language: '—',
      stargazers_count: 5,
      open_issues_count: 3,
      updated_at: '2026-09-11T10:00:00Z'
    },
    {
      name: 'older',
      html_url: 'https://github.com/example/older',
      description: 'older repo',
      language: 'JavaScript',
      stargazers_count: 2,
      open_issues_count: 1,
      updated_at: '2026-09-10T10:00:00Z'
    }
  ]);
});

test('getRepositoryStatusCount uses visible count only for active search', () => {
  assert.deepEqual(
    getRepositoryStatusCount({ searchQuery: '', visibleCount: 2, totalCount: 7 }),
    { searchActive: false, count: 7 }
  );
  assert.deepEqual(
    getRepositoryStatusCount({ searchQuery: 'palaco', visibleCount: 2, totalCount: 7 }),
    { searchActive: true, count: 2 }
  );
});

test('shouldReuseRefresh allows forced refresh to bypass default in-flight requests', () => {
  assert.equal(shouldReuseRefresh({ force: false, inFlight: true, mode: 'default' }), true);
  assert.equal(shouldReuseRefresh({ force: true, inFlight: true, mode: 'default' }), false);
  assert.equal(shouldReuseRefresh({ force: true, inFlight: true, mode: 'force' }), true);
});
