import { NextRequest, NextResponse } from 'next/server';
import { fetchGitHubStats } from '@/lib/github';
import { generateInsightCard } from '@/lib/card-generator';
import { getTheme } from '@/lib/themes';

// Use edge runtime for faster cold starts (critical for GitHub's 4s timeout)
export const runtime = 'edge';
export const preferredRegion = 'auto';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const username = searchParams.get('username');
  const themeName = searchParams.get('theme') || 'github_dark';
  const showGraph = searchParams.get('graph') !== 'false';
  const showLanguages = searchParams.get('languages') !== 'false';
  const showStreak = searchParams.get('streak') !== 'false';
  const showStats = searchParams.get('stats') !== 'false';
  const showHeader = searchParams.get('header') !== 'false';
  const showSummary = searchParams.get('summary') !== 'false';
  const showProfile = searchParams.get('profile') !== 'false';
  const hideLangs = searchParams.get('hide_langs');
  const hiddenLanguages = hideLangs
    ? hideLangs.split(',').map((l) => l.trim()).filter(Boolean)
    : [];
  const showCalendar = searchParams.get('calendar') !== 'false';

  // The _t param is sent by the frontend to bust browser/CDN cache on regeneration.
  // We don't use its value — its presence in the URL is enough to create a unique cache key.
  // (No need to read searchParams.get('_t'))

  if (!username) {
    return new NextResponse(
      generateErrorCard('Username is required', getTheme('github_dark')),
      {
        status: 400,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-store',
        },
      }
    );
  }

  try {
    const stats = await fetchGitHubStats(username, hiddenLanguages);
    const theme = getTheme(themeName);

    const svg = generateInsightCard(stats, {
      theme,
      showGraph,
      showLanguages,
      showStreak,
      showStats,
      showHeader,
      showSummary,
      showProfile,
      showCalendar,
    });

    // Cache strategy:
    // - The GitHub data layer (github.ts) has its own 5-minute in-memory cache keyed
    //   by username + hidden languages, so repeated renders with different display options
    //   (theme, section toggles) are fast — they hit the in-memory cache, not the API.
    // - We deliberately do NOT use CDN/edge caching (no s-maxage) because the card is
    //   highly parameterised (theme, 8 toggle params, hide_langs, _t timestamp). Vercel's
    //   edge cache would only match an *exact* URL, so changing any param would always
    //   miss the cache anyway — we'd just be wasting CDN slots.
    // - Browser caching is also disabled so that the preview iframe/img always fetches
    //   fresh when the user clicks Generate / Update Card.
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml; charset=utf-8',
        // No CDN caching — the in-memory cache in github.ts is sufficient.
        // This guarantees theme/toggle changes are always reflected immediately.
        'Cache-Control': 'no-store',
        // Allows the SVG to be embedded in <img> tags on any domain (GitHub README).
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Error generating insight card:', error);
    const errorMessage =
      error instanceof Error ? error.message : 'Failed to generate stats';

    return new NextResponse(
      generateErrorCard(errorMessage, getTheme('github_dark')),
      {
        status: 500,
        headers: {
          'Content-Type': 'image/svg+xml',
          'Cache-Control': 'no-store',
        },
      }
    );
  }
}

function generateErrorCard(
  message: string,
  theme: ReturnType<typeof getTheme>
): string {
  // Sanitise the message so it's safe to embed directly in SVG text.
  const safe = message
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="500" height="120" viewBox="0 0 500 120">
  <rect x="0" y="0" width="500" height="120" rx="12" fill="${theme.background}"/>
  <rect x="0" y="0" width="500" height="120" rx="12" fill="none" stroke="#f85149" stroke-width="2"/>
  <text x="250" y="50" text-anchor="middle" font-size="18" font-weight="bold" fill="#f85149" font-family="Segoe UI, Ubuntu, Sans-Serif">
    &#x26A0;&#xFE0F; Error
  </text>
  <text x="250" y="80" text-anchor="middle" font-size="14" fill="${theme.text}" font-family="Segoe UI, Ubuntu, Sans-Serif">
    ${safe}
  </text>
</svg>`.trim();
}