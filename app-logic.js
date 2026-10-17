(function attachPalacoAppLogic(globalScope) {
  const isRepositoryRecord = (value) =>
    Boolean(
      value &&
      typeof value === 'object' &&
      typeof value.name === 'string' &&
      typeof value.html_url === 'string' &&
      typeof value.updated_at === 'string' &&
      typeof value.fork === 'boolean'
    );

  const normalizeRepo = (repo) => ({
    name: repo.name,
    html_url: repo.html_url,
    description: repo.description || '',
    language: repo.language || '—',
    stargazers_count: Number.isFinite(repo.stargazers_count) ? repo.stargazers_count : 0,
    open_issues_count: Number.isFinite(repo.open_issues_count) ? repo.open_issues_count : 0,
    updated_at: repo.updated_at
  });

  const normalizeRepositoryPayload = (payload) => {
    if (!Array.isArray(payload)) return [];

    return payload
      .filter(isRepositoryRecord)
      .filter((repo) => !repo.fork)
      .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
      .map(normalizeRepo);
  };

  const shouldReuseRefresh = ({ force, inFlight, mode }) => inFlight && (!force || mode === 'force');

  const getRepositoryStatusCount = ({ searchQuery, visibleCount, totalCount }) => {
    const searchActive = Boolean(searchQuery && searchQuery.trim());
    return {
      searchActive,
      count: searchActive ? visibleCount : totalCount
    };
  };

  const exported = {
    getRepositoryStatusCount,
    normalizeRepositoryPayload,
    shouldReuseRefresh
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exported;
  }

  globalScope.PalacoAppLogic = exported;
})(typeof globalThis !== 'undefined' ? globalThis : window);
