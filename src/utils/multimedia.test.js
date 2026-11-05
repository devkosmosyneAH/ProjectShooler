import { describe, expect, test, vi } from "vitest";
import {
  analyzeImageFiles,
  isValidGitHubRawBaseUrl,
  parseYouTubeUrl,
  resolveRawResourceUrl,
  validateImageFile,
} from "./multimedia";

const imageFile = (name = "project.jpg", type = "image/jpeg", size = 10) =>
  new File([new Uint8Array(size)], name, { type });

describe("image validation and OCR", () => {
  test.each([
    ["image.jpg", "image/jpeg"],
    ["image.jpeg", "image/jpeg"],
    ["image.png", "image/png"],
    ["image.webp", "image/webp"],
  ])("accepts %s", (name, type) => {
    expect(validateImageFile(imageFile(name, type))).toBe("");
  });

  test("rejects unsupported, mismatched, empty, and oversized images", () => {
    expect(validateImageFile(imageFile("image.gif", "image/gif"))).toMatch(
      /JPG, PNG o WEBP/,
    );
    expect(validateImageFile(imageFile("image.png", "image/jpeg"))).toMatch(
      /JPG, PNG o WEBP/,
    );
    expect(validateImageFile(imageFile("empty.jpg", "image/jpeg", 0))).toMatch(
      /vacío/,
    );
    expect(
      validateImageFile(
        imageFile("large.jpg", "image/jpeg", 10 * 1024 * 1024 + 1),
      ),
    ).toMatch(/10 MB/);
  });

  test("runs OCR for all selected images and marks uncertain text for review", async () => {
    const files = [
      imageFile("first.jpg"),
      imageFile("second.png", "image/png"),
    ];
    const recognize = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          text: "Título\nLa investigación inició el 12/03/2024.",
          confidence: 91,
        },
      })
      .mockResolvedValueOnce({
        data: { text: "Resultado 42", confidence: 35 },
      });
    const terminate = vi.fn();
    const workerFactory = vi.fn(async () => ({ recognize, terminate }));
    const onProgress = vi.fn();

    const results = await analyzeImageFiles(files, {
      workerFactory,
      onProgress,
    });

    expect(workerFactory).toHaveBeenCalledWith(
      "spa+eng",
      1,
      expect.objectContaining({ logger: expect.any(Function) }),
    );
    expect(recognize).toHaveBeenCalledTimes(2);
    expect(results[0]).toMatchObject({
      ocrText: "Título\nLa investigación inició el 12/03/2024.",
      ocrConfidence: 91,
      ocrReviewRequired: false,
      visualReviewRequired: true,
    });
    expect(results[0].ocrClassification).toMatchObject({
      titles: ["Título"],
      dates: ["La investigación inició el 12/03/2024."],
    });
    expect(results[1].ocrReviewRequired).toBe(true);
    expect(terminate).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({ current: 2, total: 2, phase: "complete" }),
    );
  });

  test("does not start OCR when any selected file is invalid", async () => {
    const workerFactory = vi.fn();
    await expect(
      analyzeImageFiles([imageFile("bad.gif", "image/gif")], { workerFactory }),
    ).rejects.toThrow(/JPG, PNG o WEBP/);
    expect(workerFactory).not.toHaveBeenCalled();
  });
});

describe("YouTube and GitHub Raw URL validation", () => {
  const videoId = "a1B2c3D4e5F";

  test.each([
    `https://www.youtube.com/watch?v=${videoId}`,
    `https://youtu.be/${videoId}`,
    `https://www.youtube.com/shorts/${videoId}`,
    `https://www.youtube.com/watch?feature=share&v=${videoId}&t=20`,
  ])("extracts a video ID from %s", (url) => {
    expect(parseYouTubeUrl(url)).toEqual({
      url,
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
    });
  });

  test.each([
    `http://www.youtube.com/watch?v=${videoId}`,
    `https://youtube.com.evil.example/watch?v=${videoId}`,
    `https://evil.example/?url=https://youtube.com/watch?v=${videoId}`,
    `https://youtube.com@evil.example/watch?v=${videoId}`,
    "https://youtu.be/too-short",
  ])("rejects untrusted or invalid video URLs: %s", (url) => {
    expect(parseYouTubeUrl(url)).toBeNull();
  });

  test("accepts only HTTPS GitHub Raw directory URLs and safe relative assets", () => {
    const base =
      "https://raw.githubusercontent.com/team/school-project/main/public/";
    expect(isValidGitHubRawBaseUrl(base)).toBe(true);
    expect(
      isValidGitHubRawBaseUrl("https://github.com/team/school-project"),
    ).toBe(false);
    expect(
      isValidGitHubRawBaseUrl("https://raw.githubusercontent.com/team/repo"),
    ).toBe(false);
    expect(resolveRawResourceUrl(base, "images/project/image.webp")).toBe(
      `${base}images/project/image.webp`,
    );
    expect(() => resolveRawResourceUrl(base, "../secret.jpg")).toThrow(
      /debe ser relativa/,
    );
    expect(() => resolveRawResourceUrl(base, "/secret.jpg")).toThrow(
      /debe ser relativa/,
    );
  });
});
