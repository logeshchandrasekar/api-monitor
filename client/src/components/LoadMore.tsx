import { Button } from "./ui/Button";

/** The "Load more" button under a cursor-paginated list. Renders nothing when there is no next page. */
export function LoadMore({
  hasNextPage,
  loading,
  onClick,
}: {
  hasNextPage: boolean;
  loading: boolean;
  onClick: () => void;
}) {
  if (!hasNextPage) return null;
  return (
    <div className="mt-4 flex justify-center">
      <Button variant="secondary" onClick={onClick} loading={loading}>
        Load more
      </Button>
    </div>
  );
}
