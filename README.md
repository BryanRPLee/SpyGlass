# SpyGlass

## Problem: The Limitation of Valve

Valve's CS2 Game Coordinator only allows you to retrieve the **last 8 matches** for any given player.

This means:

- You cannot access the full match historyfor a player over time
- Valuable stats, relationships, and in-depth analytics are lost once a player plays more games
- Longitudinal or viral player/match linkage (player graph, social links, full stat aggregation) is impossible with just direct GC queries

## Solution: The Virus

**SpyGlass's viral crawler** solves this by:

- Starting from 1 or more seeded Steam IDs
- Grabbing each seed's last 8 matches via GC
- Discover all players from those matches
- **Persist all matches, players, rounds, and relationships** in a scalable database
- Repeat the above steps recursively such that it:
- Builds a living, growing network of historical CS2 match data that bypasses Valve's 8 match window

## Performance: optimised Batching

SpyGlass uses an **optimised parallel crawler** inspired by high-scale data aggregation platforms like scope.gg and csstats.gg:

### Key optimisations

- **Parallel Processing**: Processes up to 10 players concurrently (configurable)
- **Batch Database Operations**: Groups database updates to minimise round trips
- **Zero Artificial Delays**: Removed all fixed sleep timers between API calls
- **Smart Rate Limiting**: Adaptive backoff only when rate limits are detected
- **Concurrent Match Storage**: All matches for a player stored in parallel

### Performance Comparison

| Metric                | Before optimisation | After optimisation         | Improvement       |
| --------------------- | ------------------- | -------------------------- | ----------------- |
| **Players per Batch** | 5                   | 20                         | 4x                |
| **Processing Model**  | Sequential          | Parallel (10 concurrent)   | 10x               |
| **Fixed Delays**      | ~11s per player     | ~0s (API-limited only)     | ∞                 |
| **Batch Interval**    | 5000ms              | 1000ms                     | 5x                |
| **Throughput**        | ~300 players/hour   | ~7,200-14,400 players/hour | **24-48x faster** |

### Configuration

The crawler can be tuned via environment variables:

```bash
# .env
CRAWLER_ENABLED=true
CRAWLER_BATCH_SIZE=20              # Players per batch
CRAWLER_INTERVAL_MS=1000           # Delay between batches
CRAWLER_MAX_RETRIES=3              # Max retry attempts
CRAWLER_CONCURRENCY_LIMIT=10       # Parallel processing limit
CRAWLER_MIN_DELAY_MS=500           # Minimum delay between chunks
CRAWLER_RATE_LIMIT_BACKOFF_MS=30000 # Backoff duration on rate limit
```

### Architecture Improvements

**Database optimisations:**

- Batch `updateMany` operations for status changes
- Parallel upserts during seeding
- Graceful handling of unique constraint conflicts
- In-memory locking prevents race conditions

**API Call optimisations:**

- Profile and match history fetched in parallel
- Match storage happens concurrently
- No artificial delays between operations

**Error Handling:**

- Try-catch with fallback for `accountId` conflicts
- Automatic retry without conflicting fields
- Smart detection of rate limits vs. invalid accounts

## System Design

```mermaid
graph LR
  subgraph User
    U1((User))
  end

  subgraph Steam
    STEAM[CS2 Game Coordinator]
  end

  subgraph Backend["Backend Server"]
    API[REST API Endpoints]
    SteamClient["SteamClient"]
    Crawler["ViralCrawlerService"]
    MHService["MatchHistoryService"]
    MPService["MatchProfileService"]
    MStorage["MatchStorageService"]
  end

  subgraph DB["Database (Prisma/SQL)"]
    PlayerTable["Player Table"]
    MatchTable["Match Table"]
    MatchPlayerTable["MatchPlayer Table"]
    RoundTable["Round Table"]
    RoundPlayerTable["RoundPlayer Table"]
    CrawlQueue["CrawlQueue Table"]
  end

  U1 -- Seed IDs / Start crawling --> API
  API -- triggers --> Crawler
  Crawler -- uses --> SteamClient
  SteamClient -- fetches matches & profiles --> STEAM

  Crawler -- uses --> MHService
  Crawler -- uses --> MStorage
  Crawler -- updates queue --> CrawlQueue

  MHService -- stores matches/players --> MStorage
  MStorage -- writes --> PlayerTable
  MStorage -- writes --> MatchTable
  MStorage -- writes --> MatchPlayerTable
  MStorage -- writes --> RoundTable
  MStorage -- writes --> RoundPlayerTable

  CrawlQueue -- used by --> Crawler

  MPService -- reads/writes --> PlayerTable
  API -- fetches stats/profiles --> PlayerTable
  API -- fetches matches --> MatchTable
```

