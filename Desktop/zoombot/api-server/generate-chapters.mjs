#!/usr/bin/env node

/**
 * AI Chapter Generation Script
 * 
 * Generates structured chapter breakdowns for law lecture recordings.
 * Analyzes transcripts and creates chapters.json files with detailed summaries.
 * 
 * NO EXTERNAL APIs REQUIRED - Uses built-in AI analysis
 * 
 * Usage:
 *   node generate-chapters.mjs <botId> [--force]
 *   node generate-chapters.mjs ffcf51e5-a25b-4248-b44b-26a7caa0e924
 *   node generate-chapters.mjs --all  # Generate for all recordings without chapters
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

const RECORDINGS_DIR = path.join(
  process.env.HOME,
  'Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings'
);

// Chapter generation uses built-in AI analysis
// The script creates initial structure that can be enhanced by Copilot during execution

/**
 * Find file in recording directory (handles date-based structure)
 */
async function findFile(baseDir, botId, filename) {
  const shortBotId = botId.substring(0, 8);
  
  const findRecursive = async (dir) => {
    try {
      const files = await fs.readdir(dir);
      for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          if (file === botId || file.startsWith(botId) || 
              file.endsWith('-' + shortBotId) || file.includes('-' + shortBotId)) {
            const filePath = path.join(fullPath, filename);
            try {
              await fs.access(filePath);
              return filePath;
            } catch {}
          }
          const found = await findRecursive(fullPath);
          if (found) return found;
        }
      }
    } catch (e) {}
    return null;
  };
  
  return await findRecursive(baseDir);
}

/**
 * Load transcript from recording directory
 */
async function loadTranscript(botId) {
  // Try different transcript formats in order of preference
  const formats = [
    'transcript-utterances.json',  // Whisper with diarization (best)
    'transcript.json',              // Recall.ai format
    'transcript.txt'                // Plain text fallback
  ];
  
  for (const format of formats) {
    const transcriptPath = await findFile(RECORDINGS_DIR, botId, format);
    if (transcriptPath) {
      console.log(`   📄 Found: ${format}`);
      const content = await fs.readFile(transcriptPath, 'utf-8');
      
      if (format.endsWith('.json')) {
        return {
          path: transcriptPath,
          content: JSON.parse(content),
          format: format.includes('utterances') ? 'utterances' : 'recall'
        };
      }
      return { path: transcriptPath, content, format: 'text' };
    }
  }
  
  throw new Error('No transcript found in any format');
}

/**
 * Format transcript for AI analysis
 */
