import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FormAlert } from "../components/FormAlert";
import { Input } from "../components/Input";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { ApiError } from "../services/api";
import { fieldErrorsFrom, getErrorMessage, type FieldErrors } from "../utils/errors";
import {
  MIN_PASSWORD_LENGTH,
  validateConfirmation,
  validateEmail,
  validateName,
  validateNewPassword,
} from "../utils/validation";

const FIELDS = ["name", "email", "password", "confirm"] as const;

export function RegisterPage() {
  useDocumentTitle("Create account");
  const { register } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const local: FieldErrors = {};
    const checks: Record<(typeof FIELDS)[number], string | null> = {
      name: validateName(name),
      email: validateEmail(email),
      password: validateNewPassword(password),
      confirm: validateConfirmation(password, confirm),
    };
    for (const field of FIELDS) {
      const message = checks[field];
      if (message) local[field] = message;
    }
    setErrors(local);
    if (Object.keys(local).length > 0) return;

    setSubmitting(true);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      toast.success("Account created. Welcome!");
      // PublicOnlyRoute now sees a logged-in user and moves you to the app
    } catch (err) {
      setSubmitting(false);
      const fromServer = fieldErrorsFrom(err);
      const shown: FieldErrors = {};
      for (const field of FIELDS) {
        const message = fromServer[field];
        if (message) shown[field] = message;
      }
      if (Object.keys(shown).length > 0) {
        setErrors(shown); // the server pointed at specific fields
      } else if (err instanceof ApiError && err.status === 409) {
        setErrors({ email: "An account with this email already exists. Try logging in." });
      } else {
        setErrors({});
        setFormError(getErrorMessage(err));
      }
    }
  }

  return (
    <Card
      title="Create your account"
      description="Start monitoring your APIs in a couple of minutes."
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <FormAlert message={formError} />
        <Input
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          autoFocus
        />
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          inputMode="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={errors.email}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
        />
        <Input
          label="Repeat password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" loading={submitting} className="w-full">
          Create account
        </Button>
      </form>
      <p className="mt-5 text-center text-sm text-slate-600 dark:text-slate-400">
        Already have an account?{" "}
        <Link
          to="/login"
          className="font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Log in
        </Link>
      </p>
    </Card>
  );
}