## Virus Network

```mermaid
graph LR
    %% Seed player starts the network
    Seed([Seed Player])
    %% The seed's matches
    Seed --> Match1((Match 1))
    Seed --> Match2((Match 2))
    Seed --> Match3((Match 3))
    Seed --> Match4((Match 4))

    %% Other players in Match 1
    Match1 --> P1a[Player A]
    Match1 --> P1b[Player B]
    Match1 --> P1c[Player C]

    %% Other players in Match 2
    Match2 --> P2a[Player D]
    Match2 --> P2b[Player E]
    Match2 --> P2c[Player F]

    %% Other players in Match 3
    Match3 --> P3a[Player G]
    Match3 --> P3b[Player H]

    %% Other players in Match 4
    Match4 --> P4a[Player I]
    Match4 --> P4b[Player J]

    %% Recursively crawling more players: Show some expansion for Player B and Player E
    P1b --> Match5((Match 5))
    Match5 --> P5a[Player K]
    Match5 --> P5b[Player L]
    Match5 --> P5c[Player M]

    P2b --> Match6((Match 6))
    Match6 --> P6a[Player N]
    Match6 --> P6b[Player O]
    Match6 --> P6c[Player P]
```

### Entity Relationship Diagram

```mermaid
erDiagram
    Player {
      id String
      accountId BigInt
      lastSeen DateTime
      createdAt DateTime
      playerLevel Int
      playerCurXp Int
      vacBanned Boolean
      penaltySeconds Int
      penaltyReason Int
      totalMatches Int
      totalKills Int
      totalDeaths Int
      totalAssists Int
      totalMvps Int
      discoveredFromId String
    }
    Match {
      id String
      matchTime DateTime
      createdAt DateTime
      map String
      duration Int
      maxRounds Int
      serverIp BigInt
      tvPort Int
      gameType Int
      processed Boolean
    }
    MatchPlayer {
      id String
      matchId String
      playerId String
      createdAt DateTime
      slot Int
      team Int
      kills Int
      deaths Int
      assists Int
      mvps Int
      score Int
    }
    Round {
      id String
      matchId String
      roundNumber Int
      createdAt DateTime
      duration Int
      map String
      roundResult Int
      matchResult Int
      teamScores String
    }
    RoundPlayer {
      id String
      roundId String
      playerId String
      playerIndex Int
      accountId BigInt
      kills Int
      deaths Int
      assists Int
      score Int
      mvps Int
      headshots Int
      enemyKills Int
    }
    CrawlQueue {
      id String
      playerId String
      priority Int
      attempts Int
      lastAttempt DateTime
      createdAt DateTime
      status String
      error String
    }
    CrawlStats {
      id String
      timestamp DateTime
      totalPlayers Int
      totalMatches Int
      pendingCrawls Int
      failedCrawls Int
      avgMatchesPerPlayer Float
    }

    %% Relationships/Foreign keys
    MatchPlayer }|--|| Match : "matchId"
    MatchPlayer }|--|| Player : "playerId"
    Round }|--|| Match : "matchId"
    RoundPlayer }|--|| Round : "roundId"
    RoundPlayer }|--|| Player : "playerId"
    Player ||--o{ Player : "discoveredFromId"
    CrawlQueue }|--|| Player : "playerId"
```

---

## FAQ

**Q: Is this compliant with what GC allows?**

A: The crawler never fetches more than 8 matches per player, but by connecting the dots across all visible players, it indirectly reconstructs deep match/player histories.

**Q: Can I get an entire region's matches and player stats?**

A: Yes. The more seed IDs and the longer you let it run, the larger your web of tracked matches and players will be.

**Q: Are there any limitations?**

A: Yes. For players that have private profiles or are not opted-in to match tracking, the GC will not publish their data.

**Q: How fast can the virus spread?**

A: With optimised parallel batching, SpyGlass can process **7,200-14,400 players per hour** (24-48x faster than the original sequential implementation). The actual speed depends on Steam API response times and rate limits.

**Q: Does faster crawling violate Steam's rate limits?**

A: No. Initially, I was planning on having multiple accounts running at the same time, but from my previous company (WiseTech Global), I learned the performance increase batching can have on heavy and large amounts of database operations.

SpyGlass implements smart rate limiting with automatic backoff when limits are detected. The speed improvements come from eliminating unnecessary delays and processing multiple players concurrently, not from bypassing rate limits.

---

**No more losing data after 8 games.**
**With SpyGlass, you build an ever-growing, living network of match stats—across all of CS2.**
