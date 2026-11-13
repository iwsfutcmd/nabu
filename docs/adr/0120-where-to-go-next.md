# 0120. Where to go next: Home continues, and the course page opens at Continue

- Status: Proposed
- Date: 2026-11-13
- Amends: [0105](0105-learning-pace.md) (Continue is on Home too), [0107](0107-practice-over-points.md)
  (what Home starts with), [0047](0047-offline.md) (the offline panel is a page of its own),
  [0103](0103-reminder-timing.md) (what a tapped reminder opens)

## Context

The 2026-11 review found that the app made learners hunt for what to do next.

- **Nothing resumed where the learner left off (S1).** Every visit began at "Choose a course":
  nine cards, none marked as started. Keeping going took a course, a writing system and a scroll.
  The reminder ("Your next lesson is there whenever you are") opened the same list.
- **The course page had no main action (S2).** The path renders every node (es: 199, about 29
  phone screens), the next one was never scrolled into view, and Words, the sentence list and
  Offline came after all of them.

Since then the course page gained Continue (ADR 0105), units say their level and progress, and
the end of a session offers the next step (ADR 0113). What remained:

- Home did not lead with the course in progress;
- the course page opened at its top;
- its other pages were still at the foot of the path;
- finished units took as much room as the rest.

## Decision

**Home leads with where the learner left off.** A card, "Pick up where you left off", sits under
the heading, above the practice panel. It shows:
- the course studied last, in the writing system it was studied in (named only where the course
  has several), linked to its page;
- the next step, as the course page's Continue has it: the next lesson or story, named as the path
  names it ("Next: Unit 6, lesson 1"), or practice first with "New lesson anyway" beside it (D6), or
  that the path is done;
- Continue, which starts that step.

The course list puts the courses studied first, the latest first, each saying when it was last
practised ("Last practised yesterday"), and links each to the writing system it is studied in. The
other courses follow by name, as before. A learner who has studied nothing sees Home as before.

**It is read from the log.** A course's latest *start* is its latest `session_started` (any mode)
or `progress_reset`, ordered as the log orders events (device time, then id). This is
`studiedCourses` in @nabu/core/learner. A session on another device counts once it syncs, and
nothing is stored beside the log.
- On the device, `EventStore.latestStarts` reads each course's events back from its newest one
  until it meets a start, so Home never reads the whole log for this.
- Ids are UUIDv7, so the store's key order is the order events were made in. The outbox already
  relies on this.
- On Home the app holds the course it continues: its bundle and the learner's state in it, as a
  course route does. Continue, and the course page after it, open with nothing more to load.
- Until those are loaded, Continue opens the course's page. If the course cannot be loaded, it
  stays there (offline, a course never stored).

**A reminder opens Home, so it opens the card.** The reminder's `url` stays `./`.
- Tapped with no window open, the service worker opens one there, as before.
- Tapped with the app open, it focuses that window and posts `nabu-open` with the address. The app
  opens the address's route as a new navigation (`openAddress`, navigation.ts), as the native app
  already did. So a session under way is kept and picked up when its lesson opens again (ADR 0108).

**The course page opens at Continue's lesson.**
- A screen may mark the place it opens at (`data-arrival`). screen.tsx brings that place into view
  once the screen is there, centred in the window, unless it is all in view already. This applies to
  the first screen of a visit too.
- Focus still goes to the screen's heading (S10), so a screen reader starts at the top.
- The course page marks Continue's node: the next lesson, or the one beside "Practise first".
- It marks nothing for a learner who has done no node yet: their page starts at the top, with the
  placement offer and an alphabet row's advice in view.

**Finished units fold away.**
- A unit (or an alphabet row) whose every lesson and story is done shows only its heading: number,
  title, level and "7 of 7 done".
- The heading is a button (`aria-expanded`, `aria-controls`) that shows its lessons again, and hides
  them again.
- Lessons stay in the page while hidden. What is opened lasts while the page is open.

**The course's other pages are linked under its title.** A row of links (`[data-course-links]`, a
`nav`) holds:
- the words learned, with how many are known;
- the sentence list;
- Your reports, once there is one;
- Preferences;
- Offline, where this build keeps courses offline.

They replace the links scattered over the page: Preferences beside "All courses", Words among the
practice buttons, and the sentence list and Your reports after the path.

**Offline is a page of its own** (`#/<course>/<orthography>/offline`): what works on this device
with no network, and each unit's media to download or remove. It is no longer a panel after the
whole path. The offline notice stays on the course page.

## Consequences

- A returning learner is one press from their next lesson: open the app (or tap a reminder), then
  Continue. The course page is no longer on that way, but stays a press away.
- The course page opens at Continue's node and shows only the units under way, so after a placement
  test the next lesson is in view rather than 18 finished lessons above it. A finished lesson or
  story is a press further away (open its unit).
- Home reads each course's latest start on every visit, without reading the whole log. It also loads
  the course it continues and replays the learner's state in it, as opening that course does. The
  game state still reads the whole log on Home, as before.
- Courses are ordered by the device time of their latest starts; within a course, the store reads
  events in id order. Ids made from a clock that disagrees with the event's own time (only tests
  write such logs) can make the store take an earlier start of a course for its latest.
- Continue never says "0 words are slipping": practice with nothing slipping comes only once the
  path is done, and the line then says so (course page and Home).
- Not done:
  - which units are open is not remembered once the page is left;
  - the end of a session still says "Next: Lesson N" by the lesson's number on the whole path, and
    its "practice first" line can say that no word is slipping when the path is done;
  - "Review" stays the second action in the practice row, not beside Continue;
  - a new learner still meets the two practice buttons disabled until a lesson is done.
