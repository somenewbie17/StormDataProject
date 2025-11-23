#!/usr/bin/env node

/**
 * Force OneDrive to download all video files by reading the first byte
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();
const BASE_DIR = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';

async function main() {
  console.log('📥 Forcing OneDrive Downloads\n');
  console.log('='.repeat(50));
  
  const recordings = await prisma.recording.findMany({
    select: { botId: true, videoPath: true }
  });
  
  console.log(`Found ${recordings.length} videos to download\n`);
  
  let triggered = 0;
  
  for (const rec of recordings) {
    const botShort = rec.botId.substring(0, 8);
    const absolutePath = rec.videoPath.startsWith('/') && !rec.videoPath.startsWith(BASE_DIR)
      ? `${BASE_DIR}${rec.videoPath}`
      : rec.videoPath;
    
    try {
      // Read first 1KB to trigger download
      execSync(`head -c 1024 "${absolutePath}" > /dev/null 2>&1`, { timeout: 5000 });
      console.log(`✓ ${botShort}... triggered`);
      triggered++;
    } catch (error) {
      console.log(`✗ ${botShort}... failed`);
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log(`✨ Triggered ${triggered}/${recordings.length} downloads`);
  console.log('\n⏳ OneDrive will download files in the background.');
  console.log('   Wait 10-30 minutes depending on file sizes.');
  console.log('   Then run: node update-real-videos-only.mjs');
  
  await prisma.$disconnect();
}

main();
