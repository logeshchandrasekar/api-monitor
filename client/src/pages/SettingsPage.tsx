import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { Input } from "../components/ui/Input";
import type { ThemePreference } from "../context/themeContext";
import { useCurrentUser } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useTheme } from "../hooks/useTheme";
import { ApiError } from "../services/api";
import { queryKeys } from "../services/queryKeys";
import { usersApi } from "../services/userApi";
import { cn } from "../utils/cn";
import { fieldErrorsFrom, getErrorMessage } from "../utils/errors";
import { PASSWORD_MIN_LENGTH, validateName, validateNewPassword } from "../utils/validation";

const PLAN_LABEL = { FREE: "Free", PRO: "Pro", TEAM: "Team" } as const;

function ProfileCard() {
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user.name);
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: usersApi.updateName,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.me }); // refetch /auth/me: the top bar picks up the new name
      toast.success("Profile updated");
    },
    onError: (e) => setError(fieldErrorsFrom(e).name ?? getErrorMessage(e)),
  });

  const unchanged = name.trim() === user.name;

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validateName(name);
    setError(problem ?? undefined);
    if (!problem) mutation.mutate(name.trim());
  }

  return (
    <Card title="Profile" description="How you appear in the app.">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        <Input
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={error}
        />
        <Input
          label="Email"
          value={user.email}
          disabled
          readOnly
          hint="Your email cannot be changed."
        />
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-fg-muted">Plan: {PLAN_LABEL[user.plan]}</span>
          <Button type="submit" loading={mutation.isPending} disabled={unchanged}>
            Save changes
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [banner, setBanner] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: usersApi.changePassword,
    onSuccess: () => {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setErrors({});
      setBanner(null);
      toast.success("Password changed");
    },
    onError: (e) => {
      // A wrong current password is a 400 INVALID_CURRENT_PASSWORD (never 401), so it does not log you out
      if (e instanceof ApiError && e.code === "INVALID_CURRENT_PASSWORD") {
        setErrors({ current: "That is not your current password." });
        setBanner(null);
        return;
      }
      const fields = fieldErrorsFrom(e);
      if (fields.currentPassword || fields.newPassword) {
        setErrors({ current: fields.currentPassword, next: fields.newPassword });
        setBanner(null);
      } else {
        setBanner(getErrorMessage(e, "Could not change your password. Please try again."));
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const next = {
      current: currentPassword ? undefined : "Enter your current password.",
      next: validateNewPassword(newPassword) ?? undefined,
      confirm: confirm === newPassword ? undefined : "The passwords do not match.",
    };
    setErrors(next);
    setBanner(null);
    if (next.current || next.next || next.confirm) return;
    mutation.mutate({ currentPassword, newPassword });
  }

  return (
    <Card title="Password" description="Use a long, unique password.">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        {banner && <Alert tone="error">{banner}</Alert>}
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          error={errors.current}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          error={errors.next}
          hint={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
        <Input
          label="Confirm new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={mutation.isPending}>
            Change password
          </Button>
        </div>
      </form>
    </Card>
  );
}

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

function AppearanceCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card
      title="Appearance"
      description="System follows your operating system's light or dark setting."
    >
      <div
        role="radiogroup"
        aria-label="Theme"
        className="inline-flex rounded-lg border border-line p-1"
      >
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={preference === option.value}
            onClick={() => setPreference(option.value)}
            className={cn(
              "rounded-md px-4 py-1.5 text-sm font-medium transition-colors",
              preference === option.value
                ? "bg-brand text-brand-fg"
                : "text-fg-muted hover:text-fg",
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </Card>
  );
}

export function SettingsPage() {
  useDocumentTitle("Settings");
  return (
    <>
      <PageHeader title="Settings" description="Manage your account and how the app looks." />
      <div className="space-y-6">
        <ProfileCard />
        <PasswordCard />
        <AppearanceCard />
      </div>
    </>
  );
}
