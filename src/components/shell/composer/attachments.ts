import type { PendingAttachment } from "./types";

const MAX_TEXT_FILE_BYTES = 200_000;
// Increased to allow larger binary file previews (was 100KB, now 500KB)
const MAX_BINARY_PREVIEW_BYTES = 500_000;

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Résultat de lecture invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le fichier."));
    };
    reader.readAsDataURL(file);
  });
}

async function fileToText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Résultat texte invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le texte."));
    };
    reader.readAsText(file);
  });
}

async function fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (!(reader.result instanceof ArrayBuffer)) {
        reject(new Error("Résultat binaire invalide."));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error("Impossible de lire le binaire."));
    };
    reader.readAsArrayBuffer(file);
  });
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

export async function buildAttachment(file: File): Promise<PendingAttachment> {
  const mimeType = file.type || "application/octet-stream";
  const isImage = mimeType.startsWith("image/");
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  if (isImage) {
    const dataUrl = await fileToDataUrl(file);
    const commaIndex = dataUrl.indexOf(",");
    if (commaIndex < 0) {
      throw new Error(`Image invalide: ${file.name}`);
    }
    const base64Data = dataUrl.slice(commaIndex + 1);
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      isImage: true,
      image: {
        type: "image",
        data: base64Data,
        mimeType,
      },
      // Include base64 data in textForPrompt so it can be parsed for UI display
      // Format: "Nom: ...\nType: ...\nTaille: ...\ndata:mimeType;base64,..."
      textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}\ndata:${mimeType};base64,${base64Data}`,
    };
  }

  const seemsText =
    mimeType.startsWith("text/") ||
    /json|xml|yaml|csv|markdown|javascript|typescript|html|css/.test(mimeType);

  if (seemsText && file.size <= MAX_TEXT_FILE_BYTES) {
    const text = await fileToText(file);
    return {
      id,
      name: file.name,
      mimeType,
      size: file.size,
      isImage: false,
      file: {
        type: "file",
        name: file.name,
        mimeType,
        data: text,
        size: file.size,
      },
      textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}\nContenu:\n${text}`,
    };
  }

  const buffer = await fileToArrayBuffer(file);
  const truncated = buffer.byteLength > MAX_BINARY_PREVIEW_BYTES;
  const previewBuffer = truncated ? buffer.slice(0, MAX_BINARY_PREVIEW_BYTES) : buffer;
  const previewBase64 = toBase64(previewBuffer);
  return {
    id,
    name: file.name,
    mimeType,
    size: file.size,
    isImage: false,
    file: {
      type: "file",
      name: file.name,
      mimeType,
      data: previewBase64,
      size: file.size,
    },
    textForPrompt: `Nom: ${file.name}\nType: ${mimeType}\nTaille: ${formatBytes(file.size)}\nAperçu base64${truncated ? " (tronqué)" : ""}:\n${previewBase64}`,
  };
}

export function buildMessageWithAttachments(
  message: string,
  attachments: PendingAttachment[],
): string {
  if (attachments.length === 0) {
    return message;
  }
  const sections = attachments.map((piece, index) => {
    return `--- Pièce jointe ${index + 1} ---\n${piece.textForPrompt}`;
  });
  return `${message}\n\n${sections.join("\n\n")}`;
}
