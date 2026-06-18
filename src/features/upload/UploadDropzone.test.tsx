import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { UploadDropzone } from "./UploadDropzone";
import type { UploadedFile } from "./useUpload";

vi.mock("./useUpload", () => ({
  useUpload: vi.fn(),
}));

import { useUpload } from "./useUpload";

function makeFile(): File {
  return new File([new Uint8Array(8).fill(1)], "a.png", { type: "image/png" });
}

function makeUploadedFile(): UploadedFile {
  return {
    url: "https://cdn.example.com/a.png",
    filename: "a.png",
    size: 8,
    mime: "image/png",
  };
}

type MockedUseUpload = {
  upload: Mock;
  uploading: boolean;
  progress: number;
  error: { code: string; message: string } | null;
};

function mockUseUpload(overrides: Partial<MockedUseUpload> = {}) {
  const upload = overrides.upload ?? vi.fn().mockResolvedValue(makeUploadedFile());
  (useUpload as unknown as Mock).mockReturnValue({
    upload,
    uploading: false,
    progress: 0,
    error: null,
    reset: vi.fn(),
    ...overrides,
  });
  return { upload };
}

describe("UploadDropzone", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the dropzone with a hidden file input", () => {
    mockUseUpload();
    render(<UploadDropzone sessionId="s1" personalityId="p1" onUploaded={vi.fn()} />);
    const dropzone = screen.getByTestId("upload-dropzone");
    expect(dropzone).toBeInTheDocument();
    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    expect(input).toBeInTheDocument();
    expect(input.type).toBe("file");
    expect(input.className).toContain("hidden");
  });

  it("triggers upload on file change and forwards the result to onUploaded", async () => {
    const onUploaded = vi.fn();
    const { upload } = mockUseUpload();
    render(
      <UploadDropzone sessionId="s1" personalityId="p1" onUploaded={onUploaded} />,
    );

    const input = screen.getByTestId("upload-file-input") as HTMLInputElement;
    const file = makeFile();
    await userEvent.upload(input, file);

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ sessionId: "s1", personalityId: "p1" }),
    );
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(makeUploadedFile()));
  });

  it("shows the progress bar when uploading is true", () => {
    mockUseUpload({ uploading: true, progress: 42 });
    render(<UploadDropzone sessionId="s1" personalityId="p1" onUploaded={vi.fn()} />);
    expect(screen.getByTestId("upload-progress")).toBeInTheDocument();
    expect(screen.getByText(/Uploading… 42%/)).toBeInTheDocument();
    const bar = screen.getByTestId("upload-progress-bar");
    expect(bar).toHaveAttribute("data-progress", "42");
  });

  it("shows the error message when error is set", () => {
    mockUseUpload({
      error: { code: "FILE_TOO_LARGE", message: "文件超过 20MB 上限" },
    });
    render(<UploadDropzone sessionId="s1" personalityId="p1" onUploaded={vi.fn()} />);
    const err = screen.getByTestId("upload-error");
    expect(err).toBeInTheDocument();
    expect(err.textContent).toContain("文件超过 20MB 上限");
  });
});
