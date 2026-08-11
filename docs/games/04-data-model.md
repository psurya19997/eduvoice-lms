# EduVoice Games — Shared Data Model

Universal rules and tables that apply to **every** game in EduVoice. Game-specific tables (Word Family's `word_family_sessions`/`word_family_attempts`, etc.) live in each game's own document.

Read this first, then the game-specific docs. This one defines the machinery; each game plugs into it.

---

## Table overview (7 shared tables)

| # | Table | Role |
|---|---|---|
| 1 | `skills` | Master list of the 7 tracked skills |
| 2 | `levels` | Master list of the 3 levels (alpha / beta / gamma) |
| 3 | `games` | Master list of the 8 games |
| 4 | `game_skill_weights` | Data-driven pedagogy — which skills each (game, level) trains, and how heavily |
| 5 | `game_score` | Session outcome across all games — score + leaderboard points |
| 6 | `student_skill_mastery` | Rolling per-student skill state (mastery %, cumulative counts) |
| 7 | `student_skill_mastery_history` | One row per completed session per skill touched — the audit trail |

Game-specific tables (session content + per-play event log) live in each game's own doc.

---

## PK convention

- All **reference tables** (`skills`, `levels`, `games`) use `uuid id` PK **plus** a separate `text key` column (UNIQUE), e.g. `games.key = 'word_family'`.
- All **FKs** referencing reference tables use uuid (`skill_id`, `level_id`, `game_id`).
- The `key` column exists for human-readable seeding and lookups; the `id` is what everything else references.

---

## 1. `skills`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `key` | text UNIQUE | `vocabulary` / `grammar` / `pronunciation` / `listening` / `reading` / `speaking` / `writing` |
| `display_name` | text | |
| `sort_order` | int | Consistent display order (radar, tables) |
| `is_active` | bool | default `true` |

**Rows:** exactly 7 (seeded once). Adding an 8th skill = INSERT one row + weight rows in `game_skill_weights`.

---

## 2. `levels`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `key` | text UNIQUE | `alpha` / `beta` / `gamma` |
| `display_name` | text | |
| `cefr_level` | text | `A1` / `A2` / `B1` |
| `ordinal` | int | 1, 2, 3 (progression order) |
| `is_active` | bool | default `true` |

**Rows:** exactly 3. Adding a level (e.g. `delta` for B2+) = INSERT one row + mappings.

---

## 3. `games`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `key` | text UNIQUE | `word_family` / `sentence_builder` / `read_aloud` / etc. |
| `display_name` | text | |
| `icon` | text | Emoji or asset key |
| `sort_order` | int | |
| `is_active` | bool | Games not yet shipped stay `false` — Game Zone hides them |

**Rows:** 8 (all 8 games seeded; only shipped ones have `is_active = true`).

---

## 4. `game_skill_weights` (the pedagogy, encoded as data)

| Column | Type | Notes |
|---|---|---|
| `game_id` | uuid FK games.id | Part of PK |
| `level_id` | uuid FK levels.id | Part of PK |
| `skill_id` | uuid FK skills.id | Part of PK |
| `weight` | numeric(3,2) | 0.00 – 1.00 |

**PK:** `(game_id, level_id, skill_id)`.

**Rule:** weights per `(game_id, level_id)` sum to `1.00`. Enforced at seed time.

**Example rows** (Word Family):
```
game=word_family  level=alpha  skill=vocabulary  weight=0.70
game=word_family  level=alpha  skill=reading     weight=0.30
game=word_family  level=beta   skill=vocabulary  weight=0.75
game=word_family  level=beta   skill=reading     weight=0.25
game=word_family  level=gamma  skill=vocabulary  weight=0.60
game=word_family  level=gamma  skill=reading     weight=0.40
```

Weights vary per `(game, level)` — a game's skill distribution can shift as difficulty rises.

---

## 5. `game_score` (shared outcome across all games)

Written when a session ends with `attempt_status` in (`completed`, `timeout`). **Never** for `aborted`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid FK profiles.id | |
| `game_id` | uuid FK games.id | |
| `attempt_id` | uuid | Loose FK to `word_family_attempts` / `sb_attempts` / `ra_attempts` (interpret via `game_id`) |
| `score` | int | 0-100. Quality signal. **Formula defined per game** — see the game's doc |
| `points` | int | 3 or 5. Added to weekly/monthly leaderboard totals |
| `played_at` | timestamptz | default `now()` |

**`score` semantics:** a 0-100 quality signal specific to the game. Word Family uses net accuracy. Sentence Builder and Read Aloud will define their own formulas.

**`points` semantics:** universal across all games (see Points rule below).

**Note on removed columns:**
- `school_id` — derivable via `JOIN profiles`. Not stored here.
- `level_id`, `step` — derivable via `attempt_id → *_sessions`. Not stored here.
- `is_correct` — belongs on the attempt row (event data), not the score row.

---

## 6. `student_skill_mastery` (rolling per-student state)

| Column | Type | Notes |
|---|---|---|
| `student_id` | uuid FK profiles.id | Part of PK |
| `skill_id` | uuid FK skills.id | Part of PK |
| `mastery_pct` | int | 0-100. EWMA-rolling. Only grows (see rule below) |
| `correct_count` | int | Cumulative correct atoms (primary skill only) |
| `attempt_count` | int | Sessions that touched this skill (primary + secondary) |
| `last_updated` | timestamptz | default `now()` |

**PK:** `(student_id, skill_id)`. At most 7 rows per student.

---

## 7. `student_skill_mastery_history` (audit trail)

One row per completed session per skill touched.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `student_id` | uuid FK profiles.id | |
| `skill_id` | uuid FK skills.id | |
| `old_value` | int | mastery_pct before this update |
| `new_value` | int | mastery_pct after this update |
| `delta` | int | new_value − old_value |
| `attempt_id` | uuid | Which session triggered the update |
| `game_id` | uuid FK games.id | Which game the attempt was in |
| `triggered_by` | text | `correct_pick` / `session_completion` / `admin_reset` |
| `created_at` | timestamptz | default `now()` |

**Growth:** ~1-3 rows per completed session (primary + secondary skills touched). Manageable.

---

## Attempt status rules (universal)

Every game defines `attempt_status` in its per-game attempts table with one of three values. What happens downstream:

| `attempt_status` | `game_score` row created? | `points` awarded | `student_skill_mastery` updated? | `..._history` row? |
|---|---|---|---|---|
| **`completed`** | ✓ | 5 if `is_correct = true`, else 3 | ✓ | ✓ |
| **`timeout`** | ✓ | 3 (regardless of `is_correct`) | ✗ | ✗ |
| **`aborted`** | ✗ | — | ✗ | ✗ |

**Notes:**
- The per-game `*_attempts` row is **always** written, regardless of status — for engagement analytics.
- `timeout` awards attempt points but no learning credit (kid ran out of time; didn't demonstrate mastery).
- `aborted` is a no-op for score and mastery. The `word_family_attempts` row still records what was picked before quit.

---

## Points rule (universal)

`points` are added to the weekly/monthly leaderboard totals.

- `points = 3` — session was attempted and finished (completion or timeout).
- `points = 5` — session was completed AND `is_correct = true` (the +2 is the correctness bonus).

**Applies to every game.** The threshold for `is_correct` is game-specific (see per-game docs).

---

## Score column semantics (universal)

`game_score.score` is a **0-100 quality signal** for the session. Each game defines its own formula. Examples of what score means per game:

| Game | Score formula reference |
|---|---|
| Word Family | Net accuracy — see `05-word-family.md` |
| Sentence Builder | TBD when designed |
| Read Aloud | TBD when designed |

`score` feeds analytics and (indirectly, via `is_correct`) leaderboard points. **Mastery is NOT computed from score** — mastery uses the per-atom EWMA below.

---

## Skill mastery formula (universal EWMA)

Applied **once per correct atomic action** within a completed session, for each skill the game trains.

```
new_mastery = old_mastery + weight × 0.15 × (100 − old_mastery)
```

Where:
- `old_mastery` — current `student_skill_mastery.mastery_pct`
- `weight` — from `game_skill_weights` for the (game, level, skill)
- `0.15` — global learning-rate constant α (tunable after real data)
- `100` — because a correct atom is a full-signal event

**Rules:**
- **Wrong atoms are skipped** — no downward pull. Mastery only grows.
- **Sequential application** — each atom's `new_mastery` becomes the next atom's `old_mastery` within the same session.
- **Only completed sessions** — timeout and aborted sessions do not update mastery.

**Worked example** — Aditya's Vocabulary is 50; WF Vocabulary weight is 0.70; he gets 3 correct picks in a session:

| Pick | Formula | New mastery |
|---|---|---|
| 1 ✓ | `50 + 0.70 × 0.15 × (100 − 50)` | 55.25 |
| 2 ✓ | `55.25 + 0.70 × 0.15 × (100 − 55.25)` | 59.95 |
| 3 ✓ | `59.95 + 0.70 × 0.15 × (100 − 59.95)` | 64.15 |

Final Vocabulary: **50 → 64**.

---

## `correct_count` rule

Incremented on the game's **primary skill only**, by the game's per-attempt "correct atom count":

```
UPDATE student_skill_mastery
SET correct_count = correct_count + <game's correct-atom count>
WHERE student_id = <student> AND skill_id = <game's primary skill>
```

Source column per game:

| Game | Source column | Primary skill |
|---|---|---|
| Word Family | `word_family_attempts.correct_picks_count` | Vocabulary |
| Sentence Builder | `sb_attempts.correct_placements_count` (TBD) | Grammar (planned) |
| Read Aloud | `ra_attempts.correct_words_count` (TBD) | Reading (planned) |

Secondary skills do NOT get `correct_count` increments.

---

## `attempt_count` rule

Incremented on **every skill the game trains** (primary + all secondary), by `+1` per completed session.

If Aditya plays one WF session:
- `Vocabulary.attempt_count += 1`
- `Reading.attempt_count += 1`

Timeout and aborted sessions do NOT increment `attempt_count`.

---

## `student_skill_mastery_history` write rule

One row per **completed** session per skill touched.

For a WF session (which trains Vocabulary + Reading), a single completed play writes:
- 1 row for Vocabulary (`old_value`, `new_value`, `delta`, `attempt_id`, `game_id`, `triggered_by = 'session_completion'`)
- 1 row for Reading

**Not written** for timeout or aborted sessions.

**Use cases enabled:**
- Kid dashboard: "You grew Vocabulary +14 over the last 5 sessions."
- Teacher analytics: "Aditya hasn't touched Grammar in 2 weeks."
- Debug: "Why is my mastery 62? Show me every change and its source."
- Chart: line graph of any skill over time.

---

## Reference table row counts

| Table | Row count | Notes |
|---|---|---|
| `skills` | 7 | Fixed unless we add a new skill (data-driven) |
| `levels` | 3 | Fixed unless we add a new level |
| `games` | 8 | All 8 seeded; `is_active` toggles visibility |
| `game_skill_weights` | ~72 max | 8 games × 3 levels × ~3 skills-per-game |

---

## Content architecture note

**Game content** (session data — words, sentences, passages) lives in DB tables that vary per game (`word_family_sessions`, `sb_sessions`, `ra_sessions`, etc.). See each game's doc.

**Reference and mapping data** (`skills`, `levels`, `games`, `game_skill_weights`) is seeded from JSON files in `supabase/seed/reference/` via a script. Same script pattern seeds game content.

**Web now, native later.** Same DB serves React (web today) and React Native (planned). Thin clients fetch via `@supabase/supabase-js`. No pipeline rework when going native.

---

## Cross-references

- Word Family game details → `05-word-family.md`
- Sentence Builder game details → (TBD)
- Read Aloud game details → (TBD)
- Theory pillars → `01-theory.md`
- Taxonomy (games, levels, skills naming) → `02-taxonomy.md`
- Product decisions (hub, quest, streak) → `03-product-decisions.md`