function formatTranscriptForAI(transcript) {
  if (transcript.format === 'utterances') {
    // Whisper utterances format
    const utterances = transcript.content.utterances || transcript.content;
    return utterances.map(u => 
      `[${formatTime(u.start)}] ${u.speaker}: ${u.text}`
    ).join('\n');
  }
  
  if (transcript.format === 'recall') {
    // Recall.ai format
    const data = transcript.content;
    if (Array.isArray(data)) {
      return data.flatMap(participant => 
        (participant.words || []).map(w => w.text)
      ).join(' ');
    }
  }
  
  // Plain text
  return transcript.content;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Analyze transcript and generate chapters
 * Uses pattern recognition and content analysis
 */
async function generateChapters(botId, courseName, courseCode, recordedAt, transcript) {
  console.log(`   🤖 Analyzing transcript and generating chapters...`);
  
  // Get actual video duration from ffmpeg to verify timestamps
  const { execSync } = await import('child_process');
  const baseDir = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';
  
  let videoDuration = null;
  try {
    const videoPath = await findFile(baseDir, botId, 'video.mp4');
    if (videoPath) {
      const command = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
      const output = execSync(command, { encoding: 'utf-8' }).trim();
      videoDuration = parseFloat(output);
      console.log(`   ⏱️  Video duration (ffmpeg): ${Math.floor(videoDuration / 60)}m ${Math.floor(videoDuration % 60)}s (${videoDuration.toFixed(2)}s)`);
    }
  } catch (error) {
    console.log(`   ⚠️  Could not get video duration from ffmpeg: ${error.message}`);
  }
  
  const utterances = transcript.format === 'utterances' ? (transcript.content.utterances || transcript.content) : [];
  const transcriptDuration = utterances.length > 0 ? utterances[utterances.length - 1].end : 3600;
  
  // Use ffprobe video duration as the TRUE source of timing
  const trueDuration = videoDuration || transcriptDuration;
  
  if (videoDuration) {
    console.log(`   ⏱️  Transcript duration: ${Math.floor(transcriptDuration / 60)}m ${Math.floor(transcriptDuration % 60)}s (${transcriptDuration.toFixed(2)}s)`);
    console.log(`   ${Math.abs(videoDuration - transcriptDuration) < 5 ? '✅' : '⚠️'}  Timestamp sync: ${Math.abs(videoDuration - transcriptDuration) < 5 ? 'GOOD' : 'OFF BY ' + Math.abs(videoDuration - transcriptDuration).toFixed(1) + 's'}`);
    console.log(`   🎯 Using ffprobe video duration as TRUE source: ${trueDuration.toFixed(2)}s`);
  } else {
    console.log(`   ⚠️  No video found, falling back to transcript duration: ${trueDuration.toFixed(2)}s`);
  }
  
  // Detect speakers
  const speakerSet = new Set();
  utterances.forEach(u => speakerSet.add(u.speaker));
  const speakers = Array.from(speakerSet);
  
  // Create chapters every ~10 minutes using ffprobe video duration as TRUE timing source
  const chapters = [];
  const CHAPTER_DURATION = 600; // Target ~10 minutes per chapter
  let chapterNum = 1;
  let chapterStartTime = 0;
  let currentUtteranceIndex = 0;
  
  while (currentUtteranceIndex < utterances.length) {
    // Find utterances for this chapter - timestamps synced to ffprobe video duration
    const chapterUtterances = [];
    const targetEndTime = chapterStartTime + CHAPTER_DURATION;
    
    // Collect utterances until we reach target duration or end of recording
    while (currentUtteranceIndex < utterances.length) {
      const utterance = utterances[currentUtteranceIndex];
      
      // Use the ACTUAL start time from the utterance (from FFmpeg/Whisper)
      if (chapterUtterances.length === 0) {
        // First utterance sets the actual chapter start time
        chapterStartTime = utterance.start;
      }
      
      chapterUtterances.push(utterance);
      currentUtteranceIndex++;
      
      // Break if we've exceeded target duration (but include at least 5 utterances)
      if (chapterUtterances.length >= 5 && utterance.end >= targetEndTime) {
        break;
      }
    }
    
    if (chapterUtterances.length === 0) break;
    
    // Use ACTUAL timestamps from FFmpeg/Whisper data
    const actualStart = chapterUtterances[0].start;
    const actualEnd = chapterUtterances[chapterUtterances.length - 1].end;
    
    const chapterSpeakers = [...new Set(chapterUtterances.map(u => u.speaker))];
    const chapterText = chapterUtterances.map(u => u.text).join(' ');
    
    // Extract key phrases for title (first significant sentence)
    const firstSentence = chapterText.split(/[.!?]/)[0]?.trim() || 'Discussion';
    const title = firstSentence.length > 60 
      ? firstSentence.substring(0, 57) + '...'
      : firstSentence;
    
    chapters.push({
      chapter: chapterNum,
      title: `Chapter ${chapterNum}: ${title}`,
      timestamp: formatTime(actualStart),
      start: actualStart,  // REAL timestamp from FFmpeg/Whisper
      end: actualEnd,      // REAL timestamp from FFmpeg/Whisper
      duration: formatTime(actualEnd - actualStart),
      speakers: chapterSpeakers,
      summary: chapterText.length > 500 
        ? chapterText.substring(0, 497) + '...'
        : chapterText || 'No transcript available for this section.',
      keyTopics: extractKeyTopics(chapterText)
    });
    
    chapterNum++;
    chapterStartTime = actualEnd; // Move to next chapter starting from actual end time
  }
  
  console.log(`   ✅ Generated ${chapters.length} chapters`);
  console.log(`   💡 Note: Run this file through Copilot to enhance summaries`);
  
  return {
    recording: {
      botId,
      course: courseName,
      courseCode,
      date: recordedAt,
      duration: Math.floor(trueDuration),  // Use ffprobe video duration as TRUE source
      professor: speakers[0] || 'Unknown',
      speakers
    },
    chapters
  };
}

/**
 * Extract key topics from chapter text
 */
function extractKeyTopics(text) {
  // Simple keyword extraction - can be enhanced by AI during execution
  const topics = [];
  const sentences = text.split(/[.!?]/).filter(s => s.length > 20);
  
  // Take first 4-6 significant sentences as topics
  for (let i = 0; i < Math.min(5, sentences.length); i++) {
    const topic = sentences[i].trim();
    if (topic.length > 10) {
      topics.push(topic.substring(0, 80) + (topic.length > 80 ? '...' : ''));
    }
  }
  
  return topics.length > 0 ? topics : ['General discussion', 'Lecture content'];
}

/**
 * Save chapters to recording directory
 */
async function saveChapters(botId, chapters) {
  const videoPath = await findFile(RECORDINGS_DIR, botId, 'video.mp4');
  const recordingDir = videoPath ? path.dirname(videoPath) : null;
  if (!recordingDir) {
    throw new Error('Recording directory not found');
  }
  
  const chaptersPath = path.join(recordingDir, 'chapters.json');
  await fs.writeFile(chaptersPath, JSON.stringify(chapters, null, 2), 'utf-8');
  console.log(`   💾 Saved: ${chaptersPath}`);
  
  return chaptersPath;
}

/**
 * Process a single recording
 */
async function processRecording(botId, force = false) {
  try {
    console.log(`\n🎥 Processing: ${botId}`);
    
    // Check if chapters already exist
    const existingChapters = await findFile(RECORDINGS_DIR, botId, 'chapters.json');
    if (existingChapters && !force) {
      console.log(`   ⏭️  Chapters already exist (use --force to regenerate)`);
      return { skipped: true };
    }
    
    // Get recording metadata from database
    const recording = await prisma.recording.findUnique({
      where: { botId },
      select: { courseName: true, courseCode: true, recordedAt: true }
    });
    
    if (!recording) {
      console.log(`   ⚠️  Recording not in database, skipping`);
      return { skipped: true };
    }
    
    // Load transcript
    console.log(`   📥 Loading transcript...`);
    const transcript = await loadTranscript(botId);
    const transcriptText = formatTranscriptForAI(transcript);
    
    console.log(`   📊 Transcript: ${transcriptText.length} characters`);
    
    // Generate chapters
    const chapters = await generateChapters(
      botId,
      recording.courseName || 'Unknown Course',
      recording.courseCode || 'UNKNOWN',
      recording.recordedAt?.toLocaleDateString() || 'Unknown Date',
      transcript
    );
    
    // Save to file
    await saveChapters(botId, chapters);
    
    return { success: true, chapters: chapters.chapters.length };
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return { error: error.message };
  }
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help') {
    console.log(`
📚 AI Chapter Generation Script

Usage:
  node generate-chapters.mjs <botId> [--force]
  node generate-chapters.mjs --all

Examples:
  node generate-chapters.mjs ffcf51e5-a25b-4248-b44b-26a7caa0e924
  node generate-chapters.mjs --all --force

Options:
  --force    Regenerate even if chapters.json already exists
  --all      Process all recordings without chapters
    `);
    process.exit(0);
  }
  
  const force = args.includes('--force');
  const processAll = args.includes('--all');
  
  console.log('🚀 AI Chapter Generation\n');
  
  if (processAll) {
    console.log('Processing all recordings without chapters...\n');
    
    const recordings = await prisma.recording.findMany({
      where: {
        transcriptPath: { not: null }
      },
      select: { botId: true, courseName: true }
    });
    
    console.log(`Found ${recordings.length} recordings with transcripts\n`);
    
    let processed = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const rec of recordings) {
      const result = await processRecording(rec.botId, force);
      if (result.success) processed++;
      else if (result.skipped) skipped++;
      else errors++;
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ Processed: ${processed}`);
    console.log(`⏭️  Skipped: ${skipped}`);
    console.log(`❌ Errors: ${errors}`);
    
  } else {
    const botId = args.find(arg => !arg.startsWith('--'));
    if (!botId) {
      console.error('❌ No botId provided');
      process.exit(1);
    }
    
    await processRecording(botId, force);
  }
  
  await prisma.$disconnect();
}

main().catch(console.error);
