# Coffee Passport
### What. Why. Who for. How it works. Where it goes.

*Canonical product artifact — the single source of truth for what Coffee Passport is, grounded in the actual implemented system, not a roadmap dressed up as a product.*

---

## How to read this document

Every claim below is tagged by one of four labels:

- **IMPLEMENTED NOW** — exists in the codebase today, verified against actual components, stores, API routes, and Supabase migrations at the time of writing.
- **PRODUCT PRINCIPLE** — a foundational idea the product is built on, expressed in copy, structure, or architecture, not a single feature.
- **PLANNED / FUTURE** — a real, considered direction the product could take, not yet built.
- **NOT PART OF PRODUCT** — something Coffee Passport deliberately is not.

Where an older internal document and the current code disagree, the code wins, and the disagreement is called out rather than silently resolved.

---

## 1. What Coffee Passport Is

Coffee Passport is a digital system that follows a single coffee — a specific roasted lot, from a specific farm, roasted a specific way — out of the roastery and into the real world, and records what actually happens to it there: who drank it, where, how it was prepared, and what they genuinely tasted.

A QR code on the bag or on the café's table is the entry point, not the product. Scanning it does not open a spec sheet. It opens a loop: the guest tastes the coffee *before* seeing anything about it, records their own read in their own words, and only then sees what the roaster declared. From that one moment, a lot accumulates a second kind of record alongside its origin data — a living history of how people actually experienced it, cup after cup, café after café.

**Why a QR code with tasting notes isn't enough.** A static product page answers "what is this coffee" once, at the moment of purchase, and then goes stale. It cannot tell you that this same lot tasted noticeably different at a different café, prepared a different way, three weeks later — because it was never built to hold more than one snapshot.

**Why a star rating isn't enough.** A number collapses an entire sensory experience into one axis: good or bad. It answers "did you like it," never "what did you taste," and it certainly never asks whether what you tasted matched what the roaster was trying to show you.

**Why a generic specialty-coffee app isn't enough.** Most existing tools are either roaster-side (professional cupping software, production tracking) or guest-side (rate-this-bag apps), but rarely both — and almost never connected to one specific, traceable batch with a professional reference to compare against. Coffee Passport's premise is that the interesting data lives exactly in that gap: between what a coffee was designed to be and what it actually became, cup by cup, in the real world.

**Who it's for.** Three participants, one shared object — a **Guest** who tastes the coffee, a **Café** that serves it, and a **Roaster** who made it. Each gets a different view of the same underlying record. *(Full breakdown in §7.)*

---

## 2. The Pain It Solves

### For the Guest

Right now, without Coffee Passport, a specialty coffee experience is disposable. Someone tries a striking cup, notices something specific — maybe a burst of red berry, maybe an unusually clean, tea-like body — and by the following week can't reliably name what it was, where it was from, or whether the coffee they're trying now is anything like it.

The underlying complaint is simple: **"I drank this coffee, felt something specific about it, and have no way to keep or compare that experience."** No record, no comparison point, no way to notice "I keep gravitating toward washed Ethiopians" until someone has consciously tracked it themselves — which almost nobody does.

### For the Café

A café sells cups. What it rarely captures is *what those cups actually tasted like to the people drinking them* — not "did they like it" in the abstract, but concrete sensory information: which descriptors people actually reach for, whether perception shifts by brew method, whether a guest's own taste lines up with what the café's own staff would expect.

Without that layer, every cup is a transaction that leaves no trace beyond a sale. Coffee Passport gives the café a second kind of asset: a record of what its own bar actually produces in the cup, from the guest's side, not just the roaster's spec sheet.

### For the Roaster

A professional cupping session — the reference profile — is a rigorous, controlled measurement of what a coffee *can* be, under lab conditions, by a trained palate. It's real, and it stays real. But it is not the end of the story.

The same lot then leaves the lab and gets ground on a dozen different grinders, pulled on a dozen different machines, by baristas with different techniques, using different water, at different freshness levels, by people in different moods on different mornings. What the roaster's cupping form describes and what actually lands in someone's cup can drift — sometimes confirming the reference profile beautifully, sometimes revealing something the lab never saw. Coffee Passport is the layer that collects *that* reality: not to replace the reference profile, but to show how it holds up once it leaves the building.

---

## 3. Why This Is Not "Just a Digital Coffee Passport"

There is a shallow version of this idea: a QR code that opens a card with origin, process, and tasting notes — a *digital product passport*. That version already exists in the market in various forms, and Coffee Passport includes it, but it is not the product.

The real value starts after the card loads:

**Coffee → Café → Preparation → Guest → Tasting → History → Community → Insight.**

A product passport answers one question once. Coffee Passport is built around a loop that keeps running: every guest who tastes the coffee adds a new data point, every café that serves it adds new preparation context, and the record for that lot keeps getting richer instead of staying static from the day it was printed.

**PRODUCT PRINCIPLE.** The QR code is the door, not the room.

---

## 4. Product Philosophy

> **«Coffee Passport не ищет единственно правильный вкус. Он показывает историю того, как один кофе раскрывается в разных условиях.»**
> *("Coffee Passport does not look for the one correct taste. It shows the history of how one coffee reveals itself under different conditions.")*

This sentence is shown once, in full, at the highest-leverage moment in the product — right after a guest's very first reveal, exactly when "did I get it right?" is the natural reaction to head off. **IMPLEMENTED NOW.**

Three consequences follow directly from it, and they are load-bearing, not decorative:

