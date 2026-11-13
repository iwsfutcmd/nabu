/**
 * Screens as assistive tech meets them (WCAG 2.4.2, 2.4.3, 4.1.3). Every route has a document
 * title: the screen, its course, the app. When the route changes, the page starts again at its
 * top and focus moves to the new screen's h1 (its main, if it has none) once the screen is there,
 * not while it loads; so a screen reader says where the learner is, and the next Tab starts from
 * there instead of from the link that went away. A screen that takes focus itself (a lesson's first
 * answer) keeps it. Nothing here acts within a screen: the lesson player moves focus between its
 * own cards (focusInReach).
 */
import { pathNodes, type SessionRequest } from "@nabu/core/learner";
import { scriptNodes, type CourseView } from "@nabu/core/lesson";
import { useTranslator } from "@nabu/ui";
import { useEffect, useRef, type JSX, type ReactNode } from "react";
import type { Route } from "./App.tsx";
import styles from "./App.module.css";

type Translator = ReturnType<typeof useTranslator>;
/** What the app calls a course and its orthographies, by the course's id (ADR 0109: course data). */
export type Names = { readonly course: (id: string) => string; readonly orthography: (course: string, orthography: string) => string };

/** What a session is called: "Lesson 3" or "Letters 1" as the course path numbers them, "Review", "Mistakes", the placement test. */
export const sessionName = (t: Translator, request: SessionRequest, course: CourseView | undefined): string => {
  if (request.mode === "review") return t.format("app.practice.review");
  if (request.mode === "mistakes") return t.format("app.practice.mistakes");
  if (request.mode === "placement") return t.format("app.session.placement");
  const letters = course === undefined ? -1 : scriptNodes(course).findIndex((s) => s.node.id === request.node);
  if (letters >= 0) return t.format("app.path.letters", { number: letters + 1 });
  const lesson = course === undefined ? -1 : pathNodes(course).filter((e) => e.kind === "lesson").findIndex((e) => e.node.id === request.node);
  return lesson >= 0 ? t.format("app.lessons.lesson", { number: lesson + 1 }) : t.format("app.lessons.title");
};

/** The document title of a route; a session's needs its course, once loaded, for the lesson's number. */
export const titleOf = (t: Translator, route: Route, names: Names, course: CourseView | undefined): string => {
  const app = t.format("app.name");
  const page = (name: string): string => t.format("app.title.page", { page: name, app });
  const inCourse = (name: string, id: string): string => t.format("app.title.in-course", { page: name, course: names.course(id), app });
  switch (route.tag) {
    case "home":
      return app;
    case "preferences":
      return page(t.format("preferences.title"));
    case "review":
      return page(t.format("review.workspace.title"));
    case "course":
      return t.format("app.title.course", { course: names.course(route.course), orthography: names.orthography(route.course, route.orthography), app });
    case "session":
      return inCourse(sessionName(t, route.request, course), route.course);
    case "story":
      return inCourse(t.format("app.path.story"), route.course);
    case "roleplay":
      return inCourse(t.format("app.path.conversation"), route.course);
    case "sentences":
      return inCourse(t.format("corrections.page.title"), route.course);
    case "words":
      return inCourse(t.format("words.title"), route.course);
    case "reports":
      return inCourse(t.format("reports.title"), route.course);
    case "cards":
      return inCourse(t.format("debug.cards.title"), route.course);
    case "audio":
      return inCourse(t.format("audio.check.title"), route.course);
    case "review-course":
      return inCourse(t.format("review.workspace.title"), route.course);
  }
};

/**
 * Keeps the document title, and on a change of `screen` (the route) brings the page to its top
 * and focus to the new screen's heading, as soon as one renders that is not loading.
 */
export const useScreen = (screen: string, title: string): void => {
  useEffect(() => {
    document.title = title;
  }, [title]);
  const shown = useRef(screen);
  const pending = useRef(false);
  // After every render: the screen may come only after its course loads.
  useEffect(() => {
    if (shown.current !== screen) {
      shown.current = screen;
      pending.current = true;
      window.scrollTo({ top: 0 });
    }
    if (!pending.current) return;
    const main = document.querySelector("main");
    if (main === null || main.querySelector("[data-loading]") !== null) return;
    pending.current = false;
    focusScreen();
  });
};

/**
 * Focus to the screen's heading (its main, if it has none): on a new screen, and where a screen
 * changes in place (a placement test starting after its introduction). Not when the screen put
 * focus somewhere of its own as it opened (the first answer of a lesson).
 */
export const focusScreen = (): void => {
  const main = document.querySelector("main");
  if (main === null || main.contains(document.activeElement)) return;
  const target = main.querySelector("h1") ?? main;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
};

/** A screen that is still loading: inside <main>, and said politely. */
export const Loading = (): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page}>
      <p role="status" data-loading="">
        {t.format("player.loading")}
      </p>
    </main>
  );
};

/** The heading of a screen whose design shows none (the lesson player): for assistive tech, and to take focus as it opens. */
export const ScreenHeading = ({ children }: { readonly children: ReactNode }): JSX.Element => (
  <h1 className={styles.visuallyHidden} data-screen-heading="">
    {children}
  </h1>
);
