import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import the waterfall detection function
const { detectCourse } = await import('../scripts/teacher-course-mapper.mjs');

const prisma = new PrismaClient();

const RECORDINGS_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings'
);

async function fixCourses() {
  console.log('🔍 Fetching all recordings from database...');
  
  const recordings = await prisma.recording.findMany({
    select: {
      id: true,
      botId: true,
      videoPath: true,
      courseCode: true,
      courseName: true
    }
  });
  
  console.log(`📝 Found ${recordings.length} recordings to check`);
  
  let updated = 0;
  let failed = 0;
  
  for (const rec of recordings) {
    try {
      // Build the full path to recording directory
      const recordingDir = path.join(RECORDINGS_DIR, rec.videoPath.replace('/video.mp4', ''));
      const metadataPath = path.join(recordingDir, 'metadata.json');
      const transcriptPath = path.join(recordingDir, 'transcript.json');
      
      let recordingTime = null;
      
      // Try to get the actual recording time from metadata
      if (fs.existsSync(metadataPath)) {
        const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
        if (metadata.recordings && metadata.recordings[0] && metadata.recordings[0].started_at) {
          recordingTime = new Date(metadata.recordings[0].started_at);
          console.log(`✅ ${rec.botId}: Found metadata with time ${recordingTime.toISOString()}`);
        }
      }
      
      // If no metadata, use the date from the path structure
      if (!recordingTime) {
        const pathMatch = rec.videoPath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
        if (pathMatch) {
          const [, year, month, day] = pathMatch;
          // Use a default time that we can check against day-of-week
          recordingTime = new Date(`${year}-${month}-${day}T12:00:00Z`);
          console.log(`⚠️  ${rec.botId}: No metadata, using date from path: ${year}-${month}-${day}`);
        }
      }
      
      if (!recordingTime) {
        console.log(`❌ ${rec.botId}: Could not determine recording time`);
        failed++;
        continue;
      }
      
      // Check if transcript exists for teacher name detection
      const hasTranscript = fs.existsSync(transcriptPath);
      
      // Use YOUR waterfall detection function with correct options object!
      // Pass transcript path if available (teacher name detection is FIRST in waterfall)
      const detectedCourse = detectCourse({
        transcriptPath: hasTranscript ? transcriptPath : null,
        meetingUrl: null,
        recordingDate: recordingTime,
        metadata: null
      });
      
      if (detectedCourse && detectedCourse.courseCode !== 'UNKNOWN') {
        // Update the database
        await prisma.recording.update({
          where: { id: rec.id },
          data: {
            courseCode: detectedCourse.courseCode,
            courseName: detectedCourse.courseName,
            recordedAt: recordingTime
          }
        });
        
        console.log(`✅ ${rec.botId}: ${rec.courseCode} → ${detectedCourse.courseCode} (${detectedCourse.courseName}) [${detectedCourse.source}]`);
        updated++;
      } else {
        const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        console.log(`⚠️  ${rec.botId}: Could not detect course (${dayNames[recordingTime.getDay()]} ${recordingTime.toISOString()})`);
        failed++;
      }
      
    } catch (err) {
      console.error(`❌ ${rec.botId}: Error -`, err.message);
      failed++;
    }
  }
  
  console.log(`\n🎉 Complete!`);
  console.log(`   ✅ Updated: ${updated}`);
  console.log(`   ❌ Failed: ${failed}`);
  
  await prisma.$disconnect();
}

fixCourses().catch(console.error);
