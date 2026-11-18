// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "../services/api";
import { renderApp } from "../test/render";
import { DeleteAccountDialog } from "./DeleteAccountDialog";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

beforeEach(() => {
  toast.success.mockClear();
  toast.error.mockClear();
});

const open = (deleteAccount = vi.fn().mockResolvedValue(undefined), onClose = vi.fn()) => {
  renderApp(<DeleteAccountDialog open onClose={onClose} />, { auth: { deleteAccount } });
  return { deleteAccount, onClose };
};
const confirm = () => userEvent.click(screen.getByRole("button", { name: "Delete my account" }));

describe("DeleteAccountDialog", () => {
  it("warns clearly what will be lost", () => {
    open();
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAccessibleName("Delete your account?");
    expect(dialog).toHaveAccessibleDescription(
      /permanently deletes your monitors.*cannot be undone/i,
    );
  });

  it("will not send an empty password", async () => {
    const { deleteAccount } = open();
    await confirm();
    expect(screen.getByText("Enter your password to confirm.")).toBeVisible();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("sends the password it was given and thanks the person once it is done", async () => {
    const { deleteAccount } = open();
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await confirm();
    await waitFor(() => expect(deleteAccount).toHaveBeenCalledOnce());
    expect(deleteAccount.mock.calls[0]![0]).toBe("my-password-1");
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Your account has been deleted."),
    );
  });

  it("a wrong password is shown under the field and the person stays logged in", async () => {
    const deleteAccount = vi
      .fn()
      .mockRejectedValue(new ApiError(400, "INVALID_PASSWORD", "That password is not correct."));
    open(deleteAccount);
    await userEvent.type(screen.getByLabelText("Your password"), "wrong-one");
    await confirm();
    expect(await screen.findByText("That is not your password.")).toBeVisible();
    expect(screen.getByLabelText("Your password")).toHaveAttribute("aria-invalid", "true");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("any other failure shows one safe message above the field", async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(500, "INTERNAL", "db exploded"));
    open(deleteAccount);
    await userEvent.type(screen.getByLabelText("Your password"), "whatever1");
    await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong on our side.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("db exploded");
  });

  it("a rate limit asks the person to wait", async () => {
    const deleteAccount = vi.fn().mockRejectedValue(new ApiError(429, "RATE_LIMITED", "x"));
    open(deleteAccount);
    await userEvent.type(screen.getByLabelText("Your password"), "whatever1");
    await confirm();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts.");
  });

  it("while deleting, the buttons cannot be used a second time", async () => {
    let finish!: () => void;
    const deleteAccount = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    open(deleteAccount);
    await userEvent.type(screen.getByLabelText("Your password"), "my-password-1");
    await confirm();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Delete my account" })).toBeDisabled(),
    );
    expect(screen.getByRole("button", { name: "Keep my account" })).toBeDisabled();
    finish();
  });

  it("'Keep my account' closes the dialog and deletes nothing", async () => {
    const { deleteAccount, onClose } = open();
    await userEvent.click(screen.getByRole("button", { name: "Keep my account" }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it("renders nothing while closed", () => {
    renderApp(<DeleteAccountDialog open={false} onClose={() => {}} />);
    expect(screen.queryByLabelText("Your password")).not.toBeInTheDocument();
  });
});