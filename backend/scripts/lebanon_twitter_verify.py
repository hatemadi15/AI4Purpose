import argparse
import base64
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from difflib import SequenceMatcher


LEBANON_ALIASES_EN = [
    "Lebanon", "Beirut", "Tripoli", "Saida", "Sidon", "Tyre", "Sour",
    "Jounieh", "Zahle", "Baabda", "Metn", "Keserwan", "Chouf",
    "Nabatieh", "Bekaa", "Aley", "Akkar", "Baalbek", "Hermel"
]

LEBANON_ALIASES_AR = [
    "لبنان", "بيروت", "طرابلس", "صيدا", "صور", "جونية", "زحلة", "بعبدا",
    "المتن", "كسروان", "الشوف", "النبطية", "البقاع", "عاليه", "عكار"
]

EXCLUDED_LOCATIONS_EN = [
    "iran", "iraq", "syria", "israel", "turkey", "jordan", "egypt", "saudi",
    "uae", "dubai", "abu dhabi", "qatar", "kuwait", "yemen", "oman", "bahrain",
    "palestine", "gaza", "west bank", "jerusalem", "tel aviv", "ramallah",
    "tehran", "baghdad", "damascus", "aleppo", "istanbul", "ankara", "cairo",
    "riyadh", "doha", "bushehr", "boushehr", "busher", "assaluyeh", "asaluyeh"
]

EXCLUDED_LOCATIONS_AR = [
    "إيران", "العراق", "سوريا", "إسرائيل", "تركيا", "الأردن", "مصر", "السعودية",
    "الإمارات", "دبي", "أبوظبي", "قطر", "الكويت", "اليمن", "عُمان", "البحرين",
    "فلسطين", "غزة", "الضفة", "القدس", "تل أبيب", "رام الله", "طهران",
    "بغداد", "دمشق", "حلب", "اسطنبول", "أنقرة", "القاهرة", "الرياض", "الدوحة",
    "إيراني", "إيرانية", "ايراني", "ايرانية", "ايران", "بوشهر", "عسلويه"
]

TIER1_ACCOUNTS = [
    "LebCivilDefense",
    "LAFOfficial",
    "RedCrossLebanon",
    "LebArmyOfficial",
    "LebanonNewsDesk"
]

TIER2_ACCOUNTS = [
    "Lebanon24",
    "mtvlebanonnews",
    "AlJadeed_TV",
    "LBCI_NEWS",
    "BeirutObserver"
]

TIER1_WEIGHT = 1.0
TIER2_WEIGHT = 0.7
TIER3_WEIGHT = 0.3

EVENT_SYNONYMS = {
    "earthquake": [
        "earthquake", "quake", "tremor", "aftershock", "shaking", "seismic",
        "زلزال", "هزة", "ارتداد"
    ],
    "explosion": [
        "explosion", "blast", "detonation", "boom", "انفجار"
    ],
    "fire": [
        "fire", "wildfire", "blaze", "burning", "smoke", "حريق", "اشتعل"
    ],
    "protest": [
        "protest", "demonstration", "rally", "march", "riot", "تظاهرة", "احتجاج"
    ],
    "security": [
        "security incident", "shooting", "attack", "raid", "clash", "gunfire",
        "أمن", "اشتباك", "هجوم", "إطلاق نار"
    ]
}

SEARCH_LOOKBACK_HOURS = 12
CLUSTER_WINDOW_MINUTES = 10
MIN_SCORE = 1.5


def load_env_from_file(path):
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as handle:
        for line in handle:
            raw = line.strip()
            if not raw or raw.startswith("#") or "=" not in raw:
                continue
            key, value = raw.split("=", 1)
            key = key.strip()
            value = value.strip().strip("'").strip('"')
            os.environ.setdefault(key, value)


