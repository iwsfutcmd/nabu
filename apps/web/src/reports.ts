/**
 * The report intake (ADR 0055).
 *
 * Every correction and every claim about an answer is sent at once to the deployment's intake: a
 * Firestore collection named in `reports.json` beside the app. A scheduled job then files it as a
 * GitHub issue for the course's reviewers. No account is needed.
 *
 * - **What is sent.** No device, user or session id (@nabu/core/reports `submissionOf`).
 * - **Offline.** Reports wait on the device and go when it is back online.
 * - **Retries.** A report is a document named by its event's id, so a retried send cannot
 *   duplicate it.
 * - **No intake.** With no `reports.json`, nothing is sent, and the app says nothing about it.
 */
import { intakeDocumentOf, REPORTS_COLLECTION, submissionOf } from "@nabu/core/reports";
import type { AnswerReported, ReportSubmission, SentenceReported } from "@nabu/schema";
import { useEffect, useState } from "react";

export interface ReportsConfig {
  readonly project: string;
  readonly apiKey: string;
  readonly collection: string;
}

const CONFIG_KEY = "nabu.reports.config";
const PENDING_KEY = "nabu.reports.pending";
const MAX_PENDING = 500;
/** Project ids, web API keys and collection names: nothing that could reshape the URL. */
const SAFE = /^[A-Za-z0-9_-]{1,128}$/u;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null): void => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Storage blocked (a private window): reports still go while the app is open and online.
  }
};

/** `{"firestore": {"project", "apiKey", "collection"?}}`, or null when it is not one. */
export const parseReportsConfig = (raw: unknown): ReportsConfig | null => {
  const f = typeof raw === "object" && raw !== null ? (raw as { readonly firestore?: unknown }).firestore : undefined;
  if (typeof f !== "object" || f === null) return null;
  const { project, apiKey, collection } = f as Readonly<Record<string, unknown>>;
  if (typeof project !== "string" || typeof apiKey !== "string" || !SAFE.test(project) || !SAFE.test(apiKey)) return null;
  return { project, apiKey, collection: typeof collection === "string" && SAFE.test(collection) ? collection : REPORTS_COLLECTION };
};

/** The deployment's intake: `reports.json` beside the app, remembered for starts without a network. */
export const loadReportsConfig = async (base: string): Promise<ReportsConfig | null> => {
  try {
    const res = await fetch(`${base}reports.json`, { cache: "no-cache" });
    if (res.status === 404) {
      write(CONFIG_KEY, null);
      return null;
    }
    if (res.ok) {
      const config = parseReportsConfig(await res.json());
      write(CONFIG_KEY, config === null ? null : JSON.stringify({ firestore: config }));
      return config;
    }
  } catch {
    // Offline, or not JSON: fall back to the remembered intake.
  }
  try {
    const remembered = read(CONFIG_KEY);
    return remembered === null ? null : parseReportsConfig(JSON.parse(remembered));
  } catch {
    return null;
  }
};

export interface ReportSender {
  /** Queues the report and sends what is waiting. */
  readonly submit: (event: SentenceReported | AnswerReported) => void;
  /** Sends what is waiting, oldest first; stops at the first that cannot go yet. */
  readonly flush: () => Promise<void>;
}

type Sent = "done" | "drop" | "retry";

export const createReportSender = (config: ReportsConfig, send: typeof fetch = (...args) => fetch(...args), now: () => Date = () => new Date()): ReportSender => {
  const pending = (): ReportSubmission[] => {
    try {
      const raw = read(PENDING_KEY);
      return raw === null ? [] : (JSON.parse(raw) as ReportSubmission[]);
    } catch {
      return [];
    }
  };
  const save = (list: readonly ReportSubmission[]): void => write(PENDING_KEY, list.length === 0 ? null : JSON.stringify(list.slice(-MAX_PENDING)));
  const url = (id: string): string =>
    `https://firestore.googleapis.com/v1/projects/${config.project}/databases/(default)/documents/${config.collection}?documentId=${encodeURIComponent(id)}&key=${encodeURIComponent(config.apiKey)}`;
  const post = async (s: ReportSubmission): Promise<Sent> => {
    try {
      const res = await send(url(s.id), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(intakeDocumentOf(s, now().toISOString())) });
      // 409: this report is there already (an earlier send got through).
      if (res.ok || res.status === 409) return "done";
      // Refused for good (the rules or the request): retrying would only block the queue.
      return res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429 ? "drop" : "retry";
    } catch {
      return "retry";
    }
  };
  let flushing: Promise<void> | null = null;
  const flush = (): Promise<void> => {
    flushing ??= (async () => {
      for (let next = pending()[0]; next !== undefined; next = pending()[0]) {
        const sent = await post(next);
        if (sent === "retry") return;
        const id = next.id;
        save(pending().filter((p) => p.id !== id));
      }
    })().finally(() => {
      flushing = null;
    });
    return flushing;
  };
  return {
    submit: (event) => {
      const s = submissionOf(event);
      const list = pending();
      if (!list.some((p) => p.id === s.id)) save([...list, s]);
      void flush();
    },
    flush,
  };
};

let intake: Promise<ReportSender | null> | undefined;

/** The app's intake, once: null when the deployment has none. */
export const reportIntake = (): Promise<ReportSender | null> =>
  (intake ??= loadReportsConfig(import.meta.env.BASE_URL).then((config) => {
    if (config === null) return null;
    const sender = createReportSender(config);
    window.addEventListener("online", () => void sender.flush());
    void sender.flush();
    return sender;
  }));

/** Whether reports go to an intake (and so become public issues): the app says so where one is made. */
export const useReportsPublic = (): boolean => {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let live = true;
    void reportIntake().then((sender) => {
      if (live) setOn(sender !== null);
    });
    return () => {
      live = false;
    };
  }, []);
  return on;
};
