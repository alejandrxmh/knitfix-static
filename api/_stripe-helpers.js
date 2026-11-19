/* Shared Stripe helpers.
   Prefixed with _ so Vercel doesn't treat it as a serverless function route.
   Note: Vercel still deploys underscore-prefixed files but routes starting with
   _ aren't publicly accessible. */

/**
 * List checkout sessions with automatic pagination.
 * Stripe caps a single list() call at 100. This paginates through all pages
 * until we've either exhausted results or hit `maxTotal`.
 *
 * Defaults to 500 max — covers plenty of history without burning through quota.
 * For one-off lookups by reference code, prefer findSessionByRef() instead
 * which short-circuits as soon as it finds a match.
 */
async function listAllSessions(stripe, { maxTotal = 500, extraParams = {} } = {}) {
  const all = [];
  let startingAfter = undefined;

  while (all.length < maxTotal) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      ...extraParams,
    });
    all.push(...page.data);
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return all;
}

/**
 * Find a single checkout session by its metadata.reference_code.
 * Paginates through history in chunks of 100.
 *
 * Since /api/pay can create several sessions for one ref (a fresh one each
 * time an old link is clicked after expiry), this prefers the PAID session:
 * it short-circuits on the first paid match, otherwise returns the newest
 * match of any status.
 */
async function findSessionByRef(stripe, ref, { maxSearched = 500, extraParams = {} } = {}) {
  if (!ref) return null;
  let startingAfter = undefined;
  let searched = 0;
  let fallback = null;

  while (searched < maxSearched) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      ...extraParams,
    });
    for (const s of page.data) {
      if (s.metadata?.reference_code !== ref) continue;
      if (s.payment_status === "paid") return s;
      if (!fallback) fallback = s;
    }

    searched += page.data.length;
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return fallback;
}

/**
 * All checkout sessions with this metadata.reference_code, newest first.
 */
async function findSessionsByRef(stripe, ref, { maxSearched = 500, extraParams = {} } = {}) {
  if (!ref) return [];
  const matches = [];
  let startingAfter = undefined;
  let searched = 0;

  while (searched < maxSearched) {
    const page = await stripe.checkout.sessions.list({
      limit: 100,
      ...(startingAfter ? { starting_after: startingAfter } : {}),
      ...extraParams,
    });
    matches.push(...page.data.filter((s) => s.metadata?.reference_code === ref));

    searched += page.data.length;
    if (!page.has_more || page.data.length === 0) break;
    startingAfter = page.data[page.data.length - 1].id;
  }

  return matches;
}

module.exports = { listAllSessions, findSessionByRef, findSessionsByRef };
