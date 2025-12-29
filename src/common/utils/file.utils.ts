import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';

/**
 * Safely deletes a file from the disk.
 * @param fileUrl The relative URL of the file (e.g., /uploads/filename.png)
 */
export const deleteFile = (fileUrl: string | undefined | null): void => {
  if (!fileUrl) return;

  // If it's a full URL, we can't easily delete it if it's external
  if (fileUrl.startsWith('http')) return;

  // Resolve the path. Assuming storage is in the 'uploads' folder relative to process.cwd()
  // and fileUrl starts with /uploads/
  const relativePath = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
  const filePath = join(process.cwd(), relativePath);

  try {
    if (existsSync(filePath)) {
      unlinkSync(filePath);
      console.log(`[FileUtil] Deleted old file: ${filePath}`);
    }
  } catch (error) {
    console.error(`[FileUtil] Failed to delete file: ${filePath}`, error);
  }
};
