Comprehensive Build Prompt: Social Platform with Dedicated RPG Game Section on Cloudflare (Workers + Wrangler + Node.js/npm)

Role You are an expert full‑stack engineer and game systems designer specializing in Cloudflare Workers, Durable Objects, D1, KV, Queues, R2, Cron Triggers, and real-time edge apps. Using Node.js (TypeScript preferred) with npm and Wrangler, design and implement a production‑ready prototype of a social platform that contains a dedicated RPG game section. The platform must be hosted entirely on Cloudflare (no third‑party hosting). Deliver secure, scalable code and thorough documentation.

Primary Goal & Architecture Build a comprehensive social platform where users can engage in typical social activities (profiles, posts, messaging, friends, groups) AND access a dedicated RPG game section within the same platform. Think of the architecture like Reddit with subreddits - the main platform handles all social functionality, while the RPG game exists as a separate, self-contained section that users can access.

Key Architectural Principles:

Main Social Platform: Handles user accounts, profiles, messaging, posts, feeds, friends, groups, and all social interactions
RPG Game Section: A distinct area within the platform (like a subreddit) containing all game mechanics, battles, character management, and game-specific features
Automatic Character Creation: Every user who registers on the social platform automatically receives an RPG character for use in the game section
Clear Separation: Social features remain completely separate from game mechanics - no RPG elements bleed into posts, messaging, or general social interactions
Unified User Experience: Single login, unified navigation, but distinct functional areas

Must‑Use Platform/Stack

Hosting: Cloudflare Workers (APIs), Cloudflare Pages (frontend) or SPA served by Workers
Routing/Frameworks: Hono or itty-router for Workers APIs; WebSocket support for real-time via Durable Objects
State/Data:
D1 (primary relational DB)
Durable Objects (real-time battle rooms, presence, atomic counters)
KV (caching, lightweight settings)
Queues (background jobs for XP, notifications)
Cron Triggers (offline XP accrual ticks)
R2 (optional: user avatar/media uploads)
Auth: Email/password + OAuth (Google and Discord) implemented on Workers; sessions via HttpOnly cookies + JWT/DO session store
Security: Cloudflare Turnstile for bot protection, rate limiting, input validation
Tooling: Wrangler for local/dev/prod, Node.js/npm, TypeScript, Zod for schema validation

Core Social Platform Features (MVP)

Accounts/Auth: email/password and OAuth (Google, Discord). Password reset flow. Email verification (stub is fine if email service not available)
Profiles: username, avatar, bio, join date, basic social stats (posts, friends count)
Friends: requests, accept/decline, list, unfriend
Direct Messages: simple 1:1 messaging (persistent threads in D1)
Posts/Feed: full CRUD for text posts; user timeline + global feed
Groups: create/join/leave; group posts and discussions
Notifications: in‑app notifications for friend requests, messages, mentions, group activity
Search: find users, posts, groups

RPG Game Section - Dedicated Game Area The RPG game exists as a completely separate section within the platform. Users access it through dedicated game navigation/pages. All game mechanics, character management, battles, and RPG-specific features are contained within this section.

RPG Game Mechanics (Must Implement) Classes and Base Stats at Level 1 (HP/ATK/DEF/MP/SPD):

Phoenix Rider (attack‑based): 10,000 HP, 1000 ATK, 500 DEF, 175 MP, 100 SPD
dPhoenix Rider (dark, attack‑based): 10,000 HP, 1750 ATK, 375 DEF, 150 MP, 150 SPD
Dragon Rider (defense‑based): 10,000 HP, 750 ATK, 1100 DEF, 100 MP, 175 SPD
dDragon Rider (dark, defense‑based): 10,000 HP, 1000 ATK, 1000 DEF, 200 MP, 75 SPD
Kies Warrior (balanced, neutral): 15,000 HP, 750 ATK, 750 DEF, 225 MP, 150 SPD

Stats tracked per character (within game section only):

Battle stats: HP, ATK, DEF, MP, SPD, Level, XP, unspent_stat_points
Trophy stats: wins, losses, kills, deaths

Leveling:

