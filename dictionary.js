const WORD_API_URL =
  process.env.SCRABBLE_WORD_API_URL || 'https://wordotron.com/api/v1/check-word';

const cache = new Map();

async function checkWord(word) {
  const normalized = String(word || '').trim().toUpperCase();
  if (!normalized || !/^[A-Z]+$/.test(normalized)) return false;
  if (normalized.length > 50) return false;

  if (cache.has(normalized)) return cache.get(normalized);

  try {
    const res = await fetch(WORD_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ word: normalized }),
    });
    if (!res.ok) {
      cache.set(normalized, false);
      return false;
    }
    const data = await res.json();
    const valid = Boolean(data.valid);
    cache.set(normalized, valid);
    return valid;
  } catch {
    return false;
  }
}

async function checkWords(words) {
  const unique = [...new Set(words.map((w) => String(w).trim().toUpperCase()).filter(Boolean))];
  const results = {};
  await Promise.all(
    unique.map(async (w) => {
      results[w] = await checkWord(w);
    })
  );
  return results;
}

module.exports = { checkWord, checkWords };
