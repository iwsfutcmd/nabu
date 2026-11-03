/**
 * The Phase 3 web client: a course list, a course's lessons, and the lesson
 * player. Routes live in the URL hash so the static build works anywhere
 * (GitHub Pages): #/ · #/<course>/<orthography> · #/<course>/<orthography>/<node>.
 * The learner model, store and real path arrive in Phase 4.
 */
import { buildLesson, createGrader, lessonNodes, type CourseView, type LessonEvent } from "@nabu/core/lesson";
import { directionOf } from "@nabu/i18n";
import { T, useTranslator } from "@nabu/ui";
import { fetchCourse, fetchCourseIndex, LessonPlayer, type CourseIndexEntry, type LoadedCourse } from "@nabu/ui/player";
import { useEffect, useMemo, useState, type JSX } from "react";
import styles from "./App.module.css";

const BUNDLES = `${import.meta.env.BASE_URL}bundles/`;

type Route =
  | { readonly tag: "home" }
  | { readonly tag: "course"; readonly course: string; readonly orthography: string }
  | { readonly tag: "lesson"; readonly course: string; readonly orthography: string; readonly node: string };

/** Orthography ids carry a "/" (fa-Arab/standard): "." in the URL. */
const slug = (orthography: string): string => orthography.replace("/", ".");
const unslug = (s: string): string => s.replace(".", "/");

