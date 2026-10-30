import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { FormAlert } from "../components/FormAlert";
import { Input } from "../components/Input";
import { PageHeader } from "../components/PageHeader";
import { Select } from "../components/Select";
import { useAuth } from "../hooks/useAuth";
import { useDocumentTitle } from "../hooks/useDocumentTitle";
import { useTheme } from "../hooks/useTheme";
import { ApiError } from "../services/api";
import { changePassword, updateName } from "../services/users";
import type { ThemePreference } from "../context/theme";
import { fieldErrorsFrom, getErrorMessage } from "../utils/errors";
import { queryKeys } from "../utils/queryKeys";
import { validateConfirmation, validateName, validateNewPassword } from "../utils/validation";

function ProfileCard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [name, setName] = useState(user?.name ?? "");
  const [nameError, setNameError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const unchanged = name.trim() === (user?.name ?? "");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const problem = validateName(name);
    setNameError(problem);
    if (problem) return;

    setSaving(true);
    try {
      await updateName(name.trim());
      await queryClient.invalidateQueries({ queryKey: queryKeys.me }); // the whole app re-reads the user
      setName(name.trim());
      toast.success("Name updated.");
    } catch (err) {
      const fromServer = fieldErrorsFrom(err);
      if (fromServer.name) setNameError(fromServer.name);
      else setFormError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Profile" description="How your name appears in the app.">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        <FormAlert message={formError} />
        <Input
          label="Name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={nameError}
        />
        <Input
          label="Email"
          value={user?.email ?? ""}
          disabled
          hint="Your email address cannot be changed yet."
          readOnly
        />
        <Button type="submit" loading={saving} disabled={unchanged}>
          Save changes
        </Button>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<{ current?: string; next?: string; confirm?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const local = {
      current: current ? undefined : "Enter your current password.",
      next:
        validateNewPassword(next) ??
        (next === current && current ? "Choose a different password." : undefined),
      confirm: validateConfirmation(next, confirm) ?? undefined,
    };
    setErrors(local);
    if (local.current || local.next || local.confirm) return;

    setSaving(true);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Password changed.");
    } catch (err) {
      const fromServer = fieldErrorsFrom(err);
      if (err instanceof ApiError && err.code === "INVALID_CURRENT_PASSWORD") {
        setErrors({ current: "That is not your current password." });
      } else if (fromServer.currentPassword || fromServer.newPassword) {
        setErrors({ current: fromServer.currentPassword, next: fromServer.newPassword });
      } else {
        setFormError(getErrorMessage(err));
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Password" description="Use a long, unique password.">
      <form onSubmit={onSubmit} noValidate className="max-w-md space-y-4">
        <FormAlert message={formError} />
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          error={errors.current}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          error={errors.next}
        />
        <Input
          label="Repeat new password"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={errors.confirm}
        />
        <Button type="submit" loading={saving}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function AppearanceCard() {
  const { preference, setPreference } = useTheme();
  return (
    <Card title="Appearance" description="Saved in this browser.">
      <Select
        label="Theme"
        className="max-w-md"
        value={preference}
        onChange={(e) => setPreference(e.target.value as ThemePreference)}
      >
        <option value="system">Match my system</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </Select>
    </Card>
  );
}

export function SettingsPage() {
  useDocumentTitle("Settings");
  return (
    <div className="space-y-6">
      <PageHeader title="Settings" description="Manage your account and how the app looks." />
      <ProfileCard />
      <PasswordCard />
      <AppearanceCard />
    </div>
  );
}
