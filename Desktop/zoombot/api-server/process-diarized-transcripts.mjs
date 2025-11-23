#!/usr/bin/env node

/**
 * Process Recall transcripts with diarization (participant.words format)
 * Creates: full transcript text with speakers, chapters, ready for AI summary
 * Similar to AssemblyAI format
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const prisma = new PrismaClient();

/**
 * Find all Recall transcripts from database
 */
async function findRecallTranscripts() {
  const recordings = await prisma.recording.findMany({
    where: {
      transcriptPath: { not: null }
    },
    select: {
      botId: true,
      transcriptPath: true,
      courseCode: true,
      courseName: true,
      duration: true
    }
  });
  
  const recallTranscripts = [];
  
  for (const recording of recordings) {
    const dir = recording.transcriptPath.substring(0, recording.transcriptPath.lastIndexOf('/'));
    const transcriptPath = path.join(dir, 'transcript.json');
    
    if (fs.existsSync(transcriptPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(transcriptPath, 'utf8'));
        
        // Check if it's Recall format (array of {participant, words})
        if (Array.isArray(data) && data[0]?.participant && data[0]?.words) {
          // Count unique speakers
          const speakers = new Set(data.map(p => p.participant.name).filter(Boolean));
          
          // Count total words
          const totalWords = data.reduce((sum, p) => sum + (p.words?.length || 0), 0);
          
          // Only process if has diarization (multiple speakers) and content
          if (speakers.size > 1 && totalWords > 500) {
            recallTranscripts.push({
              botId: recording.botId,
              shortId: recording.botId.substring(0, 8),
              path: transcriptPath,
              dir,
              courseCode: recording.courseCode,
              courseName: recording.courseName,
              duration: recording.duration || 0,
              speakers: speakers.size,
              words: totalWords,
              speakerNames: Array.from(speakers)
            });
          }
        }
      } catch (err) {
        // Skip invalid files
      }
    }
  }
  
  // Sort by words (most content first)
  recallTranscripts.sort((a, b) => b.words - a.words);
  
  return recallTranscripts;
}

/**
 * Convert participant.words format to utterances grouped by speaker turns
 */
function convertToUtterances(data) {
  const utterances = [];
  
  for (const participant of data) {
    const speakerName = participant.participant.name || 'Unknown Speaker';
    let currentUtterance = null;
    const PAUSE_THRESHOLD = 2.5; // 2.5 seconds = natural pause
    const MAX_DURATION = 30; // Max 30 seconds per utterance
    const MAX_WORDS = 80; // Max 80 words per utterance
    
    for (let i = 0; i < participant.words.length; i++) {
      const word = participant.words[i];
      
      // Extract timestamps - handle both formats
      const start = word.start_timestamp?.relative ?? word.start ?? null;
      const end = word.end_timestamp?.relative ?? word.end ?? null;
      
      if (start === null || end === null) continue; // Skip words without timestamps
      
      const prevWord = i > 0 ? participant.words[i - 1] : null;
      const prevEnd = prevWord ? (prevWord.end_timestamp?.relative ?? prevWord.end ?? 0) : 0;
      const pause = prevWord ? (start - prevEnd) : 0;
      
      // Check if we should start a new utterance
      const wordCount = currentUtterance ? currentUtterance.text.split(' ').length : 0;
      const duration = currentUtterance ? (end - currentUtterance.start) : 0;
      const shouldBreak = pause > PAUSE_THRESHOLD || 
                          duration > MAX_DURATION || 
                          wordCount >= MAX_WORDS;
      
      // Start new utterance on first word, after pause, or when limits reached
      if (!currentUtterance || shouldBreak) {
        if (currentUtterance) {
          utterances.push(currentUtterance);
        }
        currentUtterance = {
          speaker: speakerName,
          start: start,
          end: end,
          text: word.text
        };
      } else {
        // Continue utterance
        currentUtterance.text += ' ' + word.text;
        currentUtterance.end = end;
      }
    }
    
    if (currentUtterance) {
      utterances.push(currentUtterance);
    }
  }
  
  // Sort by start time
  utterances.sort((a, b) => a.start - b.start);
  
  return utterances;
}

/**
 * Extract full transcript text with speaker names and timestamps
 */
function extractFullTranscript(transcript) {
  const data = JSON.parse(fs.readFileSync(transcript.path, 'utf8'));
  const utterances = convertToUtterances(data);
  
  const durationMin = Math.floor(transcript.duration / 60);
  
  let text = `================================================================================
TRANSCRIPT - ${transcript.courseName} (${transcript.courseCode})
================================================================================
Recording ID: ${transcript.botId}
Duration: ${durationMin} minutes (${transcript.duration} seconds)
Speakers: ${transcript.speakers} (${transcript.speakerNames.join(', ')})
Utterances: ${utterances.length}
Words: ${transcript.words.toLocaleString()}
================================================================================

`;

  for (const utterance of utterances) {
    const minutes = Math.floor(utterance.start / 60);
    const seconds = Math.floor(utterance.start % 60);
    const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    text += `[${timestamp}] ${utterance.speaker}:\n${utterance.text}\n\n`;
  }
  
  return { text, utterances };
}

