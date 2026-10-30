import { Hammer } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

/** Stands in for sections that are listed in the sidebar but built in a later phase. Deleted in Phase 6. */
export function ComingSoonPage({ title, phase }: { title: string; phase: number }) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} />
      <EmptyState
        icon={Hammer}
        title="Coming soon"
        description={`This section is built in Phase ${phase}.`}
      />
    </>
  );
}
