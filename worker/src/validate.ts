export interface ValidationResult {
  valid: boolean;
  normalized: string;
  error?: string;
}

export function validateQuestion(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { valid: false, normalized: "", error: "Question must be a string." };
  }

  const trimmed = input.trim();
  if (trimmed.length < 1) {
    return { valid: false, normalized: "", error: "Question cannot be empty." };
  }

  if (trimmed.length > 100) {
    return { valid: false, normalized: "", error: "Question exceeds 100 characters." };
  }

  // Collapse inner whitespace and normalize to lowercase
  const normalized = trimmed.replace(/\s+/g, " ").toLowerCase();
  return { valid: true, normalized };
}

export async function sha256Hex(text: string): Promise<string> {
  const enc = new TextEncoder().encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", enc);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
