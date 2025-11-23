#!/usr/bin/env node

/**
 * Fix Recording Durations
 * 
 * Recalculates durations for recordings that have 0 or incorrect duration (3600s = 60min default)
 * by reading actual video duration using ffprobe
 * 
 * Run from api-server directory: node fix-recording-durations.js
 */

const { PrismaClient } = require('@prisma/client');
const { execSync } = require('child_process');
const fs = require('fs');

const prisma = new PrismaClient();

/**
 * Get video duration using ffprobe (most accurate - reads actual video file)
 */
function getVideoDuration(videoPath) {
  try {
    if (!fs.existsSync(videoPath)) {
      console.log(`  ⚠️  Video file not found`);
      return null;
    }

    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    );

    const duration = parseFloat(output.trim());
    if (isNaN(duration) || duration <= 0) {
      console.log(`  ⚠️  Invalid duration from ffprobe`);
      return null;
    }

    return Math.floor(duration); // Round down to nearest second
  } catch (error) {
    console.log(`  ❌ Error reading video duration: ${error.message}`);
    return null;
  }
}

async function fixRecordingDurations() {
  console.log('🔧 Fixing Recording Durations\n');
  console.log('================================\n');
  
  // Find recordings with duration = 0 OR 3600 (60 min default placeholder)
  const recordings = await prisma.recording.findMany({
    where: {
      OR: [
        { duration: 0 },
        { duration: 3600 }
      ]
    },
    orderBy: { createdAt: 'desc' }
  });
  
  console.log(`Found ${recordings.length} recordings with incorrect duration (0s or 3600s)\n`);
  
  let fixed = 0;
  let failed = 0;
  
  for (const recording of recordings) {
    const courseName = recording.courseName.substring(0, 40);
    console.log(`📝 ${courseName.padEnd(42)} (${recording.botId?.substring(0, 8)})`);
    console.log(`   Current: ${recording.duration}s → Video: ${recording.videoPath}`);
    
    // Get actual duration from video file using ffprobe
    const duration = getVideoDuration(recording.videoPath);
    
    if (duration && duration > 0) {
      const minutes = Math.floor(duration / 60);
      const seconds = duration % 60;
      
      await prisma.recording.update({
        where: { id: recording.id },
        data: { duration }
      });
      
      console.log(`  ✅ Updated: ${minutes}m ${seconds}s (${duration} seconds)\n`);
      fixed++;
    } else {
      console.log(`  ❌ Could not read video duration\n`);
      failed++;
    }
  }
  
  console.log('================================\n');
  console.log(`✅ Fixed: ${fixed} recordings`);
  console.log(`⚠️  Failed: ${failed} recordings`);
  console.log(`📊 Total: ${recordings.length} recordings\n`);
  
  await prisma.$disconnect();
}

// Run the fix
fixRecordingDurations().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});