+5 stat points per level
Every 5th level grants +5 extra (i.e., total +10 on levels 5, 10, 15, ...)

Experience:

Time‑based offline XP accrual (cron‑driven). Define reasonable defaults (e.g., 10 XP/hour) and a daily cap (configurable). Store accrual in an offline_xp_ledger to prevent double counting
XP awarded per successful "win" during battles (configurable)

Battle System (Game Section Only):

Turn‑based battle engine usable in two modes:
Real‑time duels: WebSocket via Durable Object "BattleRoom"
Asynchronous attacks: create a battle challenge; attacker submits turns; defender can respond later or allow AI/simple resolve after timeout
Outcomes & definitions:
Death: HP reduced to 0
Kill: attacker reduces opponent HP to 0
Win: each successful damaging hit counts as a win for the hitter and a loss for the target
Loss: failed attack counts as loss for the attacker and win for the defender
Class orientations:
Phoenix classes: attack‑weighted balance
Dragon classes: defense‑weighted balance
Kies: balanced

First Game Section Access Flow:

When a user first accesses the RPG game section: prompt to set gamertag (separate from social username), choose class, and allocate initial stat points (if any beyond base). Persist choices. Enforce unique gamertag within game section

Battle Resolution (Reference Algorithm) Implement a clear, deterministic turn loop. Use SPD for turn order. A simple baseline you can implement and tune later:

Initiative: higher SPD goes first; tie‑break by random seed stored in battle record
For each attack attempt by attacker A on defender D:
Compute effective attack power A_eff = ATK_A * class_attack_mod(A.class)
Compute effective defense power D_eff = DEF_D * class_defense_mod(D.class)
Damage = max(0, round(A_eff – D_eff * mitigation_factor))
If Damage > 0:
D.HP -= Damage
Trophy update: A.wins += 1; D.losses += 1
If D.HP <= 0: A.kills += 1; D.deaths += 1; battle ends
Else (no damage penetrated):
Trophy update: A.losses += 1; D.wins += 1
Consider small random jitter (+/‑ up to 5%) to reduce ties (store seed per battle)
Class modifiers (baseline; make configurable):
Phoenix/dPhoenix: class_attack_mod = 1.1; class_defense_mod = 0.95
Dragon/dDragon: class_attack_mod = 0.95; class_defense_mod = 1.1
Kies: both mods = 1.0
MP: reserve for future skills; track but not consumed yet (P0)

Real‑time Battles with Durable Objects (Game Section)

DO: BattleRoom
Holds canonical battle state (players, stats, HP, turn, seed)
Accepts WebSocket connections from both participants
Validates turns, applies resolution, broadcasts state diffs to clients
On completion, persists summary + per‑turn log to D1; updates trophy stats and XP
DO: GamePresenceRoom (optional)
Tracks online presence of users in game section; rate limits battle invites

Asynchronous Battles (Game Section)

API to create a challenge and submit attacker's turn set
Defender can respond later; auto‑resolve after timeout with simple defense turn if not responded
Ensure all step results are idempotent and signed to prevent tampering

Data Model (D1) Provide DDL to create these tables with indexes and foreign keys:

Social Platform Tables:

users (id, email, email_verified, password_hash, username unique, avatar_url, bio, created_at)
oauth_accounts (id, user_id, provider, provider_account_id, access_token_hash, refresh_token_hash, expires_at)
sessions (id, user_id, token_hash, created_at, expires_at)
friends (id, requester_id, addressee_id, status ENUM[pending, accepted, blocked], created_at)
messages (id, sender_id, recipient_id, body, created_at, read_at)
posts (id, author_id, body, created_at, updated_at)
groups (id, name unique, owner_id, description, created_at)
group_members (group_id, user_id, role, joined_at)
notifications (id, user_id, type, payload_json, created_at, read_at)

Game Section Tables:

