const decodeHtml = (value) => value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
export const searchExamFormatSources = async (query) => {
    const response = await fetch(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
        headers: {
            'User-Agent': 'Mozilla/5.0 PlutoLearningBot/1.0',
        },
    });
    if (!response.ok) {
        throw new Error(`Search request failed with status ${response.status}.`);
    }
    const html = await response.text();
    const titles = Array.from(html.matchAll(/<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gsi)).slice(0, 5);
    const snippets = Array.from(html.matchAll(/<a class="result__snippet"[^>]*>(.*?)<\/a>/gsi)).slice(0, 5);
    return titles.map((match, index) => ({
        url: decodeHtml(match[1] ?? ''),
        title: decodeHtml((match[2] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
        snippet: decodeHtml((snippets[index]?.[1] ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
    }));
};
