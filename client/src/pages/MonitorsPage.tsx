import { Activity } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function MonitorsPage() {
  useDocumentTitle("Monitors");
  return (
    <>
      <PageHeader title="Monitors" />
      <EmptyState
        icon={Activity}
        title="Monitors are coming in Phase 6"
        description="The list, the create form and the monitor detail page are built next."
      />
    </>
  );
}
