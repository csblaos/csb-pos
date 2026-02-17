/**
 * Share or download a file using the Web Share API with fallback.
 *
 * On iOS/Android PWA this opens the native share sheet.
 * On desktop or unsupported browsers it falls back to a download.
 */
export async function shareOrDownload(
  blob: Blob,
  filename: string,
  title?: string,
): Promise<"shared" | "downloaded"> {
  // Try native share (works on iOS Safari 15+, Chrome Android, PWA standalone)
  if (canNativeShare()) {
    try {
      const file = new File([blob], filename, { type: blob.type });
      await navigator.share({
        title: title ?? filename,
        files: [file],
      });
      return "shared";
    } catch (err) {
      // User cancelled or share failed — fall through to download
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — don't download either
        return "shared";
      }
    }
  }

  // Fallback: trigger browser download
  downloadBlob(blob, filename);
  return "downloaded";
}

/**
 * Force-download a blob as a file.
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  // Cleanup
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/**
 * Check if the browser supports native file sharing.
 */
export function canNativeShare(): boolean {
  if (typeof navigator === "undefined") return false;
  if (!navigator.share) return false;
  // Check if files can be shared (not all share implementations support files)
  if (!navigator.canShare) return false;
  try {
    const testFile = new File(["test"], "test.pdf", {
      type: "application/pdf",
    });
    return navigator.canShare({ files: [testFile] });
  } catch {
    return false;
  }
}