def normalize_text(text):
    if not text:
        return ""
    text = text.lower()
    # Keep Arabic range and word characters, replace punctuation with spaces
    text = re.sub(r"[^\w\s\u0600-\u06FF]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def contains_excluded_location(text, excluded_terms):
    if not text:
        return False
    norm = normalize_text(text)
    tokens = set(norm.split())
    for term in excluded_terms:
        term_norm = normalize_text(term)
        if not term_norm:
            continue
        if term_norm in norm:
            return True
        if " " in term_norm:
            if term_norm in norm:
                return True
        elif term_norm in tokens:
            return True
    return False


def semantic_match(text, synonyms):
    norm = normalize_text(text)
    tokens = set(norm.split())
    matches = []

    for syn in synonyms:
        syn_norm = normalize_text(syn)
        if not syn_norm:
            continue
        if " " in syn_norm:
            if syn_norm in norm:
                matches.append(syn_norm)
                continue
        if syn_norm in tokens:
            matches.append(syn_norm)
            continue

        # Fuzzy match for close spellings
        for token in tokens:
            if SequenceMatcher(None, token, syn_norm).ratio() >= 0.86:
                matches.append(syn_norm)
                break

    unique_matches = list(dict.fromkeys(matches))
    count = len(unique_matches)
    if count == 0:
        return 0.0, []
    if count >= 3:
        return 1.0, unique_matches
    if count == 2:
        return 0.8, unique_matches
    return 0.6, unique_matches


def extract_locations(text, location_aliases):
    norm = normalize_text(text)
    hits = []
    for alias in location_aliases:
        alias_norm = normalize_text(alias)
        if not alias_norm:
            continue
        if " " in alias_norm:
            if alias_norm in norm:
                hits.append(alias_norm)
        else:
            if alias_norm in norm.split():
                hits.append(alias_norm)
    return list(dict.fromkeys(hits))


def time_weight(created_at):
    now = dt.datetime.now(dt.timezone.utc)
    diff = now - created_at
    minutes = diff.total_seconds() / 60
    if minutes <= 10:
        return 1.0
    if minutes <= 30:
        return 0.8
    if minutes <= 60:
        return 0.6
    if minutes <= 360:
        return 0.4
    if minutes <= 720:
        return 0.2
    return 0.0


def account_tier(username):
    if not username:
        return 3, TIER3_WEIGHT
    name = username.lower()
    if name in {a.lower() for a in TIER1_ACCOUNTS}:
        return 1, TIER1_WEIGHT
    if name in {a.lower() for a in TIER2_ACCOUNTS}:
        return 2, TIER2_WEIGHT
    return 3, TIER3_WEIGHT


def parse_time(ts):
    if not ts:
        return None
    try:
        return dt.datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(dt.timezone.utc)
    except ValueError:
        return None


def compute_cluster_windows(scored_tweets):
    windows = {}
    window_minutes = CLUSTER_WINDOW_MINUTES
    for tweet in scored_tweets:
        if tweet["semantic_score"] <= 0:
            continue
        for loc in tweet["locations"]:
            windows.setdefault(loc, []).append(tweet["created_at"])

    active_windows = {}
    for loc, times in windows.items():
        times = sorted(times)
        start_idx = 0
        for end_idx in range(len(times)):
            while (times[end_idx] - times[start_idx]).total_seconds() / 60 > window_minutes:
                start_idx += 1
            if end_idx - start_idx + 1 >= 3:
                active_windows.setdefault(loc, []).append((times[start_idx], times[end_idx]))
    return active_windows


def in_cluster_window(created_at, windows):
    for loc, ranges in windows.items():
        for start, end in ranges:
            if start <= created_at <= end:
                return True, loc
    return False, None


def score_tweet(tweet, cluster_windows, location_aliases):
    if contains_excluded_location(tweet["text"], EXCLUDED_LOCATIONS_EN + EXCLUDED_LOCATIONS_AR):
        return None

    semantic_score, semantic_hits = semantic_match(tweet["text"], tweet["event_terms"])
    if semantic_score == 0:
        return None

    tier, account_weight = account_tier(tweet["username"])
    locations = extract_locations(tweet["text"], location_aliases)
    explicit_location = len(locations) > 0

    location_bonus = 0.0
    location_reason = None
    if explicit_location:
        location_bonus = 1.0
        location_reason = f"location mention ({', '.join(locations[:2])})"
    elif tier in (1, 2):
        location_bonus = 0.6
        location_reason = "trusted account"
    else:
        clustered, cluster_loc = in_cluster_window(tweet["created_at"], cluster_windows)
        if clustered:
            location_bonus = 0.5
            location_reason = f"crowd cluster near {cluster_loc}"

    if location_bonus == 0.0:
        return None

    tw = time_weight(tweet["created_at"])
    score = account_weight + semantic_score + location_bonus + tw

    if score < MIN_SCORE:
        return None

    reason_parts = [
        f"tier {tier}",
        f"semantic ({', '.join(semantic_hits[:2])})",
        location_reason,
        f"recency {tw:.1f}"
    ]

    return {
        "id": tweet["id"],
        "username": tweet["username"],
        "tier": tier,
        "text": tweet["text"],
        "timestamp": tweet["created_at"].isoformat().replace("+00:00", "Z"),
        "score": round(score, 2),
        "reason": "; ".join([p for p in reason_parts if p])
    }


def cluster_tweets(verified):
    clusters = []
    for tweet in verified:
        norm = normalize_text(tweet["text"])
        placed = False
        for cluster in clusters:
            if SequenceMatcher(None, norm, cluster["norm"]).ratio() >= 0.9:
                if tweet["score"] > cluster["best"]["score"]:
                    cluster["best"] = tweet
                placed = True
                break
        if not placed:
            clusters.append({"norm": norm, "best": tweet})
    return [c["best"] for c in clusters]


def get_bearer_token():
    token = os.environ.get("TWITTER_BEARER_TOKEN")
    if token:
        return token

    api_key = os.environ.get("TWITTER_API_KEY")
    api_secret = os.environ.get("TWITTER_API_SECRET")
    if not api_key or not api_secret:
        raise RuntimeError("Missing TWITTER_API_KEY / TWITTER_API_SECRET")

    credentials = base64.b64encode(f"{api_key}:{api_secret}".encode("utf-8")).decode("utf-8")
    data = urllib.parse.urlencode({"grant_type": "client_credentials"}).encode("utf-8")
    req = urllib.request.Request(
        "https://api.twitter.com/oauth2/token",
        data=data,
        headers={
            "Authorization": f"Basic {credentials}",
            "Content-Type": "application/x-www-form-urlencoded"
        },
        method="POST"
    )
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
        return payload.get("access_token")


def twitter_search(bearer_token, query, start_time, max_results=50):
    params = {
        "query": query,
        "max_results": max_results,
        "start_time": start_time,
        "tweet.fields": "created_at,author_id,text,lang,public_metrics,referenced_tweets",
        "expansions": "author_id",
        "user.fields": "username"
    }
    url = "https://api.twitter.com/2/tweets/search/recent?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {bearer_token}"}, method="GET")
    with urllib.request.urlopen(req, timeout=20) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload


