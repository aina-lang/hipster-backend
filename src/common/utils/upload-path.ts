import { join } from 'path';
import { existsSync } from 'fs';

export function getUploadPath(): string {
  if (process.env.UPLOAD_PATH) return process.env.UPLOAD_PATH;

  const candidates = [
    join(__dirname, '..', '..', '..', '..', '..', 'uploads'),
    join(__dirname, '..', '..', '..', '..', 'uploads'),
    join(process.cwd(), 'uploads'),
  ];

  for (const p of candidates) {
    if (existsSync(p)) return p;
  }

  return join(process.cwd(), 'uploads');
}