1. **There is no "correct" answer for a guest to have gotten wrong.** A blind tasting is a comparison of two honest, independent reads — the guest's and the roaster's — not a quiz with a graded outcome.
2. **A professional reference profile and a guest's lived perception can legitimately differ, and that difference is not an error.** The reference profile describes what a trained palate found under cupping conditions. A guest's read describes what actually reached them, in a real cup, under real conditions. Both are true; they are just descriptions of different moments.
3. **The difference itself is the interesting data.** A guest who tasted red apple where the roaster's reference profile calls out citrus has not failed a test — they have generated one more real, honest observation about how this exact lot shows up in the world. That observation, repeated across many guests and many cafés, is precisely the signal Coffee Passport is built to accumulate.

---

## 5. Three Participants, One Shared Object

### Guest

- **Problem:** Tasting experiences vanish. No memory, no comparison, no growing sense of personal taste.
- **What Coffee Passport gives them:** a blind tasting ritual with no risk of "getting it wrong," a moment of comparison against the roaster's own declared profile, a personal taste history that accumulates across cafés and cups, and — once enough highly-rated tastings exist — a personal flavor summary ("Вкусовой Паспорт") showing their own averaged profile and favorite regions/processing methods. **IMPLEMENTED NOW.**
- **Action:** scan → taste blind → record → reveal → optionally share anonymously with the community.
- **Data they generate:** their own sensory read (flavor axes, descriptor words, rating, free notes), their brewing/café context, and — only if they opt in — an anonymized copy visible to other guests of that same lot.
- **Long-term effect:** a growing personal record that turns "I don't really know what I like" into "I know my patterns" over successive visits.

### Café

- **Problem:** No structured signal on how guests actually experience what's on the bar, beyond anecdotal feedback.
- **What Coffee Passport gives them:** a menu layer tied to real Canonical Lots (not free text), lifecycle status on each lot ("new," "active," "being phased out"), guest sensory data tied to their own service, staff/equipment/loyalty tooling, and — new this cycle — a live notification the moment a new lot goes on their own menu. **IMPLEMENTED NOW.**
- **Action:** add lots from the roaster's catalog, set preparation/brewing context, manage staff and loyalty.
- **Data they generate:** which lots are on the menu and their lifecycle state; this is also the substrate the guest-facing "Обновления на баре" (bar updates) feed and the Notification Center read.
- **Long-term effect:** a café's own service quality and preparation choices become visible in aggregate guest data, not just gut feel.

### Roaster

- **Problem:** A cupping form is a single, controlled snapshot. What happens after the coffee ships is normally invisible.
- **What Coffee Passport gives them:** a Canonical Lot catalog with QR generation, a versioned reference profile they fully control, and per-lot guest analytics — averaged flavor axes, most-picked sensory descriptors, most-reported defects, all computed from real, anonymized guest checkins. **IMPLEMENTED NOW.**
- **Action:** define the Coffee → Green Lot → Canonical Lot chain, publish a reference roast profile and reference taste profile, move a lot through its lifecycle (draft → testing → active → archived).
- **Data they generate:** the professional reference that every guest comparison is measured against, and the "supply" side of the Coffee → Café → Guest chain.
- **Long-term effect:** visibility into whether their declared intent for a lot is holding up in the field — not as a verdict, but as a pattern they can read for themselves.

---

## 6. The Core Loop

```
Lot
 ↓
Roast
 ↓
Reference Profile   (roaster declares intent — roast target + expected taste)
 ↓
Coffee Shop          (a café adds the lot to its own menu)
 ↓
Preparation          (brew method, barista, context — recorded, not guessed)
 ↓
Guest                (scans, arrives at the lot's passport)
 ↓
Blind Tasting        (records their own read before seeing anything else)
 ↓
Data                 (rating, flavor axes, descriptor words, free notes)
 ↓
Context              (shop, brew method, time — known facts, not inferred causes)
 ↓
History              (this guest's own record of this lot, across visits)
 ↓
Community            (anonymized, opt-in, aggregated across guests — only once there's enough data to mean something)
 ↓
Insight              (roaster/café see how the reference holds up in the real world)
 ↓
Next Choice / Next Lot / Correction
```

This is not a set of unrelated screens. Every stage feeds the next, and the loop closes back on itself: what a roaster learns from real-world data can inform the next lot's roast target; what a guest learns about their own taste informs their next choice; what a café learns about guest response can inform what stays on the menu. **PRODUCT PRINCIPLE.**

---

## 7. Pure Roast × Coffee Passport

Coffee Passport's first real-world context is XO Coffee, using Pure Roast® as the declared roasting approach for its lots — but the two systems answer different questions, deliberately kept separate.

**Pure Roast asks:** *"How do we roast this specific lot to reveal its fullest potential?"* — the professional, pre-market question.

**Coffee Passport asks:** *"How is this lot actually being perceived, by real people, after it leaves the roastery?"* and *"What did a specific guest feel — and how did that compare to what the roaster intended to show?"* — the post-market question.

They complement each other precisely because they don't answer the same question. Pure Roast defines the target. Coffee Passport measures — without judgment — how close the world's actual experience of that target lands, cup by cup. Mixing them into a single system would blur exactly the distinction that gives each its value: intent versus outcome. **PRODUCT PRINCIPLE.**

Coffee Passport's architecture does not assume XO Coffee is its only roaster — the Canonical Lot model supports multiple roasters, multiple cafés, multiple coffees, and multiple users by design (see §17).

---

## 8. Reference Profile

**What it is.** The roaster's own professional, declared description of a specific Lot, split into two independently versioned parts:

- **Reference Roast Profile** — the intended roast approach: machine model, target curve shape, target Agtron, notes. This is a *target*, distinct from any single actual roast event (a "Roast Batch," logged separately and immutably, always pointing at the exact reference version it was following at the time — never "whichever version happens to be active now").
- **Reference Taste Profile** — the expected sensory read on the canonical four-axis model (acidity, sweetness, body, bitterness), plus a plain descriptor word list on the Lot itself (e.g. "strawberry," "citrus," "caramel").

