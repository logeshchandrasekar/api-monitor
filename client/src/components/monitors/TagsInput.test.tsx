// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { TagsInput } from "./TagsInput";

function Harness({
  initial = [],
  onChange = () => {},
  suggestions,
}: {
  initial?: string[];
  onChange?: (t: string[]) => void;
  suggestions?: string[];
}) {
  const [tags, setTags] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        document.body.dataset.submitted = "yes";
      }}
    >
      <TagsInput
        value={tags}
        onChange={(t) => {
          setTags(t);
          onChange(t);
        }}
        suggestions={suggestions}
      />
    </form>
  );
}

const box = () => screen.getByLabelText("Tags (optional)");
const chips = () => screen.queryAllByRole("listitem").map((li) => li.textContent);

describe("TagsInput", () => {
  it("adds a tag with Enter, shows it as a chip, and does not submit the form", async () => {
    delete document.body.dataset.submitted;
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    await userEvent.type(box(), "production{Enter}");
    expect(chips()).toEqual(["production"]);
    expect(onChange).toHaveBeenLastCalledWith(["production"]);
    expect(box()).toHaveValue("");
    expect(document.body.dataset.submitted).toBeUndefined();
  });

  it("a comma also adds the tag", async () => {
    render(<Harness />);
    await userEvent.type(box(), "staging,client a,");
    expect(chips()).toEqual(["staging", "client a"]);
  });

  it("shows a tag the way it will be saved: trimmed, lower-case, one space between words", async () => {
    render(<Harness />);
    await userEvent.type(box(), "  Client   A  {Enter}");
    expect(chips()).toEqual(["client a"]);
  });

  it("moving on to another field adds what was typed", async () => {
    render(<Harness />);
    await userEvent.type(box(), "critical");
    await userEvent.tab();
    expect(chips()).toEqual(["critical"]);
  });

  it("the same tag twice is added once", async () => {
    render(<Harness initial={["prod"]} />);
    await userEvent.type(box(), "PROD{Enter}");
    expect(chips()).toEqual(["prod"]);
    expect(box()).toHaveValue("");
  });

  it("refuses a tag the server would refuse, keeps the text and says why", async () => {
    render(<Harness />);
    await userEvent.type(box(), "no/slashes{Enter}");
    expect(screen.getByText("Tags may use letters, numbers, spaces, - and _.")).toBeVisible();
    expect(box()).toHaveValue("no/slashes");
    expect(box()).toHaveAttribute("aria-invalid", "true");
    expect(chips()).toEqual([]);
  });

  it("refuses a tag longer than 30 characters", async () => {
    render(<Harness />);
    await userEvent.type(box(), `${"a".repeat(31)}{Enter}`);
    expect(screen.getByText("A tag can have at most 30 characters.")).toBeVisible();
  });

  it("refuses an eleventh tag", async () => {
    render(<Harness initial={Array.from({ length: 10 }, (_, i) => `t${i}`)} />);
    await userEvent.type(box(), "one more{Enter}");
    expect(screen.getByText("At most 10 tags.")).toBeVisible();
    expect(chips()).toHaveLength(10);
  });

  it("the error goes away as soon as the text is edited", async () => {
    render(<Harness />);
    await userEvent.type(box(), "bad!{Enter}");
    expect(screen.getByText(/Tags may use/)).toBeVisible();
    await userEvent.type(box(), "x");
    expect(screen.queryByText(/Tags may use/)).not.toBeInTheDocument();
  });

  it("a chip's button removes that tag only", async () => {
    render(<Harness initial={["a", "b", "c"]} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove tag b" }));
    expect(chips()).toEqual(["a", "c"]);
  });

  it("Backspace in the empty box removes the last tag, and in a box with text it only edits the text", async () => {
    render(<Harness initial={["a", "b"]} />);
    await userEvent.click(box());
    await userEvent.keyboard("{Backspace}");
    expect(chips()).toEqual(["a"]);
    await userEvent.type(box(), "xy{Backspace}");
    expect(chips()).toEqual(["a"]);
    expect(box()).toHaveValue("x");
  });

  it("offers tags from other monitors as suggestions, except the ones already added", () => {
    const { container } = render(
      <Harness initial={["prod"]} suggestions={["prod", "staging", "critical"]} />,
    );
    const options = [...container.querySelectorAll("datalist option")].map((o) =>
      o.getAttribute("value"),
    );
    expect(options).toEqual(["staging", "critical"]);
    expect(box()).toHaveAttribute("list");
  });

  it("the chips are a labelled list for screen readers", () => {
    render(<Harness initial={["a"]} />);
    expect(screen.getByRole("list", { name: "Tags on this monitor" })).toBeVisible();
  });
});