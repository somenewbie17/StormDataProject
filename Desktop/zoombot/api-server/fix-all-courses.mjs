/**
 * Fix all recordings in database using the existing waterfall course detection system
 * This runs the course detection for each recording and updates the database
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { detectCourse, getCourseFromSchedule } from '../scripts/teacher-course-mapper.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const RECORDINGS_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings'
);

async function fixAllCourses() {
  console.log('🔍 Fetching all recordings from database...');
  
  const recordings = await prisma.recording.findMany({
    select: {
      id: true,
      botId: true,
      videoPath: true,
      recordedAt: true,
      courseCode: true,
      courseName: true
    }
  });
  
  console.log(`📊 Found ${recordings.length} recordings to process\n`);
  
  let updated = 0;
  let failed = 0;
  let skipped = 0;
  
  for (const recording of recordings) {
    try {
      // Build full path to recording directory
      const recordingPath = path.join(RECORDINGS_DIR, recording.videoPath.replace(/\/video\.mp4$/, ''));
      
      // Extract date from directory path: /2025/10/20/botId/video.mp4
      const pathMatch = recording.videoPath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
      const metadataPath = path.join(recordingPath, 'metadata.json');
      const transcriptPath = path.join(recordingPath, 'transcript.json');
      let recordingTime = recording.recordedAt;
      let metadata = null;
      let timestampSource = 'database';
      
      // Priority 1: metadata.json (most accurate - has actual time)
      if (fs.existsSync(metadataPath)) {
        metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
        if (metadata.started_at) {
          recordingTime = new Date(metadata.started_at);
          timestampSource = 'metadata';
        }
      }
      // Priority 2: Use the date from the file path
      // Classes typically happen at same time each week, so day-of-week is key
      else if (pathMatch) {
        const [_, year, month, day] = pathMatch;
        // Set time to middle of day so schedule matching works
        recordingTime = new Date(`${year}-${month}-${day}T12:00:00Z`);
        timestampSource = 'path';
      }
      
      console.log(`${timestampSource === 'metadata' ? '📅' : timestampSource === 'path' ? '📁' : '⏰'} ${recording.botId.substring(0, 8)}: ${timestampSource} - ${recordingTime.toISOString().split('T')[0]}`);
      
      // Use YOUR waterfall detection system (checks teacher name, then schedule)
      const detected = detectCourse({
        transcriptPath: fs.existsSync(transcriptPath) ? transcriptPath : null,
        recordingDate: recordingTime,
        metadata: metadata
      });
      
      if (detected) {
        // Only update if it's different
        if (detected.courseCode !== recording.courseCode || detected.courseName !== recording.courseName) {
          await prisma.recording.update({
            where: { id: recording.id },
            data: {
              courseCode: detected.courseCode,
              courseName: detected.courseName,
              recordedAt: recordingTime // Update with accurate time if we got it from metadata
            }
          });
          
          console.log(`✅ ${recording.botId.substring(0, 8)}: ${detected.courseCode} - ${detected.courseName}`);
          updated++;
        } else {
          console.log(`⏭️  ${recording.botId.substring(0, 8)}: Already correct (${detected.courseCode})`);
          skipped++;
        }
      } else {
        console.log(`❓ ${recording.botId.substring(0, 8)}: Could not detect course for time ${recordingTime.toISOString()}`);
        failed++;
      }
      
    } catch (error) {
      console.error(`❌ ${recording.botId}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ⏭️  Skipped (already correct): ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📝 Total: ${recordings.length}`);
  
  await prisma.$disconnect();
}

fixAllCourses().catch(console.error);
