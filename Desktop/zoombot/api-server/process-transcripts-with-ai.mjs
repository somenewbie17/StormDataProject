#!/usr/bin/env node

/**
 * Process Whisper Transcripts:
 * 1. Extract clean text from JSON
 * 2. Get video metadata (duration, creation date)
 * 3. Create AI summary (will be done by GitHub Copilot)
 * 4. Save as markdown to OneDrive
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import { execSync } from 'child_process';
import path from 'path';

const prisma = new PrismaClient();

// Test with first 3 recordings
const LIMIT = 3;

function formatTimestamp(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (hours > 0) {
    return `${hours}h ${mins}m ${secs}s`;
  }
  return `${mins}m ${secs}s`;
}

async function getVideoMetadata(videoPath) {
  try {
    // Get duration using ffprobe
    const durationCmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
    const duration = parseFloat(execSync(durationCmd, { encoding: 'utf8' }).trim());
    
    // Get creation time from file metadata
    const stats = await fs.stat(videoPath);
    const creationDate = stats.birthtime;
    
    // Get file size
    const sizeInMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    return {
      duration: Math.floor(duration),
      durationFormatted: formatDuration(duration),
      creationDate: creationDate.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      sizeInMB
    };
  } catch (error) {
    console.error(`   ⚠️  Could not get video metadata: ${error.message}`);
    return {
      duration: 0,
      durationFormatted: 'Unknown',
      creationDate: 'Unknown',
      sizeInMB: 'Unknown'
    };
  }
}

async function extractTextFromTranscript(transcriptPath) {
  try {
    const data = JSON.parse(await fs.readFile(transcriptPath, 'utf-8'));
    
    // Recall format: array of participants with words
    if (!Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid transcript format');
    }
    
    const participant = data[0];
    const words = participant.words || [];
    
    if (words.length === 0) {
      throw new Error('No words in transcript');
    }
    
    // Group words into sentences/paragraphs (roughly every 100 words or when there's a pause)
    const paragraphs = [];
    let currentParagraph = [];
    let lastTimestamp = 0;
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const timestamp = word.start_timestamp?.relative || 0;
      
      currentParagraph.push(word.text);
      
      // Create new paragraph every ~50 words or after 10+ second pause
      const shouldBreak = (
        currentParagraph.length >= 50 ||
        (timestamp - lastTimestamp > 10 && currentParagraph.length > 10)
      );
      
      if (shouldBreak || i === words.length - 1) {
        const paraStart = words[i - currentParagraph.length + 1]?.start_timestamp?.relative || 0;
        paragraphs.push({
          timestamp: formatTimestamp(paraStart),
          text: currentParagraph.join(' ')
        });
        currentParagraph = [];
      }
      
      lastTimestamp = timestamp;
    }
    
    return {
      paragraphs,
      wordCount: words.length,
      speaker: participant.participant?.name || 'Speaker',
      fullText: words.map(w => w.text).join(' ')
    };
  } catch (error) {
    throw new Error(`Failed to extract text: ${error.message}`);
  }
}

async function processRecording(recording) {
  try {
    const botId = recording.botId;
    console.log(`\n📝 Processing: ${botId}`);
    
    // Get video metadata
    console.log('   📹 Extracting video metadata...');
    const metadata = await getVideoMetadata(recording.videoPath);
    console.log(`   ✅ Duration: ${metadata.durationFormatted} | Created: ${metadata.creationDate}`);
    
    // Extract text from transcript
    console.log('   📄 Extracting transcript text...');
    const transcript = await extractTextFromTranscript(recording.transcriptPath);
    console.log(`   ✅ ${transcript.wordCount} words | ${transcript.paragraphs.length} paragraphs`);
    
    // Create clean text file
    const recordingDir = path.dirname(recording.transcriptPath);
    const textPath = path.join(recordingDir, 'transcript.txt');
    
    const textContent = [
      '='.repeat(80),
      `TRANSCRIPT - Recording ${botId.slice(0, 8)}`,
      '='.repeat(80),
      `Recording ID: ${botId}`,
      `Created: ${metadata.creationDate}`,
      `Duration: ${metadata.durationFormatted} (${Math.floor(metadata.duration / 60)} minutes)`,
      `Words: ${transcript.wordCount}`,
      `Speaker: ${transcript.speaker}`,
      '='.repeat(80),
      '',
      ...transcript.paragraphs.map(p => `[${p.timestamp}] ${p.text}\n`)
    ].join('\n');
    
    await fs.writeFile(textPath, textContent, 'utf-8');
    console.log(`   ✅ Text saved: transcript.txt`);
    
    // This is where GitHub Copilot will analyze and summarize
    // For now, return the data structure that will be used
    return {
      botId,
      metadata,
      transcript,
      textPath,
      recordingDir
    };
    
  } catch (error) {
    console.error(`   ❌ Error: ${error.message}`);
    return null;
  }
}

async function main() {
  console.log('🚀 Processing Whisper Transcripts with AI Analysis\n');
  console.log(`Testing with top ${LIMIT} recordings by content length...\n`);
  
  // Get recordings with most content
  const targetBotIds = [
    'b5071902-43fc-411e-8a7c-69b586a4d664', // 16189 words
    'eefbc253-4917-445d-9bad-0e23d36d1b88', // 10151 words  
    '5c9165e3-1a44-47c6-b351-af46c2558538'  // 7779 words
  ];
  
  const recordings = await prisma.recording.findMany({
    where: {
      botId: { in: targetBotIds }
    }
  });
  
  console.log(`Found ${recordings.length} recordings to process`);
  
  const results = [];
  
  for (const recording of recordings) {
    const result = await processRecording(recording);
    if (result) {
      results.push(result);
    }
  }
  
  await prisma.$disconnect();
  
  console.log('\n' + '='.repeat(80));
  console.log(`✅ Processed ${results.length} recordings`);
  console.log('\n📊 Summary:');
  results.forEach(r => {
    console.log(`   ${r.botId.slice(0, 8)}: ${r.metadata.durationFormatted} | ${r.transcript.wordCount} words`);
  });
  
  console.log('\n🤖 Ready for AI summarization...');
  console.log('   Text files created in each recording directory');
  console.log('   Next: GitHub Copilot will analyze and create summaries');
  
  return results;
}

main().catch(console.error);
