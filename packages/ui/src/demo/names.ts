/**
 * The demo courses' names (ADR 0109), read from courses/<id>/course.yaml at build time as the
 * profiles are: the card names its course as the app does, in the UI language where the course
 * gives one.
 */
import type { CourseNames } from "@nabu/schema";
import { parse } from "yaml";
import apc from "../../../../courses/apc/course.yaml?raw";
import fa from "../../../../courses/fa/course.yaml?raw";
import uz from "../../../../courses/uz/course.yaml?raw";
import yue from "../../../../courses/yue/course.yaml?raw";
import type { CourseKey } from "./fixtures.ts";

const namesOf = (source: string): CourseNames | undefined => (parse(source) as { names?: CourseNames }).names;

export const DEMO_COURSE_NAMES: Readonly<Record<CourseKey, CourseNames | undefined>> = { apc: namesOf(apc), fa: namesOf(fa), uz: namesOf(uz), yue: namesOf(yue) };
