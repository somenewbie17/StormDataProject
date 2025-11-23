#!/usr/bin/env node
/**
 * Update Recording Durations from FFprobe
 * 
 * Uses ffprobe to get actual video duration and updates database
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

const prisma = new PrismaClient();
const baseDir = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';

/**
 * Check if file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Recursively find a file in date-based directory structure
 */
async function findFile(baseDir, botId, filename) {
  // Check direct path first
  const directPath = path.join(baseDir, botId, filename);
  if (await fileExists(directPath)) {
    return directPath;
  }

  // Recursive search
  async function searchDir(dir) {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const fullPath = path.join(dir, entry.name);

          // Match full botId or shortened format
          if (entry.name === botId || entry.name.includes(botId.split('-')[0])) {
            const targetPath = path.join(fullPath, filename);
            if (await fileExists(targetPath)) {
              return targetPath;
            }
          }

          // Continue search
          const result = await searchDir(fullPath);
          if (result) return result;
        }
      }
    } catch (error) {
      // Skip permission errors
    }
    return null;
  }

  return await searchDir(baseDir);
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(botId) {
  try {
    const videoPath = await findFile(baseDir, botId, 'video.mp4');
    if (!videoPath) {
      return null;
    }

    // Use ffprobe to get exact video duration
    const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const output = execSync(command, { encoding: 'utf-8' }).trim();
    const duration = parseFloat(output);

    return Math.floor(duration); // Return in seconds
  } catch (error) {
    return null;
  }
}

/**
 * Main function
 */
async function main() {
  console.log('🔧 Update Recording Durations from FFprobe\n');
  console.log('=' .repeat(80));

  // Get all recordings
  const recordings = await prisma.recording.findMany({
    where: { status: 'ready' },
    select: {
      id: true,
      botId: true,
      courseName: true,
      duration: true
    },
    orderBy: { createdAt: 'desc' }
  });

  console.log(`\nFound ${recordings.length} recordings\n`);

  let updated = 0;
  let failed = 0;
  let unchanged = 0;

  for (const recording of recordings) {
    const shortId = recording.botId.substring(0, 8);
    process.stdout.write(`📹 ${shortId} - ${recording.courseName.substring(0, 30).padEnd(30)} `);

    const videoDuration = await getVideoDuration(recording.botId);

    if (!videoDuration) {
      console.log(`❌ Video not found`);
      failed++;
      continue;
    }

    const currentMin = Math.floor(recording.duration / 60);
    const newMin = Math.floor(videoDuration / 60);

    if (Math.abs(recording.duration - videoDuration) < 5) {
      console.log(`✅ Already correct (${newMin}m)`);
      unchanged++;
      continue;
    }

    // Update duration
    await prisma.recording.update({
      where: { id: recording.id },
      data: { duration: videoDuration }
    });

    console.log(`🔄 ${currentMin}m → ${newMin}m (${videoDuration}s)`);
    updated++;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\n✨ Done!`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Unchanged: ${unchanged}`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${recordings.length}\n`);

  await prisma.$disconnect();
}

main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});
