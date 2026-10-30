import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FormAlert } from "../components/FormAlert";
import { Input } from "../components/Input";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ApiError } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { validateEmail } from "../utils/validation";

export function LoginPage() {
  useDocumentTitle("Log in");
  const { login } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const next = {
      email: validateEmail(email) ?? undefined,
      password: password ? undefined : "Enter your password.",
    };
    setErrors(next);
    if (next.email || next.password) return;

    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      // No navigation here: PublicOnlyRoute sees the new user and sends you to where you were going
    } catch (err) {
      setSubmitting(false);
      // Deliberately vague: do not reveal whether the email exists
      setFormError(
        err instanceof ApiError && err.status === 401
          ? "Incorrect email or password."
          : getErrorMessage(err),
      );
    }
  }

  return (
    <Card title="Log in" description="Welcome back. Log in to see your monitors.">
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Log in
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
        New here?{" "}
        <Link
          to="/register"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Create an account
        </Link>
      </p>
    </Card>
  );
}
