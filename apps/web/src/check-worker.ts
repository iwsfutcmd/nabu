/**
 * The check of the server's projections (check.ts) in a worker of its own, off the main thread:
 * replaying a year of history takes seconds on a phone (ADR 0112). It opens the device's log itself
 * and answers with the verdict, with how the check failed, or that it cannot read the log here.
 */
import { checkProjections, failureOf, type CheckAnswer, type CheckOrder } from "./check.ts";
import { openStore } from "./store.ts";

const scope = self as unknown as { onmessage: ((e: MessageEvent<CheckOrder>) => void) | null; postMessage: (answer: CheckAnswer) => void };

const answer = async (order: CheckOrder): Promise<CheckAnswer> => {
  const store = await openStore();
  // Without IndexedDB here, the log this worker would read is not the app's: the app checks itself.
  if (!store.persistent) return { unavailable: true };
  return { verified: await checkProjections(store, order) };
};

scope.onmessage = (e) => {
  answer(e.data).then(
    (a) => scope.postMessage(a),
    (error: unknown) => scope.postMessage({ failed: failureOf(error) }),
  );
};