characters (id, user_id FK unique, gamertag unique, class ENUM[phoenix, dphoenix, dragon, ddragon, kies], level, xp, hp, atk, def, mp, spd, unspent_stat_points, first_game_access_completed BOOLEAN, created_at, updated_at)
trophies (character_id PK/FK, wins, losses, kills, deaths)
battles (id, attacker_char_id, defender_char_id, mode ENUM[realtime, async], state ENUM[pending, active, completed, canceled], seed, started_at, ended_at, winner_char_id NULLABLE)
battle_turns (id, battle_id, turn_index, actor_char_id, action_type, damage, hp_after_actor, hp_after_target, created_at)
offline_xp_ledger (id, character_id, from_ts, to_ts, xp_awarded, created_at)
leaderboard_snapshots (id, period ENUM[daily, weekly, alltime], created_at)
leaderboard_entries (snapshot_id, character_id, rank, metric, value)

APIs (Workers, Hono/itty-router)

Social Platform APIs:

Auth: POST /auth/register, POST /auth/login, POST /auth/logout, GET /auth/session
OAuth: GET /auth/:provider/start, GET /auth/:provider/callback
Profile: GET/PUT /me/profile, GET /users/:id/profile
Friends: POST /friends/request, POST /friends/respond, GET /friends, DELETE /friends/:id
Messages: GET /messages/:userId, POST /messages/:userId, GET /messages/threads
Posts: GET /feed, POST /posts, GET /posts/:id, PUT /posts/:id, DELETE /posts/:id
Groups: POST /groups, POST /groups/:id/join, GET /groups/:id, GET /groups, DELETE /groups/:id/leave
Search: GET /search/users, GET /search/posts, GET /search/groups
Notifications: GET /notifications, PUT /notifications/:id/read

Game Section APIs:

