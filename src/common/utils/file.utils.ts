import { existsSync, unlinkSync } from 'fs';
import { join } from 'path';
import { getUploadPath } from './upload-path';

/**
 * Safely deletes a file from the disk.
 * @param fileUrl The relative URL of the file (e.g., /uploads/filename.png)
 */
export const deleteFile = (fileUrl: string | undefined | null): void => {
  if (!fileUrl) return;

  // Skip external URLs
  if (fileUrl.startsWith('http')) return;

  // Clean the relative path
  const cleanedPath = fileUrl.startsWith('/') ? fileUrl.substring(1) : fileUrl;
  const filename = cleanedPath.startsWith('uploads/')
    ? cleanedPath.substring(8)
    : cleanedPath;

  // Try to find the file in several common locations
  // 1. Production path via getUploadPath()
  // 2. Legacy: hardcoded production path for Ubuntu VPS
  // 3. Legacy: Local uploads folder relative to process.cwd()
  const pathsToTry = [
    join(getUploadPath(), filename),
    join(
      '/home/ubuntu/uploads',
      filename,
    ),
    join(process.cwd(), cleanedPath),
    join(
      process.cwd(),
      'uploads',
      filename,
    ),
  ];

  let deleted = false;
  for (const filePath of pathsToTry) {
    try {
      if (existsSync(filePath)) {
        unlinkSync(filePath);
        console.log(`[FileUtil] SUCCESS - Deleted file: ${filePath}`);
        deleted = true;
        break;
      }
    } catch (error) {
      console.error(
        `[FileUtil] ERROR - Failed to delete file: ${filePath}`,
        error.message,
      );
    }
  }

  if (!deleted) {
    console.warn(
      `[FileUtil] WARNING - File not found in any expected location: ${fileUrl}`,
    );
  }
};