**Who creates it.** The roaster, through their own dashboard, for their own lots.

**Why it exists.** It is the fixed, professional point of reference every guest comparison is measured against — the "what was this coffee designed to show" half of the comparison.

**Why it is not "the one correct taste."** It describes a controlled cupping condition: trained palate, standardized brew, no ambient variables. A guest's cup is none of those things by default — different water, grind, machine, barista technique, and the guest's own state all sit between the reference profile and what actually reaches them. The reference profile is real and worth taking seriously; it is not, however, a pass/fail answer key for a guest's own experience.

**Versioning matters.** Both profile types enforce *exactly one active version* per lot at the database level, and every historical tasting or roast batch is permanently linked to the exact version that was active when it was recorded — never silently reattributed to a later, revised version. A guest's tasting from three months ago is compared against the profile that existed three months ago, even if the roaster has since refined it. **IMPLEMENTED NOW.**

**Reference Profile ≠ Guest Rating.** One is a professional declaration on a fixed scale, entered by the roaster once per version. The other is one person's personal 1–5 rating of how much they enjoyed a specific cup. The product deliberately never displays these two numbers adjacent to each other as though they were the same kind of measurement — that adjacency is exactly what invites a guest to read "was my rating close to the official grade," which the product's philosophy explicitly rejects (§4). **IMPLEMENTED NOW.**

---

## 9. Blind Tasting

The flow, in the order it actually happens:

1. The guest picks their café and, separately, what they're drinking (drink type/brew method) — neither step reveals anything about flavor.
2. The guest tastes and records their **own** read: a required star rating, four flavor sliders (acidity, sweetness, body, bitterness), a structured descriptor picker with sub-descriptor drill-down, an optional defects section, and free-text notes on what they liked and didn't.
3. Only **after** saving does the reference profile — origin story, Q-Score, reference descriptors — unlock.
4. The system then shows a comparison, never a grade.

Crucially, taste is recorded *before* brew-method and barista detail are even collected, specifically so the guest's read is not primed by knowing the recipe first. **IMPLEMENTED NOW.**

The product states this explicitly, once, right where a guest might otherwise start feeling tested: *"Опишите так, как чувствуете вы — здесь нет правильного ответа"* ("Describe it the way you feel it — there is no correct answer here"). This line is meant to reassure, not warn.

**Why blind matters.** A guest who already knows the "expected" flavor notes before tasting will, consciously or not, read those notes into the cup. Blind tasting is what makes the resulting data genuinely independent — and therefore genuinely useful as a second, honest measurement alongside the reference profile, rather than an echo of it.

---

## 10. Contextual Taste

This is the product's most distinctive layer: the structured comparison between what a guest actually felt and what the lot's profile declares, built entirely from words and structure, not scores.

**What it shows, in order:**

1. **My Perception** — the guest's own descriptor words, shown first and most prominently. Not a number, not a chart.
2. **Coffee Profile** — the lot's currently declared descriptor words, shown second, clearly labeled as the lot's own profile.
3. **Overlap ("Совпало")** — words that appear in both lists.
4. **Difference ("По-разному")** — words that appear in only one list, shown side by side, never ranked or color-coded by "correctness."
5. **Context** — known, recorded facts: brew method, café, when. Never invented.
6. **Possible Influences** — a quiet, collapsed, secondary section, shown only when a real difference exists.

**On the "Possible Influences" list specifically:** this is deliberately the same generic list every time — water, grind, dosing, extraction, brew method, equipment condition, bean freshness, food or drink beforehand, ambient smells, mood, fatigue, individual perception differences — introduced with explicitly hedged language ("могли повлиять," never "повлияло"). The product never claims to know *which* factor caused *this specific* guest's specific difference, because it has no way to know that. It states plainly, inside the same component, that this is "not an explanation of what happened to you specifically — just a list of what can generally affect a cup." **IMPLEMENTED NOW.**

A secondary, quieter numeric view (the same four flavor axes, guest vs. reference) remains available one tap deeper, for anyone who wants it — but it is never the first or dominant thing shown, and it is never presented as a graded diff table. **IMPLEMENTED NOW.**

**PRODUCT PRINCIPLE.** Known fact and possible influence are never the same sentence.

---

## 11. "What I Felt" ↔ "What the Roaster Meant to Show"

This is the central product metaphor, and it is worth stating plainly:

> **MY PERCEPTION** vs. **COFFEE PROFILE**

Three outcomes, none of them graded:

- **Overlap** — the guest's read and the roaster's declared profile share real ground. This is one valid story, not a "win."
- **Partial overlap** — some words match, some don't. Also just a story.
- **Full difference** — nothing matched. The product's own copy says this explicitly: *"даже один и тот же кофе раскрывается по-разному"* ("even the same coffee reveals itself differently") — framed as expected variation, not failure.

**Difference is not an error. It is a real data point about how this exact coffee behaves outside a controlled cupping room.** That reframe — from "wrong answer" to "one more honest observation" — is the single idea the entire Contextual Taste layer exists to protect.

---

## 12. Taste History — "One Lot, Many Cups"

A single tasting tells you very little. A *series* of tastings — the same lot, at different cafés, prepared different ways, over time — starts to tell a real story.

**What accumulates:**
- Every time this guest has tasted this specific lot, anywhere, with a compact preview of brew method and their own descriptor words for each visit.
- A "One Lot — Many Cups" view (grouped Roaster → Lot → individual attempts) reachable from the guest's own journey page, and, more directly, promoted onto the Passport itself once more than one attempt exists.

