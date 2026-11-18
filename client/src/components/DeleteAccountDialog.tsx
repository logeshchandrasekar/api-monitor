import { useMutation } from "@tanstack/react-query";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth";
import { ApiError } from "../services/api";
import { fieldErrorsFrom, getErrorMessage } from "../utils/errors";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Modal } from "./ui/Modal";

type Props = { open: boolean; onClose: () => void };

/**
 * Asks for the password again, then deletes the account. The form lives in its own component because Modal only
 * renders its content while open: every time the dialog opens, the password field starts empty.
 */
function DeleteForm({ onClose, formId }: { onClose: () => void; formId: string }) {
  const { deleteAccount } = useAuth();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: deleteAccount,
    onSuccess: () => {
      // The session has ended, so the route guard is already sending this person to the sign-in page
      toast.success("Your account has been deleted.");
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "INVALID_PASSWORD") {
        setError("That is not your password.");
        setBanner(null);
        return;
      }
      const field = fieldErrorsFrom(e).password;
      if (field) {
        setError(field);
        setBanner(null);
      } else {
        setBanner(getErrorMessage(e, "Could not delete your account. Please try again."));
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBanner(null);
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setError(undefined);
    mutation.mutate(password);
  }

  return (
    <>
      <form id={formId} onSubmit={onSubmit} noValidate className="space-y-4">
        {banner && <Alert tone="error">{banner}</Alert>}
        <Input
          label="Your password"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error}
        />
      </form>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
          Keep my account
        </Button>
        <Button type="submit" form={formId} variant="danger" loading={mutation.isPending}>
          Delete my account
        </Button>
      </div>
    </>
  );
}

export function DeleteAccountDialog({ open, onClose }: Props) {
  const formId = useId();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Delete your account?"
      description="This permanently deletes your monitors, their check history, incidents and alert settings. It cannot be undone."
    >
      <DeleteForm onClose={onClose} formId={formId} />
    </Modal>
  );
}
