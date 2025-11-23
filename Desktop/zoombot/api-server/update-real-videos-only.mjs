#!/usr/bin/env node

/**
 * Update recording durations for REAL video files only (skip OneDrive placeholders)
 */

import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { statSync } from 'fs';

const prisma = new PrismaClient();

async function main() {
  console.log('🔧 Update Recording Durations (Real Videos Only)\n');
  console.log('='.repeat(50));
  
  const recordings = await prisma.recording.findMany({
    select: { id: true, botId: true, courseCode: true, courseName: true, videoPath: true, duration: true }
  });
  
  console.log(`Found ${recordings.length} recordings\n`);
  
  let updated = 0;
  let skipped = 0;
  let failed = 0;
  
  const BASE_DIR = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';
  
  for (const rec of recordings) {
    const botShort = rec.botId.substring(0, 8);
    const courseLabel = `${rec.courseCode} - ${rec.courseName}`.substring(0, 40);
    process.stdout.write(`📹 ${botShort} - ${courseLabel.padEnd(40)} `);
    
    try {
      // Build absolute path
      const absolutePath = rec.videoPath.startsWith('/') && !rec.videoPath.startsWith(BASE_DIR)
        ? `${BASE_DIR}${rec.videoPath}`
        : rec.videoPath;
      
      // Check if video file exists and is real (not OneDrive placeholder)
      const stats = statSync(absolutePath);
      const sizeInMB = stats.size / (1024 * 1024);
      
      // Skip if file is < 100KB (OneDrive placeholder)
      if (sizeInMB < 0.1) {
        console.log(`⏭️  Skipped (${(sizeInMB * 1024).toFixed(0)}KB - placeholder)`);
        skipped++;
        continue;
      }
      
      // Get duration from ffprobe with timeout
      const command = `timeout 30 ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${absolutePath}"`;
      const output = execSync(command, { encoding: 'utf-8' }).trim();
      const newDuration = Math.floor(parseFloat(output));
      const newMinutes = Math.floor(newDuration / 60);
      
      // Check if already correct
      if (Math.abs(rec.duration - newDuration) < 5) {
        console.log(`✅ Already correct (${newMinutes}m)`);
        continue;
      }
      
      // Update database
      await prisma.recording.update({
        where: { id: rec.id },
        data: { duration: newDuration }
      });
      
      const oldMinutes = Math.floor(rec.duration / 60);
      console.log(`🔄 ${oldMinutes}m → ${newMinutes}m (${newDuration}s)`);
      updated++;
      
    } catch (error) {
      if (error.message.includes('ENOENT')) {
        console.log(`❌ Video not found`);
      } else if (error.message.includes('timed out')) {
        console.log(`⏭️  Timeout (OneDrive downloading)`);
      } else {
        console.log(`❌ Error: ${error.message.substring(0, 50)}`);
      }
      failed++;
    }
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('✨ Done!');
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped} (small files)`);
  console.log(`   Failed: ${failed}`);
  console.log(`   Total: ${recordings.length}`);
  
  await prisma.$disconnect();
}

main();