def build_queries(event_terms, location_terms):
    def chunk(items, size):
        return [items[i:i + size] for i in range(0, len(items), size)]

    event_chunks = chunk(event_terms, 5)[:2] or [event_terms]
    location_chunks = chunk(location_terms, 8)[:2] or [location_terms]

    queries = []

    # Public search: location + event
    for locs in location_chunks:
        for events in event_chunks:
            loc_query = " OR ".join([f'"{l}"' if " " in l else l for l in locs])
            event_query = " OR ".join([f'"{e}"' if " " in e else e for e in events])
            queries.append(f"({loc_query}) ({event_query}) -is:retweet -is:reply -is:quote")

    # Tier accounts search: event only
    for tier_accounts in [TIER1_ACCOUNTS, TIER2_ACCOUNTS]:
        for accounts in chunk(tier_accounts, 5):
            acc_query = " OR ".join([f"from:{acc}" for acc in accounts])
            event_query = " OR ".join([f'"{e}"' if " " in e else e for e in event_terms[:8]])
            queries.append(f"({acc_query}) ({event_query}) -is:retweet -is:reply -is:quote")

    return queries


def fetch_tweets(event_terms, location_terms):
    bearer = get_bearer_token()
    start_time = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=SEARCH_LOOKBACK_HOURS)).isoformat().replace("+00:00", "Z")
    queries = build_queries(event_terms, location_terms)

    all_tweets = {}
    user_map = {}

    for query in queries:
        payload = twitter_search(bearer, query, start_time)
        users = {u["id"]: u["username"] for u in payload.get("includes", {}).get("users", [])}
        user_map.update(users)
        for tweet in payload.get("data", []):
            # Filter retweets/quotes
            if any(ref.get("type") in ("retweeted", "quoted") for ref in tweet.get("referenced_tweets", [])):
                continue
            all_tweets[tweet["id"]] = tweet
        time.sleep(0.2)

    results = []
    for tweet_id, tweet in all_tweets.items():
        created_at = parse_time(tweet.get("created_at"))
        if not created_at:
            continue
        results.append({
            "id": tweet_id,
            "text": tweet.get("text", ""),
            "created_at": created_at,
            "username": user_map.get(tweet.get("author_id"), "unknown")
        })
    return results


def verify_event(event_type):
    event_key = event_type.strip().lower()
    event_terms = EVENT_SYNONYMS.get(event_key, [event_type])
    location_terms = LEBANON_ALIASES_EN + LEBANON_ALIASES_AR

    raw_tweets = fetch_tweets(event_terms, location_terms)

    scored_tweets = []
    for tweet in raw_tweets:
        semantic_score, _ = semantic_match(tweet["text"], event_terms)
        locations = extract_locations(tweet["text"], location_terms)
        scored_tweets.append({
            "id": tweet["id"],
            "text": tweet["text"],
            "created_at": tweet["created_at"],
            "username": tweet["username"],
            "semantic_score": semantic_score,
            "locations": locations,
            "event_terms": event_terms
        })

    cluster_windows = compute_cluster_windows(scored_tweets)

    verified = []
    rejected = 0
    for tweet in scored_tweets:
        scored = score_tweet(tweet, cluster_windows, location_terms)
        if not scored:
            rejected += 1
            continue
        verified.append(scored)

    verified = cluster_tweets(verified)

    if verified:
        avg_score = sum(t["score"] for t in verified) / len(verified)
        confidence = round(min(1.0, avg_score / 4.0), 2)
    else:
        confidence = 0.0

    return {
        "event": event_type,
        "region": "Lebanon",
        "confidence_score": confidence,
        "verified_tweets": sorted(verified, key=lambda t: t["score"], reverse=True),
        "rejected_count": rejected
    }


def main():
    parser = argparse.ArgumentParser(description="Lebanon-only Twitter verification demo")
    parser.add_argument("--event", required=True, help="Event type (earthquake, explosion, fire, protest, security)")
    parser.add_argument("--env", default="backend/.env", help="Path to .env file")
    args = parser.parse_args()

    load_env_from_file(args.env)

    try:
        if hasattr(sys.stdout, "reconfigure"):
            sys.stdout.reconfigure(encoding="utf-8")
        result = verify_event(args.event)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
