# EduVoice Games — Taxonomy & Terminology

## The hierarchy

Game  ▶  Level  ▶  Step  ▶  Session

| Term | Value | Behavior |
|---|---|---|
| Game | 1 of 8 | The activity type |
| Level | Alpha / Beta / Gamma (3) | Big jump — new CEFR band |
| Step | 1 to 10 within a level | Slow ramp — same level, gradually harder |
| Session | Multiple per step | Same difficulty, different content |

## The 8 games

| Game | Trains |
|---|---|
| Word Family | Vocabulary networks (semantic + phonological grouping) |
| Say It Right | Pronunciation (word / phrase repetition) |
| Read Aloud | Reading + pronunciation fluency (passages) |
| Sentence Builder | Grammar (arrange word tiles) |
| Story Listen | Listening comprehension (TTS + MCQ) |
| Reading Quest | Reading comprehension (passage + MCQ) |
| Speed Read | Reading fluency under time pressure |
| Talk Back | Spontaneous speaking (open prompts) |

## CEFR levels (external reference standard)

CEFR = Common European Framework of Reference for Languages. Six levels widely used by textbooks, teachers, and tests worldwide:

| Level | Description |
|---|---|
| **A1** | Beginner — basic phrases, everyday nouns |
| **A2** | Elementary — simple sentences, familiar topics |
| **B1** | Intermediate — main ideas of clear input |
| **B2** | Upper intermediate — abstract topics, opinions |
| C1 / C2 | Advanced / near-native — out of scope |

## Mapping our levels to CEFR

| Our level | CEFR | Description |
|---|---|---|
| Alpha | A1 | Foundation |
| Beta | A2 → early B1 | Real challenge |
| Gamma | B1 → B2 | Near-graduation |

## Free content on Day 1

Steps 1-4 of Alpha for every game are unlocked from first login.

## The 7 tracked skills

1. Vocabulary
2. Grammar
3. Pronunciation
4. Listening
5. Reading (includes phonics as an implementation technique, not a separate skill)
6. Speaking
7. Writing

## Skill mapping per game

Every game has a primary skill and optional secondary skills. Weights add to 100%.

| Game | Primary | Secondary |
|---|---|---|
| Word Family | Vocabulary 70% | Reading 30% |
| Say It Right | Pronunciation 70% | Listening 30% |
| Read Aloud | Reading 40% | Pronunciation 30% · Speaking 30% |
| Sentence Builder | Grammar 60% | Writing 25% · Vocabulary 15% |
| Story Listen | Listening 70% | Vocabulary 30% |
| Reading Quest | Reading 70% | Vocabulary 30% |
| Speed Read | Reading 80% | Vocabulary 20% |
| Talk Back | Speaking 70% | Vocabulary 30% |

Coverage: all 7 skills primary-fed by at least one game.

## Content tagging

- Every content item across every game is CEFR-tagged (A1, A2, B1, B2).
- Content is tone-neutral — no baby styling that alienates older learners.

## Scoring definitions

- **Session score** — 0-100, game-specific formula.
- **Step best score** — max score across all sessions at that step.
- **Level avg** — mean of best-of-each-step for the last 5 steps.

## Skill mastery calculation

Every session updates every skill the game trains, using this formula:

```
new_mastery = old_mastery + weight × 0.15 × (session_score − old_mastery)
```

Where:
- `old_mastery` — current skill mastery (0–100)
- `weight` — game's weight for this skill (0–1, from the mapping above)
- `0.15` — global learning rate
- `session_score` — session score (0–100)

### Worked example

Aditya just finished a Word Family session and scored 75.

Word Family weights: Vocabulary 0.7, Reading 0.3.
Current mastery: Vocab = 50, Reading = 40.

**Vocab:** `50 + 0.7 × 0.15 × (75 − 50) = 52.6 → 53`
**Reading:** `40 + 0.3 × 0.15 × (75 − 40) = 41.6 → 42`

A WF session moves Vocab about 2.5× faster than Reading — which reflects WF being primarily a vocabulary game.

### Properties

- Mastery is always bounded 0–100.
- High scores push mastery up, low scores pull it down.
- No single session spikes mastery — small gains per play.
- Over many sessions, mastery converges toward the student's typical performance in games that train that skill.

## Initial state

New player: all 7 skills start at 0. Mastery is built entirely through play.
