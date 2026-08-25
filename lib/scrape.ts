// One HTML fetch powers the on-page/technical SEO audit AND social-presence detection.

function compactIdentity(s: string) {
  return (s || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\b(restaurant|restaurants|cafe|café|bakery|bakers|bakeshop|official|the|pk|usa|us|lahore|canada)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function meaningfulTokens(s: string) {
  const stop = new Set(["restaurant", "restaurants", "cafe", "bakery", "bakers", "bakeshop", "official", "the", "pk", "usa", "us", "lahore"]);
  return (s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((x) => x.length >= 3 && !stop.has(x));
}

function domainStem(rawUrl: string) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return host.split(".")[0] || "";
  } catch {
    return "";
  }
}

// Grab real social profiles, skipping tracking pixels & utility paths, then
// validate that the profile handle plausibly belongs to the target brand/site.
// This prevents unrelated sister-brand/footer links from being auto-filled.
function extractSocials(html: string, opts: { brandName?: string; siteUrl?: string; title?: string } = {}) {
  const grab = (host: string) => {
    const re = new RegExp(
      `https?://(?:www\\.|m\\.|business\\.)?${host.replace(".", "\\.")}/[A-Za-z0-9_.@\\-/]+`,
      "gi",
    );
    return html.match(re) || [];
  };
  const clean = (u: string) => u.replace(/[)\"'.,]+$/, "");
  const firstSeg = (u: string, host: string) =>
    (u.toLowerCase().split(host + "/")[1] || "").split(/[/?#]/)[0];

  const FB_BAD = new Set(["tr", "sharer", "sharer.php", "plugins", "dialog", "connect", "login",
    "help", "policy", "policies", "terms", "privacy", "ads", "watch", "events", "gaming",
    "marketplace", "business", "v1.0", "v2.0", "v3.0", "v2.3", "2008", "flx"]);
  const IG_BAD = new Set(["p", "reel", "reels", "explore", "accounts", "tv", "stories", "embed", "about"]);
  const TT_BAD = new Set(["tag", "music", "discover", "embed", "share", "about", "foryou"]);

  const references = [opts.brandName || "", opts.title || "", domainStem(opts.siteUrl || "")].filter(Boolean);
  const refCompacts = references.map(compactIdentity).filter((x) => x.length >= 3);
  const refTokens = [...new Set(references.flatMap(meaningfulTokens))];

  const ownershipScore = (segment: string) => {
    const handle = segment.replace(/^@/, "");
    const hCompact = compactIdentity(handle);
    if (!hCompact) return 0;
    let score = 0;

    for (const ref of refCompacts) {
      if (ref.length >= 4 && (hCompact.includes(ref) || ref.includes(hCompact))) score = Math.max(score, 100);
    }
    for (const token of refTokens) {
      if (token.length >= 4 && hCompact.includes(token)) score = Math.max(score, 72);
    }

    // A two-token brand such as "khan baba" can appear concatenated in handles.
    if (refTokens.length >= 2) {
      const pair = compactIdentity(refTokens.slice(0, 2).join(""));
      if (pair.length >= 6 && hCompact.includes(pair)) score = Math.max(score, 92);
    }
    return score;
  };

  const pick = (host: string, bad: Set<string>, mustAt = false) => {
    const candidates: { url: string; score: number }[] = [];
    for (const raw of grab(host)) {
      const u = clean(raw);
      const seg = firstSeg(u, host);
      if (!seg || bad.has(seg)) continue;
      if (mustAt && !seg.startsWith("@")) continue;
      candidates.push({ url: u, score: ownershipScore(seg) });
    }
    candidates.sort((a, b) => b.score - a.score);

    // If we know the brand/site, only auto-fill profiles with credible ownership.
    // If brand evidence is unavailable, preserve the old first-valid-link behavior.
    if (references.length) return candidates.find((c) => c.score >= 70)?.url || null;
    return candidates[0]?.url || null;
  };

  return {
    instagram: pick("instagram.com", IG_BAD),
    facebook: pick("facebook.com", FB_BAD),
    tiktok: pick("tiktok.com", TT_BAD, true),
  };
}

export async function auditSite(rawUrl: string, brandName = "") {
  const url = rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`;
  const res = await fetch(url, {
    headers: { "user-agent": "tossdown-audit/1.0 (+https://tossdown.com)" },
    redirect: "follow",
  });
  const html = await res.text();
  const finalUrl = res.url || url;
  const pick = (re: RegExp) => (html.match(re)?.[1] || "").trim();
  const has = (re: RegExp) => re.test(html);
  const title = pick(/<title[^>]*>([^<]*)<\/title>/i) || null;

  const socials = extractSocials(html, { brandName, siteUrl: finalUrl, title: title || "" });

  return {
    finalUrl,
    onPage: {
      https: finalUrl.startsWith("https://"),
      title,
      titleLength: (title || "").length,
      metaDescription: pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i) || null,
      h1: pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i).replace(/<[^>]+>/g, "").trim() || null,
      mobileFriendly: has(/<meta[^>]+name=["']viewport["']/i),
      hasCanonical: has(/<link[^>]+rel=["']canonical["']/i),
      hasStructuredData: has(/application\/ld\+json/i),
      hasOpenGraph: has(/<meta[^>]+property=["']og:/i),
    },
    social: {
      instagram: socials.instagram,
      facebook: socials.facebook,
      tiktok: socials.tiktok,
      presence: {
        instagram: !!socials.instagram,
        facebook: !!socials.facebook,
        tiktok: !!socials.tiktok,
      },
    },
  };
}

export async function checkRobotsSitemap(rawUrl: string) {
  const origin = new URL(rawUrl.startsWith("http") ? rawUrl : `https://${rawUrl}`).origin;
  const head = async (path: string) => {
    try { return (await fetch(origin + path, { method: "HEAD" })).ok; } catch { return false; }
  };
  return { robotsTxt: await head("/robots.txt"), sitemapXml: await head("/sitemap.xml") };
}
