export const updateUrlScoreId = (nextScoreId: string) => {
  // Obsidian persists the source in its leaf; srcdoc has no navigable Next.js URL.
  if (typeof window === 'undefined' || '__MUSESCORER_CONFIG' in window) {
    return;
  }
  const url = new URL(window.location.href);
  url.searchParams.set('scoreId', nextScoreId);
  url.searchParams.delete('score');
  window.history.replaceState({}, '', url.toString());
};

export const buildOtsScoreId = (workId: string, sourceId: string) => `ots:${workId}:${sourceId}`;
