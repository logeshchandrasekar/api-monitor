import { X } from "lucide-react";
import { useId, useState, type KeyboardEvent } from "react";
import { MAX_TAGS, normalizeTag, tagProblem } from "../../utils/monitorForm";
import { Input } from "../ui/Input";

type Props = {
  value: string[];
  onChange: (tags: string[]) => void;
  /** An error from the form (for example the server refused a tag). */
  error?: string;
  /** Tags already used on other monitors, offered as you type. */
  suggestions?: string[];
};

/**
 * Tags as chips. Type a tag and press Enter or comma (or just move on) to add it; Backspace in the empty box
 * removes the last one. A tag is shown the way it will be saved: trimmed and lower-case.
 */
export function TagsInput({ value, onChange, error, suggestions = [] }: Props) {
  const listId = useId();
  const [draft, setDraft] = useState("");
  const [problem, setProblem] = useState<string | undefined>();

  function commit() {
    const tag = normalizeTag(draft);
    if (!tag) {
      setDraft("");
      return;
    }
    const issue =
      tagProblem(tag) ?? (value.length >= MAX_TAGS ? `At most ${MAX_TAGS} tags.` : null);
    if (issue) {
      setProblem(issue); // keep the text so it can be fixed
      return;
    }
    setProblem(undefined);
    setDraft("");
    if (!value.includes(tag)) onChange([...value, tag]);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault(); // Enter must not submit the form
      commit();
    } else if (event.key === "Backspace" && draft === "" && value.length > 0) {
      onChange(value.slice(0, -1));
    }
  }

  const unused = suggestions.filter((s) => !value.includes(s));

  return (
    <div>
      <Input
        label="Tags (optional)"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setProblem(undefined);
        }}
        onKeyDown={onKeyDown}
        onBlur={commit}
        list={unused.length > 0 ? listId : undefined}
        error={problem ?? error}
        hint={`Press Enter to add. Up to ${MAX_TAGS} tags, for example production or client a.`}
        autoComplete="off"
        spellCheck={false}
        maxLength={60}
      />
      {unused.length > 0 && (
        <datalist id={listId}>
          {unused.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      )}
      {value.length > 0 && (
        <ul aria-label="Tags on this monitor" className="mt-2 flex flex-wrap gap-1.5">
          {value.map((tag) => (
            <li
              key={tag}
              className="inline-flex items-center gap-1 rounded-full border border-line bg-subtle py-0.5 pr-1 pl-2.5 text-xs"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                onClick={() => onChange(value.filter((t) => t !== tag))}
                className="grid size-5 place-items-center rounded-full text-fg-muted hover:bg-line hover:text-fg"
              >
                <X className="size-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
