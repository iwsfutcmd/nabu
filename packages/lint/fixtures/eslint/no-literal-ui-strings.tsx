// Fixture: every line marked `expect:` must be reported by that rule, and no other line may be.
declare const t: { format(id: string): string };
declare const ok: boolean;

export const Bad = () => (
  <section aria-label="Lesson">{/* expect: nabu/no-literal-ui-strings */}
    <h2>Translate this sentence</h2>{/* expect: nabu/no-literal-ui-strings */}
    <button title={"Close"}>×</button>{/* expect: nabu/no-literal-ui-strings */}
    <input placeholder={`Type here`} />{/* expect: nabu/no-literal-ui-strings */}
    <p>{"Check"}</p>{/* expect: nabu/no-literal-ui-strings */}
    <p>{ok ? "Correct" : t.format("x.y")}</p>{/* expect: nabu/no-literal-ui-strings */}
    <img alt="Duo" src="a.png" />{/* expect: nabu/no-literal-ui-strings */}
    <p>كتاب</p>{/* expect: nabu/no-literal-ui-strings */}
  </section>
);

export const imperative = (el: HTMLElement) => {
  el.textContent = "Well done!"; // expect: nabu/no-literal-ui-strings
  el.setAttribute("aria-label", "Next"); // expect: nabu/no-literal-ui-strings
  alert("Saved"); // expect: nabu/no-literal-ui-strings
};

export const Good = () => (
  <section aria-label={t.format("lesson.label")} data-kind="word" className="card">
    <h2>{t.format("exercise.instruction")}</h2>
    <span>· – 3/10 ✓ →</span>
    <p>{ok && t.format("feedback.correct")}</p>
  </section>
);

export const goodImperative = (el: HTMLElement) => {
  el.textContent = t.format("feedback.correct");
  el.setAttribute("data-kind", "word");
  el.className = "tile";
};
