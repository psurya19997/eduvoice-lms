# EduVoice Games — Pedagogical Theory Foundation

This document names the seven theories from second-language acquisition (SLA) research that every game in EduVoice must be traceable back to. Any game or level that cannot be justified by at least one of these should be rejected.

The purpose of writing this down is discipline: it prevents "fun" games that don't teach, and gives a shared vocabulary for critique. Anyone on the team should be able to look at a game design and ask: *"Which pillar does this serve, and how?"*

---

## Pillar 1 — Comprehensible Input at ZPD

*Krashen (1985) + Vygotsky (1978), operationalized with CEFR (2001, 2020).*

**The idea.** Learners acquire language when they understand messages containing structures **just slightly above** their current competence — Krashen calls this `i+1`. Vygotsky's Zone of Proximal Development (ZPD) says the same thing from another angle: learning happens in the gap between what a learner can do alone and what they can do with support. CEFR (A1–C2) provides the operational leveling scale.

Input at `i` (too easy) produces no growth; input at `i+2` (too hard) is filtered out. The window is narrow, personal, and dynamic.

**Sources.** Krashen, S. (1985) *The Input Hypothesis: Issues and Implications*; Vygotsky, L. (1978) *Mind in Society*; Council of Europe (2001, 2020) *Common European Framework of Reference for Languages*.

**What it means for our games.**
- Content is CEFR-tagged (A1, A2, B1, B2), not class-tagged.
- Level (Alpha/Beta/Gamma) selects the CEFR band; step within a level ramps difficulty inside that band.
- Adaptive scaffolding: struggling below 50% for 3 steps triggers a "try easier" prompt; over 85% for 3 steps triggers a "skip ahead" offer.

**Anti-patterns.** Fixed difficulty per age. No adaptation to individual mastery. Random content selection with no `i+1` signal.

---

## Pillar 2 — Pushed Output

*Swain (1985, 2005).*

**The idea.** Comprehensible input alone is not enough. **Producing** language forces three things input cannot:

1. **Noticing** — the gap between what learners want to say and what they can say becomes visible.
2. **Hypothesis testing** — learners try constructions and see if they work.
3. **Metalinguistic reflection** — learners think about form itself.

Output pushes learners from *semantic* processing ("I get the gist") to *syntactic* processing ("I have to build the sentence"). Recognition (MCQ, matching) is scaffolding; production (speaking, writing) is where acquisition actually happens.

**Sources.** Swain, M. (1985) *Communicative competence: Some roles of comprehensible input and comprehensible output in its development*; Swain, M. (2005) *The output hypothesis: Theory and research*.

**What it means for our games.**
- Voice games (student actually speaks) are the pedagogically highest-value class of games.
- Every voice game must show the transcript back — the mismatch between intended and actual is where noticing happens.
- Alpha steps 5–10 introduce production; Beta and Gamma are mostly production.
- Recognition-only performance cannot unlock past Alpha step 6.

**Anti-patterns.** 90%-MCQ apps calling themselves learning apps. Voice games that don't show transcripts. Feedback that says *wrong* but not *what* was wrong.

---

## Pillar 3 — Interaction / Negotiation of Meaning

*Long (1996).*

**The idea.** Acquisition is accelerated by **interactional adjustments** during conversation — clarification requests, comprehension checks, confirmation checks, and **recasts**. Interaction supplies both comprehensible input *and* opportunities for pushed output in a single loop.

A recast is an implicit correction embedded in continued conversation:

> Child: *"I go market."*  
> App: *"You **went** to the market? What did you buy?"*

The correction is present but never framed as a red mark. Kids don't shut down.

**Sources.** Long, M. (1996) *The role of the linguistic environment in second language acquisition*; Long, M. (2015) *Second Language Acquisition and Task-Based Language Teaching*.

**What it means for our games.**
- Feedback style: **recasts** over red marks. "You said X — try 'Y'" always beats "Wrong."
- Talk Back and Say It Right are the natural venues; Sentence Builder can recast at higher levels.
- Cross-game unlock rules force interaction across skills — a learner cannot grind one game alone, they must engage across the system.

