import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ApiError } from "../services/api";
import { fieldErrorsFrom, getErrorMessage } from "../utils/errors";
import {
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateName,
  validateNewPassword,
} from "../utils/validation";

type Fields = { name?: string; email?: string; password?: string };

export function RegisterPage() {
  useDocumentTitle("Create account");
  const { register } = useAuth();
  const location = useLocation();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [clientErrors, setClientErrors] = useState<Fields>({});

  const mutation = useMutation({ mutationFn: register });

  // Server messages go under the matching field when the server says which field; otherwise in a banner
  const error = mutation.error;
  const serverFields: Fields = error ? fieldErrorsFrom(error) : {};
  if (error instanceof ApiError && error.status === 409 && !serverFields.email)
    serverFields.email = "An account with this email already exists.";
  const hasFieldError = Boolean(serverFields.name || serverFields.email || serverFields.password);
  const banner =
    error && !hasFieldError
      ? error instanceof ApiError && error.status === 429
        ? "Too many attempts. Wait a few minutes and try again."
        : getErrorMessage(error, "Could not create your account. Please try again.")
      : null;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next: Fields = {
      name: validateName(name) ?? undefined,
      email: validateEmail(email) ?? undefined,
      password: validateNewPassword(password) ?? undefined,
    };
    setClientErrors(next);
    if (next.name || next.email || next.password) return;
    mutation.mutate({ name: name.trim(), email: email.trim(), password });
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Create your account</h1>
      <p className="mt-1 text-sm text-fg-muted">Start monitoring your APIs in a few minutes.</p>

      {banner && (
        <Alert tone="error" className="mt-4">
          {banner}
        </Alert>
      )}

      <form onSubmit={onSubmit} noValidate className="mt-5 space-y-4">
        <Input
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={clientErrors.name ?? serverFields.name}
          autoFocus
        />
        <Input
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={clientErrors.email ?? serverFields.email}
        />
        <Input
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={clientErrors.password ?? serverFields.password}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <Button type="submit" className="w-full" loading={mutation.isPending}>
          Create account
        </Button>
      </form>

      <p className="mt-5 text-center text-sm text-fg-muted">
        Already have an account?{" "}
        <Link to="/login" state={location.state} className="font-medium text-brand hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}