**Why it matters.** It makes visible, without extra explanation, the idea the philosophy statement asserts in words: the same lot is not one fixed flavor. It is a range of real outcomes, and watching that range across your own repeated visits is how a guest starts to build genuine self-knowledge — *"не знаю → пробую → фиксирую → сравниваю → понимаю себя → выбираю лучше"* (don't know → try → record → compare → understand myself → choose better).

That self-knowledge culminates in a standing artifact: once a guest has a handful of highly-rated tastings, their journal shows a personal flavor summary — their own averaged acidity/sweetness/body/bitterness, plus the regions and processing methods they keep returning to. **IMPLEMENTED NOW.**

---

## 13. Community

The community layer answers one question — *"how do other people experience this same lot?"* — without turning into a leaderboard, a ranking, or a popularity contest.

**What a guest sees**, once enough data exists:
- How many people have tried this lot and opted in to share.
- The most frequently picked descriptors across those opted-in tastings.
- Whether perception shifts by brew method — shown only when there's enough distinct data to say something real.
- The individual, anonymized entries underneath, for anyone who wants to read specific people's specific notes rather than just the aggregate.

**Why sample gates matter, concretely.** The aggregation logic will not render "most common perception" below **three** opted-in tastings, and will not render a by-brew-method breakdown unless at least **two** distinct brew methods each have **two or more** tastings. Below those thresholds, the section simply does not appear — nothing is ever extrapolated from too little data to manufacture a false sense of pattern. **IMPLEMENTED NOW**, with the exact thresholds above verified in code.

**How it differs from the Reference Profile.** The reference profile is one expert's controlled, professional read. Community data is many amateurs' honest, uncontrolled reads, aggregated only when the sample genuinely supports it. Neither replaces the other, and the product never blends the two into a single number.

**Privacy.** Every entry is opt-in and rendered without any author identity — anonymous by construction, not just by convention.

---

## 14. Coffee Shop Layer

**What the café manages:**
- A curated menu of Canonical Lots pulled from the roaster's own catalog — never free text.
- Lifecycle status per lot on their own menu: "new," "active," or "being phased out" (with a scheduled-removal countdown), independent of whether the roaster still carries it in their own catalog.
- Preparation and recipe context (brewing methods, custom equipment, staff/barista roster).
- Real guest sensory data tied to their own service — the same anonymized checkin data the roaster's analytics read, scoped to their own bar.
- A live feed of activity on their own menu, both as a compact dashboard preview and, new this cycle, a persistent, read/unread notification with a badge count and real-time delivery the moment a lot is added.

**The chain this creates:** Roaster → Café → Guest, and the data flows back the other way: what the guest actually tasted becomes visible, in aggregate, to both the café that served it and the roaster that made it. **IMPLEMENTED NOW.**

---

## 15. Roaster Layer

The roaster's professional work — cupping, the reference profile — is the starting point, not the whole story. What Coffee Passport adds is visibility into **how that declared profile behaves once it's out in the world.**

**What's real today:**
- A Canonical Lot catalog: create, define origin/Green Lot/Coffee chain, set lifecycle status, generate and download a printable QR.
- A fully versioned reference roast profile and reference taste profile per lot, with exactly-one-active-version enforcement and permanent historical linkage (§8).
- Per-lot guest analytics, computed from real, anonymized checkins across every café that serves the lot: average flavor axes, the most frequently picked sensory descriptors, the most frequently reported defects, and the ability to reply to individual guest reviews.
- A supply map showing which cafés are carrying which lots.

**What this is not (yet):** predictive analytics, trend detection across lots or time, automated recommendations, or any AI-generated interpretation of *why* a pattern exists. What exists today is honest aggregation — real counts and averages, presented as such — not inference. Anything beyond that belongs in §17 (Roadmap), not here.

---

## 16. Canonical Lot Architecture

In plain terms, three layers, each answering a different question:

**Coffee** — *what is this coffee, fundamentally?* Country, region, farm, producer, variety, altitude, processing method, harvest year. This is identity — it doesn't change release to release.

**Green Lot** — *which specific purchase are we talking about?* A specific batch bought from that Coffee, with its own purchase date, quantity, and contract reference. One Coffee can have several Green Lots over time (different harvests, different purchases).

**Canonical Lot** — *which specific roasted release is this?* This is the object with a public QR-facing identity (e.g. `LOT-XO-ETH-001`), its own lifecycle status (draft → testing → active → archived), its own descriptors, Q-Grade, and roast profile label. One Green Lot can back several Canonical Lots — the same purchased green coffee, roasted differently on different occasions, each becoming its own trackable release.

**Why Canonical Lot is the center of the system, not Coffee.** Everything guest-facing — the QR code, the passport page, every tasting record, every reference profile — is anchored to the Canonical Lot, because that's the actual, specific thing a guest is drinking. Coffee and Green Lot exist underneath it to keep origin and purchasing history honest and non-duplicated, but they are never what a guest scans.

**Ownership.** A Canonical Lot belongs to one roaster. A café's menu references Canonical Lots it has chosen to carry — it never owns or edits the lot's own declared identity. **IMPLEMENTED NOW.**

---

## 17. Data Philosophy

Four distinct kinds of data exist in the system, and the product's discipline is refusing to let them blend into one undifferentiated "coffee data" blob:

**Professional data** — what the roaster declares: origin facts, reference roast profile, reference taste profile, Q-Grade. Owned by the roaster, factual, structurally separate from everything below it.

**Café context** — the recorded conditions a specific cup was made under: which shop, which brew method, roughly when. Known facts, never inferred causes.

**Guest perception** — what one specific person actually felt, at one specific moment. Never silently treated as an objective property of the coffee itself — it is "how this coffee opened up for this person, right then," not a verdict on the coffee.

**Community data** — the aggregate pattern across many guests' perceptions, rendered only once the sample genuinely supports a claim (§13).

**Why the separation matters.** The moment Guest Perception gets treated as Professional Data (or vice versa), the product's central claim — that difference is honest information, not error — stops being true in practice. Keeping the four layers structurally distinct, at the data-model level and not just visually, is what makes the philosophy in §4 something the architecture actually enforces, not just something the copy asserts.

---

## 18. Why This Is Not a Rating App

| A typical rating app | Coffee Passport |
|---|---|
| A single score | A history of perception |
| One number | Several distinct dimensions (words, axes, rating — kept separate) |
| "Good / bad" | Overlap / difference, with no "correct" side |
| Rates the product | Records the relationship between a person and a coffee |
| A static review | An accumulating personal record |
| No preparation context | Brew method, café, and time recorded alongside the taste |
| No professional baseline | Compared against a real, versioned reference profile |

This is not a claim that rating apps are worse at everything — a five-star average is genuinely useful for "should I try this." It answers a different question than Coffee Passport does, which is closer to *"how did this specific coffee actually show up for me, and for others, across real conditions"* — a question a single number structurally cannot hold.

---

## 19. Why This Is Not "Just a Digital Grain Passport"

**A product passport** answers, once: what is this, where is it from, what does the label say.

**An experience passport** — what Coffee Passport actually is — keeps a running record of what happened every time a real person met this specific coffee: what they felt, where, how it was made, and how that compared to what was declared. The QR code is identical in both models. Everything that happens after the scan is not.

---

## 20. The Guest Journey

**Before the coffee.** A guest encounters a lot — usually by scanning a QR code at a café's table or on a bag — and lands on that lot's own passport page.

**Before tasting.** Only non-spoiler facts are visible: country, region, farm, process, Q-Score, crop year. Flavor descriptors and the reference profile stay locked. The framing is calm, not clinical: *"Доверьтесь своим рецепторам!"* ("Trust your own senses!").

**Blind tasting.** The guest records their own read — rating, flavor axes, descriptor words, free notes — with no hint of what they're "supposed" to find.

**Reveal.** The guest's own perception is shown first. Then the lot's declared profile. Then overlap, then difference — words, not scores — followed by the one calm explanatory line: *"Это не экзамен на правильный вкус"* ("This is not an exam on the correct taste").

**Context.** Known, recorded facts about how this cup was made — never invented explanations.

**History.** This exact tasting joins the guest's own accumulating record for this lot, and (once there are enough) their overall personal taste summary.

**Next tasting.** A returning guest at the same café, or a different one, adds another data point to the same lot's story — their own, or (if they opt in) the community's.

**Next coffee.** Armed with a growing sense of their own patterns — favorite regions, favorite processing methods, their own averaged profile — the guest's next choice gets easier, not because the app told them what to like, but because they've started to know it themselves.

**Where retention lives.** Not in a single delightful screen, but in the fact that every return visit adds real, compounding value to something the guest already owns — their own taste history — which a one-off rating never does.

---

## 21. The Retention Loop

```
Discover → Taste → Record → Reveal → Compare → Remember → Discover again
```

The difference from the default pattern — *drink → forget* — is that every loop through this cycle leaves something behind: a richer personal history, a slightly clearer sense of personal taste, and (for café/roaster) a slightly richer real-world signal. Nothing is thrown away between visits. That accumulation, not a single "aha" moment, is the actual retention mechanism.

---

## 22. Business Value

**For the Roaster**
- A differentiated, tangible product experience attached to every bag/QR, distinct from a generic origin card.
- Structured, honest feedback on how a declared reference profile performs once it leaves the lab — confirmation where it holds, real signal where it drifts.
- A direct channel back to guests through anonymized review replies.
- A relationship with cafés and guests that persists beyond a single sale.

**For the Café**
- A concrete way to differentiate the in-café experience without inventing new content from scratch.
- Real guest-response data tied to their own bar and their own preparation choices, not just anecdote.
- A live signal (the Notification Center) the moment new supply is added to their own menu.
- A loyalty and engagement layer that rewards return visits with an accumulating personal record, not just points.

**For the Guest**
- A personal, growing record of taste, at no cost beyond a few seconds per cup.
- An easier path to discovering what they actually like, grounded in their own real history rather than someone else's star rating.
- A tasting experience that feels like genuine self-discovery rather than a graded quiz.

No specific revenue or adoption figures are claimed here — none exist in the codebase to cite, and this document does not invent any.

---

## 23. Why Now

- **Specialty coffee culture has matured** to the point where origin, process, and roast intent are already part of the conversation at the café counter — the audience for a deeper layer of information already exists and is already primed to want it.
- **QR-based product interaction is now a default expectation**, not a novelty — the entry point Coffee Passport relies on requires no user education.
- **Personalization has become an expected layer** in most consumer categories; specialty coffee, despite its emphasis on individual palate, has largely lacked a structured way to capture *personal* taste over time rather than just product ratings.
- **The shift from "rate the product" to "record the relationship"** mirrors a broader pattern already visible in adjacent categories (wine, whisky, specialty food) — Coffee Passport applies that same shift to coffee, with the added structural advantage of a real, versioned professional reference to compare against.

No third-party market-size figures are cited here, since none are present in the project to verify.

---

## 24. Competitive Differentiation

**Category.** Most coffee-adjacent apps fall into one of two buckets: roaster/café-side professional tools (cupping software, inventory, production tracking), or guest-side rating/discovery apps (rate this bag, find nearby cafés).

**What Coffee Passport does differently.** It is not roaster-side or guest-side — it is the same object, the same Canonical Lot, viewed simultaneously from all three participants, with a real professional reference profile that guest perception is deliberately, honestly compared against, and a blind-first sequence designed specifically to keep that comparison meaningful rather than primed.

**The fundamental structural difference.** Every comparable tool answers *"what is this coffee"* or *"did you like it."* Coffee Passport is built to answer a third, different question: *"how does this specific, traceable coffee actually behave once it meets real people, in real conditions, over and over" —* and to keep collecting the answer indefinitely, not just once at launch.

No specific competitor names or their features are claimed here, since none are verifiable from this project.

---

## 25. Key Product Principles

1. There is no single correct taste — only honest, valid readings.
2. A Reference Profile is a real, professional measurement — and never a pass/fail answer key for a guest's own experience.
3. Blind tasting comes before any hint of what a coffee is "supposed" to be.
4. Difference is data, never failure, and never apologized for.
5. Known fact and possible influence are never stated as the same kind of claim.
6. Color, layout, and hierarchy never imply "correct" or "incorrect" — only shared/different, weighted by position and typography, not hue.
7. History matters more than any single tasting — one cup is a data point, a series is a story.
8. Community insight only renders once the real sample size supports it — never extrapolated from too little data.
9. Professional data, café context, guest perception, and community data are structurally kept separate, never blended into one number.
10. Simplicity for the guest, depth for the professional — the same underlying data, presented at the right density for who's looking at it.
11. One lot is not one flavor — the same coffee can, and does, reveal itself differently under different real conditions.
12. Coffee Passport connects every participant in the chain — Roaster, Café, Guest — around one shared object, not three disconnected apps.

Each of these was checked, while writing this document, against the actual implemented behavior described in §26 — not asserted in the abstract.

---

## 26. What's Implemented

**Canonical Lot & Lifecycle**
- Coffee → Green Lot → Canonical Lot chain, with public QR-facing identity, descriptors, Q-Grade, roast profile label.
- Lifecycle status (draft → testing → active → archived), enforced at the roaster level; a café's own menu-entry status ("new" / "active" / "being phased out," with scheduled-removal countdown) is a separate, independent axis.
- Roaster/café ownership boundaries enforced by RLS, not just application logic.

**Reference Profile**
- Independently versioned Reference Roast Profile and Reference Taste Profile per lot, database-enforced exactly-one-active-version, immutable historical linkage from every roast batch/tasting to the exact version it followed.

**Guest Tasting**
- Location + drink-type selection, blind sensory evaluation (rating, four flavor axes, structured descriptor picker, optional defects, free text), barista/brew-method capture, all sequenced so taste is recorded before any priming detail.
- Reveal screen structured around My Perception → Coffee Profile → Overlap → Difference → Context → Possible Influences, with the philosophy statement shown once at the first-ever reveal and a short recurring line afterward.
- A quiet secondary numeric (flavor-axis) comparison, available one tap deeper, never the primary presentation.

**Taste History**
- "One Lot — Many Cups" grouped view (Roaster → Lot → individual attempts), promoted directly onto the Passport once a lot has more than one attempt.
- A personal, guest-facing flavor summary ("Вкусовой Паспорт") — averaged flavor axes from highly-rated cups, favorite regions, favorite processing methods.

**Community**
- Opt-in, anonymized aggregation with explicit sample-size gates (minimum 3 tastings for "most common perception"; minimum 2 distinct brew methods with 2+ tastings each for a by-method breakdown) — below threshold, the section simply doesn't render.
- Individual anonymized entries shown underneath the aggregate.

**Café Layer**
- Menu curation from the roaster's own Canonical Lot catalog, lifecycle status per shop, equipment/staff/loyalty tooling, and real anonymized guest sensory data tied to their own bar.

**Roaster Layer**
- Canonical Lot catalog management, QR generation/PDF export, per-lot guest analytics (averaged flavor axes, top descriptors, top defects) from real anonymized checkins, review reply threads, a supply map of which cafés carry which lots.

**Notification / Event Center**
- **NEW_CAFE_LOT** as a real, persistent, per-user notification — not just a computed preview — with independent per-occurrence read/unread/dismiss state, a real unread count on a bell trigger, and live realtime delivery when a café adds a new lot, with duplicate-safe idempotent handling on reconnect.
- A dashboard preview (capped, small) plus a full Notification Center (uncapped, with client-side incremental "show more") — the preview is never the only way to see everything.
- A user-controlled on/off preference for this notification type, respected end-to-end.
- **Ecosystem Events** (specialty-coffee industry events board): real offset-based pagination — a 5th, 10th, or 20th event is genuinely reachable, not just the first page — reused consistently across the dashboard preview, the dedicated events view, and the Notification Center's Events tab. No per-user read/unread state was added here, deliberately, since the underlying board has none.

**Mobile / Accessibility**
- Reviewed at 375/390px widths: no horizontal overflow, generous tap targets on interactive controls, `role="dialog"`/`aria-modal`, keyboard Escape-to-close and focus return, `aria-expanded`/`aria-label` on icon-only controls, global `prefers-reduced-motion` handling. The Notification Center's tab control uses a simplified (non-roving-tabindex) ARIA tabs pattern — a known, deliberate simplification, not a defect that blocks any interaction.

**Security / RLS**
- Every new table introduced by the Notification Center is owner-only (`auth.uid() = user_id`), grants restricted to authenticated users only, no service-role key used in any client-side data path, and no new anonymous write access opened anywhere.

**Test Coverage**
- 143 automated tests passing, `tsc --noEmit` clean, production build clean, at the time of writing.

---

## 27. What's Not Yet Implemented

Only items genuinely discussed but not built are listed here — this is not a wish list.

- Deeper, guest-entered brewing context on a tasting (grind size, dose/yield, water profile, extraction time, explicit mood/state tags) — the data model has room for it, nothing has been added.
- A dedicated, standalone "Как мы понимаем вкус" (How we think about taste) editorial page for the full philosophy statement, beyond its current in-flow placement at first reveal.
- Predictive or trend-based analytics for roasters (pattern detection across lots or over time) — today's roaster analytics are honest counts/averages of a single lot's own data, not cross-lot inference.
- Push, email, or SMS delivery for notifications — the current Notification Center is in-app only, by explicit decision.
- A guest-facing subscription/"follow this café" concept beyond the existing per-shop mute toggle.

---

## 28. Roadmap

**NOW** — what exists today, summarized from §26: the full guest tasting loop, Contextual Taste, Taste History, gated Community aggregation, the Café and Roaster layers, Canonical Lot architecture, and the Notification/Event Center.

**NEXT** — the most logical, low-risk extensions of what already exists:
- A dedicated editorial "philosophy" page, reachable from account/landing, so the core idea has a permanent home beyond the first-reveal moment. *Why:* the philosophy currently earns its place once and recedes by design — a stable home for it gives a returning or skeptical guest somewhere to go re-read it deliberately.
- Optional, clearly-opt-in deeper brewing context on a tasting for guests who want to go further (grind, dose/yield, water). *Why:* the Enthusiast/Professional density tier already exists structurally; this is the next real field to hang off it, without ever making it required.
- Extending the notification model's already-generalized shape to a second notification type. *Why:* the read/dismiss/preference architecture built this cycle was explicitly designed to be extended, not rebuilt, for a future type.

**FUTURE** — plausible directions once the base is proven at larger scale:
- Multi-roaster, multi-café rollout beyond the current pilot context, exercising the parts of the Canonical Lot model already built to support it (ownership boundaries, per-shop menu curation, roaster-scoped analytics).
- Real pattern-level insight for roasters across their own catalog (not a single lot) — still descriptive, not predictive, unless a much larger, more deliberate data-science layer is separately built and justified.
- A more developed café loyalty layer building on the existing loyalty/transaction primitives.

**VISION** — the long-run shape of the idea, held loosely:
- A specialty coffee lot that is genuinely legible across its entire real-world life — not just where it came from, but how it was actually received, everywhere it went — available to anyone who wants to look, from the person who grew it to the person who just finished the cup.

Each item above is a direction, not a commitment with a date attached — none of this is described as built.

---

## 29. What Coffee Passport Creates, in the End

Not "an app for rating coffee."

> **Coffee Passport is the record of what actually happens to a coffee after the cupping form is signed — told honestly, cup by cup, by the people who actually drank it.**

A few other ways to say the same thing, for different audiences:

- *For a roaster:* "The reference profile is what you meant. Coffee Passport is what actually happened."
- *For a café:* "Every cup you pour already has a story. This is where it stops disappearing."
- *For a guest:* "You don't need to already know what you like. You need somewhere for it to add up."

---

## 30. The Pitch

**10-second pitch.**
Coffee Passport is a digital passport for a single coffee lot that keeps recording what actually happens to it after roasting — what real people taste, where, and how, compared honestly against the roaster's own professional reference.

**30-second pitch.**
A café adds a lot to its menu; a guest scans it, tastes it blind, and records their own read before seeing anything about it. Only then do they see what the roaster declared — origin, professional cupping profile, descriptors — and a calm, honest comparison: what overlapped, what didn't, with no "correct" answer implied. Every tasting adds to that guest's own growing taste history, and, once there's enough real data, to an anonymized community picture of how that lot is actually landing in the world.

**60-second pitch.**
Most coffee apps answer one of two questions: "what is this coffee" (a static product card) or "did you like it" (a star rating). Coffee Passport answers a third question neither can: how does this specific, traceable lot actually behave once it leaves the roastery and meets real people, over and over, in real conditions? A roaster defines a versioned, professional reference profile for a lot. A café adds that lot to its own menu. A guest scans a QR code, tastes the coffee *before* seeing anything about it, and records their own honest read — words, not just a number. Only then does the comparison appear: their perception against the roaster's declared profile, framed as overlap and difference, never as a grade. That tasting joins the guest's own accumulating taste history, and — anonymized, opt-in, and only once there's real sample size behind it — into a shared picture of how this lot is actually landing across many guests and many cafés. The roaster, in turn, gets to see how their own declared intent is holding up in the field. Nobody involved has to guess anymore.

---

## PRESENTATION CORE

A working 14-slide structure, following the arc: **Problem → Why existing approaches fall short → Idea → How it works → Guest → Café → Roaster → Blind Tasting → Reference Profile → Real-world data → Ecosystem → Business value → Future → Vision.**

### Slide 1 — The Problem
- **Main idea:** A great cup happens, and then it's gone.
- **Key points:** No memory of what you tasted; no way to compare it later; no connection between what you felt and what the roaster intended.
- **Visual:** A single, striking cup of coffee, fading/dissolving — the moment slipping away.
- **Role in story:** Opens with the felt problem, not the product.

### Slide 2 — Why the Usual Fixes Don't Work
- **Main idea:** A QR spec sheet answers "what is this" once. A star rating answers "good or bad." Neither captures the actual experience.
- **Key points:** Static product cards go stale; a single number collapses a whole sensory experience; nothing connects a guest's own read to a professional reference.
- **Visual:** Side-by-side: a QR product card, a 5-star widget — both crossed out or grayed against a richer third column.
- **Role in story:** Clears the ground before introducing the real idea.

### Slide 3 — The Idea
- **Main idea:** Coffee Passport follows a lot into the real world and records what actually happens to it.
- **Key points:** One coffee, one Canonical Lot, one continuous record; three participants share one object.
- **Visual:** The core loop diagram from §6, simplified to its main arc.
- **Role in story:** Names the idea in one clean image before any detail.

### Slide 4 — How It Works, End to End
- **Main idea:** Lot → Roast → Reference Profile → Café → Preparation → Guest → Blind Tasting → Data → History → Community → Insight.
- **Key points:** It's a loop, not a funnel; every stage feeds the next.
- **Visual:** The full loop diagram, all stages labeled.
- **Role in story:** The mechanical spine the rest of the deck fills in.

### Slide 5 — Guest
- **Main idea:** A personal, growing record of taste — not a one-off rating.
- **Key points:** Blind tasting with no wrong answer; a reveal built around honest comparison; a taste history and personal flavor summary that compound over time.
- **Visual:** A journey-page-style card: flavor radar + favorite regions + tasting count.
- **Role in story:** First of the three participant views — starts with the most human one.

### Slide 6 — Café
- **Main idea:** Real signal on what your own bar actually produces in the cup.
- **Key points:** Menu tied to real Canonical Lots; lifecycle status; live notifications on new supply; guest sensory data tied to their own service.
- **Visual:** A simplified café dashboard mock — menu list + a notification bell with a badge.
- **Role in story:** Second participant view — the operational layer.

### Slide 7 — Roaster
- **Main idea:** See how your own declared intent holds up once it leaves the building.
- **Key points:** Versioned reference profile you fully control; real, anonymized guest analytics per lot; a QR-generated catalog.
- **Visual:** Reference profile card next to a "what guests actually reported" analytics card.
- **Role in story:** Third participant view — the professional layer, and the eventual payoff of everything upstream.

### Slide 8 — Blind Tasting
- **Main idea:** No hints, no priming, no "correct" answer — the guest records what they actually feel first.
- **Key points:** Taste is recorded before recipe/barista detail; explicit "there is no correct answer here" framing; this is what makes the resulting comparison honest.
- **Visual:** The pre-reveal locked-profile screen, side by side with the sensory form.
- **Role in story:** Zooms into the mechanic that makes everything downstream trustworthy.

### Slide 9 — Reference Profile
- **Main idea:** A real, professional, versioned measurement — not an answer key.
- **Key points:** Roast target + expected taste, both versioned, both permanently linked to every historical tasting/batch that followed them; not the same kind of number as a guest's personal rating.
- **Visual:** A simple two-box diagram: Reference Roast Profile / Reference Taste Profile, each stamped "v1 → v2 → v3," with old tastings pinned to their own version.
- **Role in story:** Establishes the fixed point everything gets compared against.

### Slide 10 — Real-World Data: My Perception vs. Coffee Profile
- **Main idea:** Overlap and difference, shown as words, never as a score.
- **Key points:** "Совпало" / "По-разному" — no color implies correctness; difference is data, not failure.
- **Visual:** The actual reveal layout — descriptor chips grouped as Overlap / Difference, no red/green.
- **Role in story:** The emotional core of the deck — this is the product's real idea, made visible.

### Slide 11 — History & Community
- **Main idea:** One tasting is a data point. Many tastings are a story.
- **Key points:** "One Lot — Many Cups"; a personal taste summary that compounds; community patterns shown only once the sample genuinely supports them.
- **Visual:** A taste-history timeline card next to a gated community-aggregate card (with its own sample-size note visible).
- **Role in story:** Shows how the loop compounds instead of resetting every visit.

### Slide 12 — The Ecosystem, Connected
- **Main idea:** Roaster → Café → Guest, and the data flows back.
- **Key points:** One shared Canonical Lot object; each participant sees a different, relevant slice of the same record; the Notification Center keeps everyone current in real time.
- **Visual:** A three-node diagram (Roaster / Café / Guest) around one central Lot object, with arrows both ways.
- **Role in story:** Pulls the three participant slides back together into one system.

### Slide 13 — Business Value
- **Main idea:** Differentiation, retention, and real signal, for everyone in the chain.
- **Key points:** Roaster — validated (or challenged) reference profiles, a direct guest channel; Café — differentiated experience, real guest data, live engagement; Guest — a personal record worth coming back for.
- **Visual:** Three short columns, one per participant, each with 2–3 bullet value statements.
- **Role in story:** Turns the product story into a reason to care commercially.

### Slide 14 — Where This Goes
- **Main idea:** Next: deeper context, a permanent home for the philosophy, a generalized notification model. Future: multi-roaster scale, richer roaster-side insight, deeper loyalty. Vision: a coffee that is genuinely legible across its entire real-world life.
- **Key points:** Clearly split NOW / NEXT / FUTURE / VISION, per §28 — nothing on this slide is claimed as already built beyond what's true today.
- **Visual:** A simple four-stage horizontal roadmap, with "NOW" visibly the only filled-in stage.
- **Role in story:** Closes on direction and ambition without overclaiming the present.

---

## Final Note — What Changes If This Becomes Standard

If a system like Coffee Passport became a normal part of how specialty coffee is experienced — not a novelty, just the expected way a good lot gets followed — the most concrete shift would be a small one: tasting notes would stop being something only professionals write and casual drinkers occasionally glance at, and start being something ordinary guests actually keep, compare, and build on for themselves.

That's a modest claim on purpose. Coffee Passport does not promise to change how coffee is grown, roasted, or judged by experts — the reference profile, the cupping form, the roaster's craft all stay exactly where they are. What it changes is what happens to a coffee's story *after* the expert's part is done: instead of disappearing into a shrug and a forgotten name, it keeps being written, honestly, by everyone who actually drinks it.

---

*This document reflects the Coffee Passport codebase as audited at the time of writing. Where it and the code later diverge, the code is the source of truth — this artifact should be re-verified against it before reuse in a new presentation or partner conversation.*