Game Setup: POST /game/first-access (gamertag, class, initial_allocations)
Character: GET /game/character, POST /game/allocate-points
Battles:
POST /game/battles (create challenge, mode=async|realtime)
POST /game/battles/:id/turn (submit turn)
GET /game/battles/:id (state)
GET /game/battles (list user's battles)
WS /game/battles/:id/stream (real-time via DO)
Leaderboards: GET /game/leaderboard?metric=wins|kills|level
XP: POST /game/claim-offline-xp (if you implement a claim action), GET /game/xp
Game Search: GET /game/players (find opponents)

Background Jobs / Scheduling

Cron Trigger every 15–60 minutes to compute offline XP:
For each character, measure elapsed time since last accrual entry; award XP at rate R until daily cap
Insert into offline_xp_ledger; update characters.xp
Queues for:
Notification fan‑out (both social and game notifications)
Post‑battle processing (XP, trophies, leaderboards)
Social platform background tasks

Frontend (Cloudflare Pages or Worker‑served SPA)

Tech: React + Vite (or Next.js on Pages Functions if you prefer)

Social Platform Pages:

Auth (login/register, OAuth buttons)
Dashboard/Home (social feed, friend activity, notifications)
Profile (own and others' profiles)
Friends (friend list, requests, search users)
Messages (conversation threads, chat interface)
Posts (create, edit, view, social feed)
Groups (browse, create, join, group discussions)
Search (users, posts, groups)

Game Section Pages:

Game Dashboard (character overview, quick battle options)
First Game Access Wizard (gamertag, class selection, stat allocation)
Character Management (stats, level up, allocate points)
Battle Arena (find opponents, initiate battles)
Battle Viewer (real-time and async battle interfaces)
Leaderboards (various metrics and rankings)
Game Profile (view other players' game stats and history)

Navigation:

Clear separation between social platform navigation and game section navigation
Game section accessible via dedicated menu item/section in main navigation
Unified user session across both areas

Security & Integrity

Turnstile on auth and sensitive actions
Rate limiting per-IP and per-user for posts, messages, battle creation
Input validation with Zod; strict JSON schema
Server‑authoritative battle state; clients cannot apply damage locally
Store and reuse deterministic seed per battle; sign turn submissions with session
Audit logs for admin review of suspicious behavior

Moderation & UX Safeguards

Block/mute users (affects both social and game interactions)
Report user/post/battle abuse (stub is fine)
Optional profanity filter on posts/messages/gamertags

Config & Deployment

wrangler.toml with:
d1_databases: main
durable_objects: BattleRoom, GamePresenceRoom
kv_namespaces: app_config, cache
queues: jobs
r2_buckets: media (optional)
vars: XP_RATE_PER_HOUR, DAILY_XP_CAP, WIN_XP_AWARD, CLASS_MODS, MITIGATION_FACTOR, etc.
Scripts for DB migrations/seeding (SQL files + wrangler d1 migrations)
Local dev: wrangler dev for API + vite dev for frontend

Acceptance Criteria

Social Platform:

User can register/login (email/pass) and OAuth with Google/Discord
Users can create profiles, add friends, send messages, create and interact with posts
Groups can be created, joined, and used for discussions
Search functionality works for users, posts, and groups
Notifications system works for social interactions

Game Section:

First game access flow enforces unique gamertag, class selection, initial stat allocation
Character created automatically for each user account, stats reflect class base values
Users can search for opponents within game section and view game profiles
User can initiate both real‑time and asynchronous battles; turns resolve deterministically; wins/losses/kills/deaths update correctly per definitions
Offline XP accrues over time via Cron; wins grant XP; leveling increases unspent stat points with +5 each level and +10 on multiples of 5; allocation persists
Leaderboard pages render by metric; game notifications show battle results

Integration:

Single user account works across both social platform and game section
Clear navigation between social features and game section
Unified notification system handles both social and game notifications

Deliverables

Monorepo or organized folders (api/, web/, shared/)
Fully working Workers API with Durable Objects, D1 schema/migrations, Queues and Cron configured
Frontend app deployed to Pages or served by Worker with clear separation between social and game UIs
Seed scripts: create sample users, social content, characters, battles
README with local dev setup, environment config, and deployment steps

Battle Resolution Pseudocode function resolveTurn(attacker, defender, seed) { const aAtk = attacker.atk * classAttackMod(attacker.class) const dDef = defender.def * classDefenseMod(defender.class) const jitter = randomFromSeed(seed, -0.05, 0.05) const mitigation = env.MITIGATION_FACTOR || 1.0 let damage = Math.round((aAtk - dDef * mitigation) * (1 + jitter)) if (damage < 0) damage = 0 if (damage > 0) { defender.hp -= damage attacker.trophies.wins += 1 defender.trophies.losses += 1 if (defender.hp <= 0) { attacker.trophies.kills += 1 defender.trophies.deaths += 1 return { damage, killed: true } } return { damage, killed: false } } else { attacker.trophies.losses += 1 defender.trophies.wins += 1 return { damage: 0, killed: false } } }

Notes & Constraints from Product Owner

Social platform and game section must be clearly separated architecturally
Both real-time and async battles MUST exist within game section
Definitions are strict:
Win = any successful damaging hit by the hitter in a turn
Loss = a failed attack (no damage) or being successfully damaged in a turn
Kill/Death = HP reaches 0 from an opponent's action
All dragon classes are defense‑based; all phoenix classes attack‑based; Kies balanced
Offline XP is time‑based and XP is also earned for each win
Game mechanics should not interfere with social platform functionality

What to Produce Now

Full codebase outline with clear separation between social and game modules
wrangler.toml and bindings definitions
SQL DDL for D1 with separate table groups for social vs game features
Durable Object class skeletons (BattleRoom, GamePresenceRoom)
API route handlers with input validation for both social and game endpoints
Battle engine module with deterministic RNG interface (game section only)
Cron worker for offline XP accrual (game section only)
Queue consumers for post‑battle tasks/notifications and social notifications
Frontend screens and components for both social platform and game section
README with setup and deployment steps

Stretch (Optional)

Simple E2E tests (playwright/miniflare)
Admin panel for moderation of both social and game content
R2 uploads for avatars (usable in both social profiles and game characters)
Push notifications via Web Push (where supported)
Cross-platform features (e.g., mention game achievements in social posts, but keep mechanics separate)

Important: Keep configuration values and class modifiers easily tunable via environment vars or KV so balancing can be adjusted later without code changes. Maintain strict separation between social platform logic and game section logic throughout the codebase.
