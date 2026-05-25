// Fetches the latest commit info for this repo from the GitHub API and
// writes "shorthash · local-time" into every .version-stamp element.
// Silent fallback if the API is unreachable or the repo isn't public.

const REPO = 'jwolosiuk/teach-me-blackjack';

(async () => {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/commits/main`);
    if (!res.ok) return;
    const data = await res.json();
    const hash = data.sha.slice(0, 7);
    const when = new Date(data.commit.author.date);
    const time = when.toLocaleString(undefined, {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const text = `${hash} · ${time}`;
    document.querySelectorAll('.version-stamp').forEach(el => { el.textContent = text; });
  } catch {
    // network / CORS / rate limit — leave the placeholder
  }
})();
