// Retrying a deletion is safe: archive/removal commit together, and an already
// removed target is acknowledged by the bulk endpoint without a second archive.
export async function withLearnerDeletionRetry(request, pause = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  for (let attempt = 0; ; attempt++) {
    try { return await request(); }
    catch (error) {
      const transient = error?.code === 'P2034' || [408, 429, 500, 502, 503, 504].includes(error?.status) || error?.name === 'TypeError';
      if (!transient || attempt >= 2) throw error;
      await pause(500 * (attempt + 1));
    }
  }
}
