// Faithful Raycast-style fuzzy match + helpers from Nihon 1.2.0 (L221-345)
import type { FuzzyResult } from "./types";

export function debounce<T extends (...args: unknown[]) => void>(fn: T, waitMs = 120): T {
  let timer: number | null = null;
  const debounced = ((...args: unknown[]) => {
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), waitMs);
  }) as T;
  return debounced;
}

export function fuzzyScore(query: string, target: string): FuzzyResult {
  if (!query) return { match: true, score: 0, indices: [] };
  const q = query.trim().toLowerCase();
  const t = target.toLowerCase();
  if (t === q) return { match: true, score: 1000, indices: Array.from({ length: q.length }, (_, i) => i) };
  if (t.startsWith(q)) return { match: true, score: 800 + 100 / Math.max(1, t.length), indices: Array.from({ length: q.length }, (_, i) => i) };
  const wordIdx = t.indexOf(q);
  if (wordIdx !== -1) {
    const isBoundary = wordIdx === 0 || /[^a-zA-Z0-9]/.test(t[wordIdx - 1]!);
    const score = isBoundary ? 600 + 100 / (wordIdx + 1) : 400;
    const indices: number[] = [];
    for (let i = 0; i < q.length; i++) indices.push(wordIdx + i);
    return { match: true, score, indices };
  }
  const words = t.split(/[\s:\-_/]+/);
  if (words.length > 1) {
    const acronym = words.map((w) => w[0] || "").join("");
    if (acronym.startsWith(q)) return { match: true, score: 500, indices: [] };
  }
  let qIdx = 0;
  let score = 0;
  let prevMatchIdx = -2;
  const indices: number[] = [];
  for (let i = 0; i < t.length && qIdx < q.length; i++) {
    if (t[i] === q[qIdx]) {
      indices.push(i);
      if (i === prevMatchIdx + 1) score += 30;
      if (i === 0 || /[^a-zA-Z0-9]/.test(t[i - 1]!)) score += 40;
      else score += 10;
      prevMatchIdx = i;
      qIdx++;
    }
  }
  if (qIdx === q.length) return { match: true, score: score - (t.length - q.length) * 0.5, indices };
  return { match: false, score: -1, indices: [] };
}

export function renderHighlightedText(container: HTMLElement, text: string, indices: number[]): void {
  if (!indices || indices.length === 0) {
    container.createSpan({ text });
    return;
  }
  const indexSet = new Set(indices);
  let currentSpan: HTMLSpanElement | null = null;
  let isCurrentHighlight: boolean | null = null;
  for (let i = 0; i < text.length; i++) {
    const isH = indexSet.has(i);
    if (currentSpan === null || isCurrentHighlight !== isH) {
      isCurrentHighlight = isH;
      currentSpan = container.createSpan({ cls: isH ? "cpm-match-highlight" : "" });
    }
    currentSpan.textContent += text[i];
  }
}

export function validateSafeUri(rawUri: string): string | null {
  if (!rawUri || typeof rawUri !== "string") return null;
  const trimmed = rawUri.trim();
  const allowedProtocols = ["https:", "http:", "obsidian:", "mailto:"];
  try {
    const parsed = new URL(trimmed);
    if (allowedProtocols.includes(parsed.protocol)) return parsed.href;
  } catch {
    if (/^obsidian:\/\/[^\s]+$/i.test(trimmed)) return trimmed;
  }
  return null;
}

