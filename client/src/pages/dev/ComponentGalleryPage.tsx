import { Inbox } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "../../components/EmptyState";
import { ErrorState } from "../../components/ErrorState";
import { PageHeader } from "../../components/PageHeader";
import { StatusBadge } from "../../components/StatusBadge";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { Card } from "../../components/ui/Card";
import { ConfirmDialog } from "../../components/ui/ConfirmDialog";
import { Input } from "../../components/ui/Input";
import { Modal } from "../../components/ui/Modal";
import { Select } from "../../components/ui/Select";
import { Skeleton } from "../../components/ui/Skeleton";
import { Spinner } from "../../components/ui/Spinner";
import { useDocumentTitle } from "../../hooks/useDocumentTitle";
import { DISPLAY_STATUSES, getDisplayStatus } from "../../utils/status";

export default function ComponentGalleryPage() {
  useDocumentTitle("Components");
  const [modalOpen, setModalOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [crash, setCrash] = useState(false);
  if (crash) throw new Error("Test error thrown from the component gallery"); // the root ErrorBoundary catches this

  return (
    <>
      <PageHeader
        title="Component gallery"
        description="Development only. Check each piece in both themes and at 375 px."
      />
      <div className="space-y-6">
        <Card
          title="Status badges (UX-1)"
          description="The five display states, plus getDisplayStatus() on server-shaped data."
        >
          <div className="flex flex-wrap gap-3">
            {DISPLAY_STATUSES.map((s) => (
              <StatusBadge key={s} status={s} />
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-fg-muted">
            <span>New monitor:</span>
            <StatusBadge
              size="sm"
              status={getDisplayStatus({ status: "PENDING", isPaused: false })}
            />
            <span>Down but paused:</span>
            <StatusBadge size="sm" status={getDisplayStatus({ status: "DOWN", isPaused: true })} />
          </div>
        </Card>

        <Card title="Buttons">
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
            <Button loading>Saving</Button>
            <Button disabled>Disabled</Button>
            <Button size="sm">Small</Button>
          </div>
        </Card>

        <Card title="Form fields">
          <div className="grid max-w-md gap-4">
            <Input label="Normal" placeholder="https://api.example.com/health" />
            <Input label="With hint" hint="Only the host and path are shown to others." />
            <Input label="With error" defaultValue="oops" error="This value is not valid." />
            <Select label="Method" defaultValue="GET">
              <option>GET</option>
              <option>HEAD</option>
              <option>POST</option>
            </Select>
          </div>
        </Card>

        <Card title="Loading, empty and error states">
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              <Spinner />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-8 w-8 rounded-full" />
            </div>
            <EmptyState
              icon={Inbox}
              title="Nothing here yet"
              description="This is what an empty list looks like."
              action={<Button size="sm">Add something</Button>}
            />
            <ErrorState
              title="Could not load monitors"
              message="The server had a problem. Please try again in a moment."
              onRetry={() => toast.info("Retry clicked")}
            />
            <Alert tone="error">Incorrect email or password.</Alert>
            <Alert tone="info">Your session expired. Please sign in again.</Alert>
            <Alert tone="success">Changes saved.</Alert>
          </div>
        </Card>

        <Card title="Dialogs, toasts and the error boundary">
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={() => setModalOpen(true)}>
              Open modal
            </Button>
            <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
              Open confirm
            </Button>
            <Button variant="secondary" onClick={() => toast.success("Saved")}>
              Success toast
            </Button>
            <Button
              variant="secondary"
              onClick={() => toast.error("Could not save. Please try again.")}
            >
              Error toast
            </Button>
            <Button variant="danger" onClick={() => setCrash(true)}>
              Throw a render error
            </Button>
          </div>
        </Card>
      </div>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example dialog"
        description="Esc, a click outside and Tab trapping all work."
        footer={<Button onClick={() => setModalOpen(false)}>Done</Button>}
      >
        <Input label="Type something" />
      </Modal>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          setConfirmOpen(false);
          toast.success("Deleted (not really)");
        }}
        title="Delete this monitor?"
        description="Its checks and incidents are deleted with it. This cannot be undone."
        confirmLabel="Delete"
      />
    </>
  );
}