/**
 * Create automatic chapters (every ~10 minutes)
 */
function createChapters(utterances, duration) {
  const chapters = [];
  const CHAPTER_DURATION = 600; // 10 minutes
  
  let chapterNum = 1;
  let chapterStart = 0;
  let chapterUtterances = [];
  let chapterSpeakers = new Set();
  
  for (const utterance of utterances) {
    // Check if should start new chapter
    if (utterance.start - chapterStart >= CHAPTER_DURATION && chapterUtterances.length > 0) {
      const minutes = Math.floor(chapterStart / 60);
      const seconds = Math.floor(chapterStart % 60);
      
      chapters.push({
        chapter: chapterNum,
        timestamp: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
        start: chapterStart,
        duration: Math.round((utterance.start - chapterStart) / 60),
        speakers: Array.from(chapterSpeakers),
        utteranceCount: chapterUtterances.length,
        summary: chapterUtterances.slice(0, 3).map(u => u.text.substring(0, 100)).join(' ... ')
      });
      
      chapterNum++;
      chapterStart = utterance.start;
      chapterUtterances = [];
      chapterSpeakers = new Set();
    }
    
    chapterUtterances.push(utterance);
    chapterSpeakers.add(utterance.speaker);
  }
  
  // Add final chapter
  if (chapterUtterances.length > 0) {
    const minutes = Math.floor(chapterStart / 60);
    const seconds = Math.floor(chapterStart % 60);
    
    chapters.push({
      chapter: chapterNum,
      timestamp: `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`,
      start: chapterStart,
      duration: Math.round((duration - chapterStart) / 60),
      speakers: Array.from(chapterSpeakers),
      utteranceCount: chapterUtterances.length,
      summary: chapterUtterances.slice(0, 3).map(u => u.text.substring(0, 100)).join(' ... ')
    });
  }
  
  return chapters;
}

/**
 * Main function
 */
async function main() {
  console.log('🔍 Finding Recall transcripts with diarization...\n');
  
  const transcripts = await findRecallTranscripts();
  
  console.log(`Found ${transcripts.length} diarized transcripts:\n`);
  
  transcripts.forEach((t, i) => {
    const min = Math.floor(t.duration / 60);
    console.log(`${i + 1}. ${t.shortId} - ${t.courseName}`);
    console.log(`   ${min} min, ${t.speakers} speakers, ${t.words.toLocaleString()} words`);
    console.log(`   Speakers: ${t.speakerNames.join(', ')}`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('Processing all diarized transcripts...\n');
  
  for (const transcript of transcripts) {
    console.log(`\n📝 Processing ${transcript.shortId} - ${transcript.courseName}...`);
    
    // Extract full transcript
    const { text, utterances } = extractFullTranscript(transcript);
    const transcriptFile = path.join(transcript.dir, 'transcript-full.txt');
    fs.writeFileSync(transcriptFile, text);
    console.log(`   ✅ Full transcript: ${utterances.length} utterances, ${transcript.words.toLocaleString()} words`);
    
    // Create chapters
    const chapters = createChapters(utterances, transcript.duration);
    const chaptersFile = path.join(transcript.dir, 'chapters.json');
    fs.writeFileSync(chaptersFile, JSON.stringify({ 
      recording: {
        botId: transcript.botId,
        course: transcript.courseName,
        courseCode: transcript.courseCode,
        duration: transcript.duration,
        speakers: transcript.speakerNames
      },
      chapters 
    }, null, 2));
    console.log(`   ✅ Chapters: ${chapters.length} chapters created`);
    
    // Save utterances format for law app
    const utterancesFile = path.join(transcript.dir, 'transcript-utterances.json');
    fs.writeFileSync(utterancesFile, JSON.stringify({ utterances }, null, 2));
    console.log(`   ✅ Utterances format saved for law app`);
    
    console.log(`   📁 ${transcript.dir}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log(`\n✨ Done! Processed ${transcripts.length} transcripts.`);
  console.log('\nFiles created for each recording:');
  console.log('  • transcript-full.txt - Full transcript with speakers and timestamps');
  console.log('  • chapters.json - Auto-generated chapters (~10 min each)');
  console.log('  • transcript-utterances.json - Formatted for law app viewer');
  console.log('\nYou can now read transcript-full.txt files and create AI summaries!');
  
  await prisma.$disconnect();
}

main();
