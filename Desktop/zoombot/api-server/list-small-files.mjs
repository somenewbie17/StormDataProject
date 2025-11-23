import { PrismaClient } from '@prisma/client';
import { statSync } from 'fs';

const prisma = new PrismaClient();
const BASE_DIR = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';

const recordings = await prisma.recording.findMany({
  select: { botId: true, courseCode: true, videoPath: true, duration: true }
});

console.log('Small test recordings (< 10MB):\n');
let count = 0;

for (const rec of recordings) {
  try {
    const absolutePath = rec.videoPath.startsWith('/') && !rec.videoPath.startsWith(BASE_DIR)
      ? `${BASE_DIR}${rec.videoPath}`
      : rec.videoPath;
    const stats = statSync(absolutePath);
    const sizeInMB = stats.size / (1024 * 1024);
    
    if (sizeInMB > 0.1 && sizeInMB < 10) {
      const botShort = rec.botId.substring(0, 13);
      const currentMin = Math.floor(rec.duration / 60);
      console.log(`${botShort}... | ${rec.courseCode.padEnd(10)} | ${sizeInMB.toFixed(1)}MB | Currently: ${currentMin}m`);
      count++;
    }
  } catch (e) {}
}

console.log(`\nTotal small test files: ${count}`);
await prisma.$disconnect();
