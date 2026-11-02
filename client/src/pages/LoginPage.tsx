import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ApiError } from "../services/api";
import { getErrorMessage } from "../utils/errors";
import { validateEmail } from "../utils/validation";

/** Never reveals whether the email exists: a 401 is always "incorrect email or password". */
function loginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401) return "Incorrect email or password.";
    if (error.status === 429) return "Too many attempts. Wait a few minutes and try again.";
  }
  return getErrorMessage(error, "Could not sign in. Please try again.");
}

export function LoginPage() {
  useDocumentTitle("Sign in");
  const { login } = useAuth();
  const location = useLocation();
  const expired = (location.state as { expired?: boolean } | null)?.expired === true;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  // On success AuthProvider stores the user and PublicOnlyRoute redirects (to the page you came from, or "/")
  const mutation = useMutation({ mutationFn: login });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = {
      email: validateEmail(email) ?? undefined,
      password: password ? undefined : "Enter your password.",
    };
    setErrors(next);
    if (next.email || next.password) return;
    mutation.mutate({ email: email.trim(), password });
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-1 text-sm text-fg-muted">Welcome back. Enter your details to continue.</p>

      {expired && !mutation.error && (
        <Alert tone="info" className="mt-4">
          Your session expired. Please sign in again.
        </Alert>
      )}
      {mutation.error && (
        <Alert tone="error" className="mt-4">
          {loginErrorMessage(mutation.error)}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
          autoFocus
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Sign in
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-fg-muted">
        New here?{" "}
        <Link
          to="/register"
          state={location.state}
          className="font-medium text-brand hover:underline"
        >
          Create an account
        </Link>
      </p>
    </>
  );
}
