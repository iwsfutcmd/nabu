/**
 * A page that fails to render says so and offers a way on, never a blank screen. The boundary
 * resets when the address changes, so the next page renders as usual.
 */
import { useTranslator } from "@nabu/ui";
import { Component, type ErrorInfo, type JSX, type ReactNode } from "react";
import { href } from "./App.tsx";
import styles from "./App.module.css";

const Failed = (): JSX.Element => {
  const t = useTranslator();
  return (
    <main className={styles.page}>
      <p role="alert" data-page-error="">
        {t.format("app.error.page")}
      </p>
      <p>
        <a className={styles.back} href={href({ tag: "home" })}>
          {t.format("app.lessons.back")}
        </a>
      </p>
    </main>
  );
};

interface State {
  readonly failed: boolean;
}

// React catches render errors only in a class component's lifecycle methods.
export class ErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(error, info.componentStack);
  }

  override componentDidMount(): void {
    window.addEventListener("hashchange", this.reset);
  }

  override componentWillUnmount(): void {
    window.removeEventListener("hashchange", this.reset);
  }

  private readonly reset = (): void => {
    if (this.state.failed) this.setState({ failed: false });
  };

  override render(): ReactNode {
    return this.state.failed ? <Failed /> : this.props.children;
  }
}
