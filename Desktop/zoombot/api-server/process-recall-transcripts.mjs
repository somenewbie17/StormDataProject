#!/usr/bin/env node

/**
 * Process Recall transcripts with speaker names
 * Creates: full transcript text, chapters, and AI summary
 * Similar to AssemblyAI format but using our own AI analysis
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RECORDINGS_BASE = '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings';

/**
 * Find all Recall transcripts with multiple speakers
 */
function findRecallTranscripts() {
  console.log('🔍 Searching for Recall transcripts with speaker data...\n');
  
  const transcripts = [];
  
  function scanDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          scanDirectory(fullPath);
        } else if (entry.name === 'transcript.json') {
          try {
            const data = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
            
            // Check if it's a Recall transcript with utterances and multiple speakers
            if (data.utterances && Array.isArray(data.utterances) && data.utterances.length > 10) {
              const speakers = new Set(data.utterances.map(u => u.speaker).filter(Boolean));
              
              if (speakers.size > 1) {
                const botId = path.basename(path.dirname(fullPath));
                const dateMatch = fullPath.match(/\/(\d{4})\/(\d{2})\/(\d{2})\//);
                const date = dateMatch ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}` : 'unknown';
                
                // Calculate total words
                const totalWords = data.utterances.reduce((sum, u) => {
                  return sum + (u.text ? u.text.split(/\s+/).length : 0);
                }, 0);
                
                // Calculate duration
                const duration = data.utterances.length > 0 
                  ? Math.round(data.utterances[data.utterances.length - 1].end / 60)
                  : 0;
                
                transcripts.push({
                  botId,
                  path: fullPath,
                  dir: path.dirname(fullPath),
                  date,
                  utterances: data.utterances.length,
                  speakers: speakers.size,
                  words: totalWords,
                  duration
                });
              }
            }
          } catch (err) {
            // Skip invalid JSON files
          }
        }
      }
    } catch (err) {
      // Skip inaccessible directories
    }
  }
  
  scanDirectory(RECORDINGS_BASE);
  
  // Sort by words (most content first)
  transcripts.sort((a, b) => b.words - a.words);
  
  return transcripts;
}

/**
 * Extract full transcript text with speaker names and timestamps
 */
function extractFullTranscript(transcript) {
  const data = JSON.parse(fs.readFileSync(transcript.path, 'utf8'));
  
  let text = `================================================================================
TRANSCRIPT - Recording ${transcript.botId}
================================================================================
Recording ID: ${transcript.botId}
Date: ${transcript.date}
Duration: ${transcript.duration} minutes
Utterances: ${transcript.utterances}
Speakers: ${transcript.speakers}
Words: ${transcript.words}
================================================================================

`;

  for (const utterance of data.utterances) {
    const minutes = Math.floor(utterance.start / 60);
    const seconds = Math.floor(utterance.start % 60);
    const timestamp = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const speaker = utterance.speaker || 'Unknown';
    
    text += `[${timestamp}] ${speaker}: ${utterance.text}\n\n`;
  }
  
  return text;
}

/**
 * Create automatic chapters (every ~10 minutes or topic changes)
 */
function createChapters(transcript) {
  const data = JSON.parse(fs.readFileSync(transcript.path, 'utf8'));
  const chapters = [];
  const CHAPTER_DURATION = 600; // 10 minutes in seconds
  
  let currentChapter = {
    start: 0,
    startTime: '00:00',
    utterances: [],
    speakers: new Set()
  };
  
  for (const utterance of data.utterances) {
    // Check if we should start a new chapter
    if (utterance.start - currentChapter.start >= CHAPTER_DURATION && currentChapter.utterances.length > 0) {
      // Finalize current chapter
      const minutes = Math.floor(currentChapter.start / 60);
      const seconds = Math.floor(currentChapter.start % 60);
      currentChapter.startTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
      currentChapter.duration = Math.round((utterance.start - currentChapter.start) / 60);
      currentChapter.speakerCount = currentChapter.speakers.size;
      delete currentChapter.speakers;
      
      chapters.push(currentChapter);
      
      // Start new chapter
      currentChapter = {
        start: utterance.start,
        utterances: [],
        speakers: new Set()
      };
    }
    
    currentChapter.utterances.push(utterance.text);
    if (utterance.speaker) {
      currentChapter.speakers.add(utterance.speaker);
    }
  }
  
  // Add final chapter
  if (currentChapter.utterances.length > 0) {
    const minutes = Math.floor(currentChapter.start / 60);
    const seconds = Math.floor(currentChapter.start % 60);
    currentChapter.startTime = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    currentChapter.duration = Math.round((data.utterances[data.utterances.length - 1].end - currentChapter.start) / 60);
    currentChapter.speakerCount = currentChapter.speakers.size;
    delete currentChapter.speakers;
    chapters.push(currentChapter);
  }
  
  return chapters;
}

/**
 * Main function - process all Recall transcripts
 */
function main() {
  const transcripts = findRecallTranscripts();
  
  console.log(`Found ${transcripts.length} Recall transcripts with speaker data:\n`);
  
  transcripts.forEach((t, i) => {
    console.log(`${i + 1}. ${t.botId.substring(0, 8)} (${t.date})`);
    console.log(`   ${t.duration} min, ${t.utterances} utterances, ${t.speakers} speakers, ${t.words.toLocaleString()} words`);
  });
  
  console.log('\n' + '='.repeat(80));
  console.log('Processing top 5 transcripts with most content...\n');
  
  const topTranscripts = transcripts.slice(0, 5);
  
  for (const transcript of topTranscripts) {
    console.log(`\n📝 Processing ${transcript.botId.substring(0, 8)}...`);
    
    // Extract full transcript
    const fullTranscript = extractFullTranscript(transcript);
    const transcriptFile = path.join(transcript.dir, 'transcript-full.txt');
    fs.writeFileSync(transcriptFile, fullTranscript);
    console.log(`   ✅ Full transcript: ${transcript.words.toLocaleString()} words`);
    
    // Create chapters
    const chapters = createChapters(transcript);
    const chaptersFile = path.join(transcript.dir, 'chapters.json');
    fs.writeFileSync(chaptersFile, JSON.stringify({ chapters }, null, 2));
    console.log(`   ✅ Chapters: ${chapters.length} chapters created`);
    
    console.log(`   📁 Saved to: ${transcript.dir}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('\n✨ Done! Now you can read these transcripts and create AI summaries.');
  console.log('\nTranscript locations:');
  topTranscripts.forEach(t => {
    console.log(`  • ${t.botId.substring(0, 8)}: ${t.dir}`);
  });
}

main();