**Anti-patterns.** All feedback in binary right/wrong marks. Games that are one-way monologues with no exchange.

---

## Pillar 4 — Distributed Practice with Spaced Retrieval

*Ebbinghaus (1885) → Leitner (1972) → Wozniak SM-2 (1985) → Nation (2013).*

**The idea.** Memory decays predictably along Ebbinghaus's **forgetting curve** — most newly learned material is forgotten within days without review. But **retrieval at expanding intervals** (1d → 3d → 7d → 21d → 60d) flattens the curve dramatically. The *effort* of retrieval itself strengthens the memory trace.

Distributed practice massively outperforms massed practice for retention, even at equal total study time.

**Sources.** Ebbinghaus, H. (1885) *Über das Gedächtnis*; Leitner, S. (1972) *So lernt man lernen*; Wozniak, P. (1985/1990) *SuperMemo SM-2 algorithm*; Nation, I.S.P. (2013) *Learning Vocabulary in Another Language*.

**What it means for our games.**
- Every word a student encounters is logged in per-student vocabulary state with SM-2 review scheduling.
- Words re-appear across games at expanding intervals — a word from Story Listen today may show in Word Family in 3 days and Sentence Builder in 7.
- Level unlocks require practice **spread across ≥ 3 different days** (Beta) or ≥ 5 (Gamma). Cannot cram in one day.

**Anti-patterns.** Vocabulary games with no per-student memory. "Learned once = mastered" — no scheduled review.

---

## Pillar 5 — L1 Translanguaging (Cummins Interdependence)

*Cummins (1979, 2007).*

**The idea.** Cognitive concepts a learner has in their first language (L1) transfer directly to their second language (L2) when appropriately scaffolded. A child who knows what a *dog* is in Hindi does not need to relearn the *concept* in English — they need only the *label*. Deliberate use of L1 as a bridge accelerates L2 acquisition, especially at A1–A2 levels.

For Indian K-12 learners bridging regional mother tongues (Hindi, Marathi, Tamil, Bengali, Telugu, …) into school-medium English, ignoring L1 is pedagogically wasteful. Support fades as competence grows.

**Sources.** Cummins, J. (1979) *Linguistic interdependence and the educational development of bilingual children*; Cummins, J. (2007) *Rethinking monolingual instructional strategies in multilingual classrooms*.

**What it means for our games.**
- L1 hints available **on demand** (tap a word) for Alpha-level content — meanings, instructions.
- L1 scaffolding auto-fades: heavy at Alpha, occasional at Beta, absent at Gamma.
- Long term: multiple L1s supported (start with Hindi; add regional languages).

**Anti-patterns.** English-only immersion at A1 for L1-Devanagari learners (unnecessarily punishing). Permanent L1 crutch that never fades — kids never grow into English-only thinking.

---

## Pillar 6 — Dual Coding

*Paivio (1971, 1986).*

**The idea.** Verbal (linguistic) and non-verbal (visual, spatial, auditory) representations are processed in **separate cognitive channels**. Presenting information in **both channels simultaneously** roughly doubles retention compared to either channel alone. The visual becomes a retrieval cue for the verbal, and vice versa.

For vocabulary specifically, pairing a word with an image *and* its spoken form creates a triple-encoded memory trace that is dramatically more durable than the word alone.

**Sources.** Paivio, A. (1971) *Imagery and Verbal Processes*; Paivio, A. (1986) *Mental Representations: A Dual Coding Approach*.

**What it means for our games.**
- Every new vocabulary item at Alpha presents: **written word + image + spoken audio** simultaneously.
- Images fade at Beta (occasional support), absent at Gamma (text-only for advanced learners).
- Interactive/gesture-linked animations (drag, tap, arrange) engage the motor channel — a third memory hook.

**Anti-patterns.** Text-only vocabulary presentation at A1. Decorative images that don't reinforce the target word.

---

## Pillar 7 — Affective Filter + Self-Determination (motivation & affect)

*Krashen (1982) Affective Filter Hypothesis + Deci & Ryan (1985, 2000) Self-Determination Theory.*

