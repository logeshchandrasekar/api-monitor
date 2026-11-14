import { CirclePause, CirclePlay, Copy, Pencil, Play, Trash2 } from "lucide-react";
import { useState } from "react";
import { useMonitorActions } from "../../hooks/useMonitorMutations";
import { Button } from "../ui/Button";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Menu } from "../ui/Menu";

/**
 * Check now is the one primary action, Pause or Resume sits beside it, and the rarer ones (Edit, Duplicate,
 * Delete) live in a "More" menu. Every action shows loading and a toast; Delete asks first.
 */
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
        <Button size="sm" onClick={() => checkNow.mutate()} loading={checkNow.isPending}>
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

        <Menu
          label="More actions"
          items={[
            { label: "Edit", icon: Pencil, to: `/monitors/${id}/edit` },
            {
              label: "Duplicate",
              icon: Copy,
              onSelect: () => duplicate.mutate(),
              disabled: duplicate.isPending,
            },
            { label: "Delete", icon: Trash2, danger: true, onSelect: () => setConfirmDelete(true) },
          ]}
        />
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