const parse = (hash: string): Route => {
  const [course, orthography, node] = hash.replace(/^#\/?/u, "").split("/").filter((p) => p !== "").map(decodeURIComponent);
  if (course === undefined || orthography === undefined) return { tag: "home" };
  if (node === undefined) return { tag: "course", course, orthography: unslug(orthography) };
  return { tag: "lesson", course, orthography: unslug(orthography), node };
};

export const href = (route: Route): string =>
  route.tag === "home"
    ? "#/"
    : route.tag === "course"
      ? `#/${route.course}/${slug(route.orthography)}`
      : `#/${route.course}/${slug(route.orthography)}/${encodeURIComponent(route.node)}`;

const useRoute = (): Route => {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const onChange = (): void => setRoute(parse(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
};

const courseName = (t: ReturnType<typeof useTranslator>, id: string): string => {
  const key = `course.name.${id}`;
  return t.has(key) ? t.format(key) : id;
};

const orthographyName = (t: ReturnType<typeof useTranslator>, id: string): string => {
  const key = `orthography.${slug(id)}`;
  return t.has(key) ? t.format(key) : id;
};

const Home = ({ courses }: { courses: readonly CourseIndexEntry[] }): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page}>
      <h1 className={styles.heading}>{t.format("app.home.title")}</h1>
      <ul className={styles.list} data-course-list="">
        {courses.map((c) => (
          <li key={c.id} className={styles.course} data-course={c.id}>
            <h2 className={styles.courseName}>{courseName(t, c.id)}</h2>
            {c.orthographies.length > 1 && <p className={styles.muted}>{t.format("app.home.writing")}</p>}
            <div className={styles.links}>
              {c.orthographies.map((o) => (
                <a key={o} className={styles.link} href={href({ tag: "course", course: c.id, orthography: o })} data-orthography={o}>
                  {orthographyName(t, o)}
                </a>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
};

const Lessons = ({ loaded, orthography }: { loaded: LoadedCourse; orthography: string }): JSX.Element => {
  const t = useTranslator();
  const { course } = loaded;
  const nodes = lessonNodes(course);
  return (
    <main className={styles.page}>
      <p>
        <a className={styles.back} href={href({ tag: "home" })}>
          {t.format("app.lessons.back")}
        </a>
      </p>
      <h1 className={styles.heading}>
        {courseName(t, course.id)} · {orthographyName(t, orthography)}
      </h1>
      <h2 className={styles.subheading}>{t.format("app.lessons.title")}</h2>
      <ol className={styles.list} data-lesson-list="">
        {nodes.map(({ node, unit }, i) => {
          const words = node.introduces.flatMap((id) => unit.kcs.find((k) => k.id === id)?.forms?.[orthography]?.[0] ?? []);
          return (
            <li key={node.id}>
              <a className={styles.lesson} href={href({ tag: "lesson", course: course.id, orthography, node: node.id })} data-lesson={node.id}>
                <span className={styles.lessonName}>{t.format("app.lessons.lesson", { number: i + 1 })}</span>
                <span className={styles.preview} role="group" aria-label={t.format("app.lessons.new-words")} dir={words[0] === undefined ? undefined : directionOf(words[0].lang)}>
                  {words.map((w, k) => (
                    <T key={k} text={w} />
                  ))}
                </span>
              </a>
            </li>
          );
        })}
      </ol>
    </main>
  );
};

/** The lesson seed: ?seed=… for reproducible runs (tests), else fresh randomness. */
const seedFor = (): number => {
  const param = new URLSearchParams(window.location.search).get("seed");
  if (param !== null && /^\d+$/u.test(param)) return Number(param);
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
};

const Play = ({ loaded, node, orthography, onEvent }: { loaded: LoadedCourse; node: string; orthography: string; onEvent: (e: LessonEvent) => void }): JSX.Element => {
  const t = useTranslator();
  const { course, imageUrl } = loaded;
  const [seed] = useState(seedFor);
  const exercises = useMemo(() => buildLesson(course, node, { seed }), [course, node, seed]);
  const grader = useMemo(() => createGrader(course), [course]);
  const sound = new URLSearchParams(window.location.search).get("sound") !== "off";
  return (
    <main className={styles.player}>
      <LessonPlayer
        key={`${node}:${seed}`}
        course={course}
        lessonId={node}
        exercises={exercises}
        grader={grader}
        imageUrl={imageUrl}
        language={courseName(t, course.id)}
        onEvent={onEvent}
        sound={sound}
        onExit={() => {
          window.location.hash = href({ tag: "course", course: course.id, orthography });
        }}
      />
    </main>
  );
};

/** Learner events (§9.6) of this page session; Phase 4 stores them. Exposed for tests and debugging. */
const events: LessonEvent[] = [];
declare global {
  interface Window {
    nabuEvents?: readonly LessonEvent[];
  }
}
window.nabuEvents = events;

export const App = (): JSX.Element => {
  const t = useTranslator();
  const route = useRoute();
  const [index, setIndex] = useState<readonly CourseIndexEntry[] | null>(null);
  const [loaded, setLoaded] = useState<{ key: string; value: LoadedCourse } | { key: string; error: string } | null>(null);
  const courseKey = route.tag === "home" ? null : `${route.course}:${route.orthography}`;

  useEffect(() => {
    void fetchCourseIndex(BUNDLES).then(setIndex);
  }, []);
  useEffect(() => {
    if (route.tag === "home" || courseKey === null || loaded?.key === courseKey) return;
    fetchCourse(BUNDLES, route.course, route.orthography).then(
      (value) => setLoaded({ key: courseKey, value }),
      (e: unknown) => setLoaded({ key: courseKey, error: String(e) }),
    );
  }, [route, courseKey, loaded]);

  if (route.tag === "home") {
    return index === null ? <p className={styles.page}>{t.format("player.loading")}</p> : <Home courses={index} />;
  }
  if (loaded === null || loaded.key !== courseKey) return <p className={styles.page}>{t.format("player.loading")}</p>;
  if ("error" in loaded) return <p className={styles.page} role="alert">{t.format("app.error.load")}</p>;
  const course: CourseView = loaded.value.course;
  if (route.tag === "course") return <Lessons loaded={loaded.value} orthography={route.orthography} />;
  return <Play loaded={loaded.value} node={route.node} orthography={course.orthography} onEvent={(e) => events.push(e)} />;
};
