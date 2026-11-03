import { CirclePause, CirclePlay, Copy, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMonitorActions } from "../../hooks/useMonitorMutations";
import { Button } from "../ui/Button";
import { ButtonLink } from "../ui/ButtonLink";
import { ConfirmDialog } from "../ui/ConfirmDialog";

/** Check now, Pause or Resume, Edit, Duplicate and Delete (with a confirm dialog). Every action shows loading and a toast. */
export function MonitorActions({
  id,
  name,
  isPaused,
}: {
  id: string;
  name: string;
  isPaused: boolean;
}) {
  const { checkNow, pause, resume, duplicate, remove } = useMonitorActions(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => checkNow.mutate()}
          loading={checkNow.isPending}
        >
          {!checkNow.isPending && <Play className="size-4" aria-hidden="true" />}
          Check now
        </Button>

        {isPaused ? (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => resume.mutate()}
            loading={resume.isPending}
          >
            {!resume.isPending && <CirclePlay className="size-4" aria-hidden="true" />}
            Resume
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => pause.mutate()}
            loading={pause.isPending}
          >
            {!pause.isPending && <CirclePause className="size-4" aria-hidden="true" />}
            Pause
          </Button>
        )}

        <ButtonLink to={`/monitors/${id}/edit`} variant="secondary" size="sm">
          <Pencil className="size-4" aria-hidden="true" />
          Edit
        </ButtonLink>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => duplicate.mutate()}
          loading={duplicate.isPending}
        >
          {!duplicate.isPending && <Copy className="size-4" aria-hidden="true" />}
          Duplicate
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmDelete(true)}
          className="text-down-ink"
        >
          <Trash2 className="size-4" aria-hidden="true" />
          Delete
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => !remove.isPending && setConfirmDelete(false)}
        onConfirm={() => remove.mutate(undefined, { onError: () => setConfirmDelete(false) })}
        title={`Delete "${name}"?`}
        description="The monitor, its check history and its incidents are deleted for good. This cannot be undone."
        confirmLabel="Delete monitor"
        loading={remove.isPending}
      />
    </>
  );
}
