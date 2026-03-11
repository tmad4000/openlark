import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CreateDocumentDialog } from "./create-document-dialog";
import { api, type Document } from "@/lib/api";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    createDocument: vi.fn(),
  },
}));

const mockDocument: Document = {
  id: "doc-1",
  orgId: "org-1",
  title: "Test Document",
  type: "doc",
  ownerId: "user-1",
  templateId: null,
  lastEditedBy: "user-1",
  lastEditedAt: "2026-03-10T12:00:00Z",
  createdAt: "2026-03-10T12:00:00Z",
  updatedAt: "2026-03-10T12:00:00Z",
};

describe("CreateDocumentDialog", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders when open", () => {
    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByText("Create New Document")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
    expect(screen.getByText("Type")).toBeInTheDocument();
  });

  it("does not render when closed", () => {
    render(
      <CreateDocumentDialog
        open={false}
        onOpenChange={() => {}}
      />
    );

    expect(screen.queryByText("Create New Document")).not.toBeInTheDocument();
  });

  it("shows document type options", () => {
    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByText("Document")).toBeInTheDocument();
    expect(screen.getByText("Spreadsheet")).toBeInTheDocument();
    expect(screen.getByText("Presentation")).toBeInTheDocument();
    expect(screen.getByText("Mind Map")).toBeInTheDocument();
    expect(screen.getByText("Whiteboard")).toBeInTheDocument();
  });

  it("selects document type when clicked", () => {
    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    // Default is "doc" which should be highlighted
    const docButton = screen.getByText("Document").closest("button");
    expect(docButton).toHaveClass("border-blue-500");

    // Click on Spreadsheet
    fireEvent.click(screen.getByText("Spreadsheet"));
    const sheetButton = screen.getByText("Spreadsheet").closest("button");
    expect(sheetButton).toHaveClass("border-blue-500");
  });

  it("creates document with title and type", async () => {
    vi.mocked(api.createDocument).mockResolvedValue({ document: mockDocument });

    const handleOpenChange = vi.fn();
    const handleCreated = vi.fn();

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={handleOpenChange}
        onDocumentCreated={handleCreated}
      />
    );

    // Enter title
    const titleInput = screen.getByLabelText("Title");
    fireEvent.change(titleInput, { target: { value: "My New Document" } });

    // Submit
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(api.createDocument).toHaveBeenCalledWith({
        title: "My New Document",
        type: "doc",
      });
      expect(handleCreated).toHaveBeenCalledWith(mockDocument);
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("uses Untitled as default title", async () => {
    vi.mocked(api.createDocument).mockResolvedValue({ document: mockDocument });

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    // Submit without entering title
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(api.createDocument).toHaveBeenCalledWith({
        title: "Untitled",
        type: "doc",
      });
    });
  });

  it("shows loading state while creating", async () => {
    vi.mocked(api.createDocument).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Creating..." })).toBeDisabled();
    });
  });

  it("shows error when creation fails", async () => {
    vi.mocked(api.createDocument).mockRejectedValue(new Error("Creation failed"));

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getByText("Creation failed")).toBeInTheDocument();
    });
  });

  it("closes when cancel is clicked", () => {
    const handleOpenChange = vi.fn();

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={handleOpenChange}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(handleOpenChange).toHaveBeenCalledWith(false);
  });

  it("creates different document types", async () => {
    vi.mocked(api.createDocument).mockResolvedValue({
      document: { ...mockDocument, type: "sheet" }
    });

    render(
      <CreateDocumentDialog
        open={true}
        onOpenChange={() => {}}
      />
    );

    // Select spreadsheet type
    fireEvent.click(screen.getByText("Spreadsheet"));

    // Enter title and submit
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Budget" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(api.createDocument).toHaveBeenCalledWith({
        title: "Budget",
        type: "sheet",
      });
    });
  });
});