**The idea.** Two closely-related affect theories combined:

1. **Krashen's Affective Filter** — anxiety, low motivation, or low self-confidence create a "filter" that prevents comprehensible input from becoming *intake* (usable acquisition). Even perfect input is blocked if the learner is anxious.
2. **Self-Determination Theory (SDT)** — intrinsic motivation requires three psychological needs: **autonomy** (choice), **competence** (feeling capable), and **relatedness** (connection). Miss any, motivation collapses.

For young learners, these are not "nice to have" — they are prerequisites for acquisition. An anxious, controlled, or isolated child does not learn language regardless of how good the input is.

**Sources.** Krashen, S. (1982) *Principles and Practice in Second Language Acquisition* (Affective Filter is one of Krashen's five hypotheses); Deci, E. & Ryan, R. (1985) *Intrinsic Motivation and Self-Determination in Human Behavior*; Ryan, R. & Deci, E. (2000) *Self-determination theory and the facilitation of intrinsic motivation, social development, and well-being*.

**What it means for our games.**
- **Autonomy** — Free Play always accessible alongside Today's Quest. Level and step choice is theirs.
- **Competence** — Alpha steps 1–4 are free for all games; near-guaranteed early wins.
- **Relatedness** — encouraging avatar/mascot copy; the app talks *to* the child, not *at* them.
- Zero-penalty exploration in early steps; *"let's try again"* > *"wrong."*
- Streaks are lenient (1 freeze per week auto-applied); missing a day is not catastrophic.

**Anti-patterns.** Red X marks and score penalties for wrong answers. Locked doors with no visible path. Punishing streak breaks that reset to zero.

---

## Implementation notes (not theories)

### Systematic phonics for L1-Devanagari (and other shallow-orthography) learners

Phonics — systematic teaching of English grapheme-to-phoneme correspondences — is a **technique, not an acquisition theory**. It exists to solve a specific problem: English orthography is *opaque* (~44 phonemes to 26 letters, hundreds of exceptions), and learners whose L1 uses a *shallow orthography* like Devanagari (near-1:1 grapheme-to-phoneme) have decoding intuitions that actively mislead them in English.

For Indian K-12 learners specifically this manifests as: expecting "c" in "cat" and "cent" to make the same sound; difficulty with silent letters (*knife, gnat, write*); difficulty with variable digraphs (*ough, ea*).

Phonics belongs in the app as an implementation feature inside **Read Aloud** and **Say It Right**, framed explicitly as *"English is different from Hindi — the same letters can make different sounds."* It is not a tracked skill and not a theory pillar. It serves Pillar 1 (i+1 for decoding), Pillar 6 (dual-coding grapheme + phoneme), and Pillar 4 (spaced retrieval of grapheme-phoneme correspondences).

### Skill Acquisition Theory (DeKeyser 2007) — the practice justification

DeKeyser's Skill Acquisition Theory explains how **declarative knowledge** ("I know the rule") becomes **procedural knowledge** ("I use it automatically") through repeated practice. Automatization requires many repetitions and a smooth decline in reaction time and error rate.

This is the **methodological justification for our level/step structure**:
- Every level has 10 steps, not 3 — automatization needs volume.
- Step-by-step difficulty ramps gradually within a level, not by huge jumps.
- Mastery is measured across the last 5 steps, not one lucky attempt.

Skill Acquisition Theory sits *under* all 7 pillars — it justifies the shape of practice, not any specific acquisition mechanism.

---

## How the seven pillars fit together

They compose into a system, not a list:

- **Pillars 1 (i+1) and 7 (Affect)** are **universal** — they touch every game, every step, every child.
- **Pillars 5 (L1) and 6 (Dual Coding)** are **input augmentors** — they make input more comprehensible, most heavily at A1–A2.
- **Pillars 2 (Output) and 3 (Interaction)** are **production drivers** — they push the learner from consumer to creator.
- **Pillar 4 (Spaced Retrieval)** is the **retention engine** — it schedules content across time so acquisition sticks.

Every game we design is evaluated against all seven. When we argue about a design choice, this document is what we come back to.
