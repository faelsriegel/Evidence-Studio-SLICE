import * as exifr from "exifr";

export async function resolveBestImageDate(file: File): Promise<Date> {
  try {
    const tags = await exifr.parse(file, [
      "DateTimeOriginal",
      "CreateDate",
      "ModifyDate",
      "DateTimeDigitized",
    ]);

    const rawDate =
      tags?.DateTimeOriginal ??
      tags?.CreateDate ??
      tags?.ModifyDate ??
      tags?.DateTimeDigitized;

    if (rawDate instanceof Date && !Number.isNaN(rawDate.getTime())) {
      return rawDate;
    }

    if (typeof rawDate === "string") {
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        return parsed;
      }
    }
  } catch {
    // EXIF pode estar ausente ou corrompido; seguimos fallback seguro.
  }

  if (file.lastModified) {
    const modified = new Date(file.lastModified);
    if (!Number.isNaN(modified.getTime())) {
      return modified;
    }
  }

  return new Date();
}
