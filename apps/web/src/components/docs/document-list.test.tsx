import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DocumentList } from "./document-list";
import { api, type Document } from "@/lib/api";

// Mock the API
vi.mock("@/lib/api", () => ({
  api: {
    getDocuments: vi.fn(),
  },
}));

const mockDocuments: Document[] = [
  {
    id: "doc-1",
    orgId: "org-1",
    title: "My First Document",
    type: "doc",
    ownerId: "user-1",
    templateId: null,
    lastEditedBy: "user-1",
    lastEditedAt: "2026-03-10T12:00:00Z",
    createdAt: "2026-03-09T10:00:00Z",
    updatedAt: "2026-03-10T12:00:00Z",
  },
  {
    id: "doc-2",
    orgId: "org-1",
    title: "Spreadsheet",
    type: "sheet",
    ownerId: "user-1",
    templateId: null,
    lastEditedBy: "user-1",
    lastEditedAt: "2026-03-10T11:00:00Z",
    createdAt: "2026-03-08T10:00:00Z",
    updatedAt: "2026-03-10T11:00:00Z",
  },
];

describe("DocumentList", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("shows loading state initially", async () => {
    vi.mocked(api.getDocuments).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    render(<DocumentList />);

    expect(screen.getByText("Loading documents...")).toBeInTheDocument();
  });

  it("shows empty state when no documents", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: [] });

    render(<DocumentList />);

    await waitFor(() => {
      expect(screen.getByText("No documents yet")).toBeInTheDocument();
    });
  });

  it("renders document list", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: mockDocuments });

    render(<DocumentList />);

    await waitFor(() => {
      expect(screen.getByText("My First Document")).toBeInTheDocument();
      expect(screen.getByText("Spreadsheet")).toBeInTheDocument();
    });
  });

  it("shows error state when fetch fails", async () => {
    vi.mocked(api.getDocuments).mockRejectedValue(new Error("Network error"));

    render(<DocumentList />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  it("calls onSelectDocument when document is clicked", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: mockDocuments });

    const handleSelect = vi.fn();
    render(<DocumentList onSelectDocument={handleSelect} />);

    await waitFor(() => {
      expect(screen.getByText("My First Document")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("My First Document"));

    expect(handleSelect).toHaveBeenCalledWith(mockDocuments[0]);
  });

  it("highlights selected document", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: mockDocuments });

    render(<DocumentList selectedDocumentId="doc-1" />);

    await waitFor(() => {
      expect(screen.getByText("My First Document")).toBeInTheDocument();
    });

    // Find the button containing the document title
    const docButton = screen.getByText("My First Document").closest("button");
    expect(docButton).toHaveClass("bg-blue-50");
  });

  it("shows create button in header", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: mockDocuments });

    const handleCreate = vi.fn();
    render(<DocumentList onCreateDocument={handleCreate} />);

    await waitFor(() => {
      expect(screen.getByText("Documents")).toBeInTheDocument();
    });

    const createButton = screen.getByLabelText("New document");
    expect(createButton).toBeInTheDocument();

    fireEvent.click(createButton);
    expect(handleCreate).toHaveBeenCalled();
  });

  it("shows create button in empty state", async () => {
    vi.mocked(api.getDocuments).mockResolvedValue({ documents: [] });

    const handleCreate = vi.fn();
    render(<DocumentList onCreateDocument={handleCreate} />);

    await waitFor(() => {
      expect(screen.getByText("No documents yet")).toBeInTheDocument();
    });

    const createButton = screen.getByRole("button", { name: /create document/i });
    fireEvent.click(createButton);
    expect(handleCreate).toHaveBeenCalled();
  });
});
