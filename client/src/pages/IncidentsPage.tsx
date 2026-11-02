import { TriangleAlert } from "lucide-react";
import { EmptyState } from "../components/EmptyState";
import { PageHeader } from "../components/PageHeader";
import { useDocumentTitle } from "../hooks/useDocumentTitle";

export function IncidentsPage() {
  useDocumentTitle("Incidents");
  return (
    <>
      <PageHeader title="Incidents" />
      <EmptyState
        icon={TriangleAlert}
        title="Incidents are coming in Phase 6"
        description="The incident list and the live open-incident view are built next."
      />
    </>
  );
}
