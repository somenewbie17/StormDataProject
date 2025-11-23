#!/usr/bin/env node

/**
 * Convert transcript-converted.json (Recall format with participant.words)
 * to utterances format expected by law app
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert words array to utterances (grouped by natural pauses ~30-60 seconds)
 */
function convertToUtterances(participantData) {
  if (!participantData || !participantData[0]?.words) {
    return [];
  }

  const words = participantData[0].words;
  const utterances = [];
  let currentUtterance = null;
  const TARGET_DURATION = 45; // Target ~45 seconds per utterance
  const MIN_DURATION = 20; // Minimum 20 seconds before considering split
  const PAUSE_THRESHOLD = 3.0; // 3+ seconds pause can split

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const prevWord = i > 0 ? words[i - 1] : null;

    // Calculate pause since last word
    const pause = prevWord ? (word.start - prevWord.end) : 0;
    
    // Check if we should start new utterance
    const isFirstWord = !currentUtterance;
    const currentDuration = currentUtterance ? (word.end - currentUtterance.start) : 0;
    const hasLongPause = pause > PAUSE_THRESHOLD;
    const isOverTarget = currentDuration > TARGET_DURATION;
    const isOverMin = currentDuration > MIN_DURATION;
    
    // Start new utterance if:
    // 1. First word
    // 2. Over target duration AND (long pause OR sentence end)
    // 3. Way over target (60+ seconds)
    const isSentenceEnd = prevWord && /[.!?]$/.test(prevWord.text);
    const shouldStartNew = isFirstWord || 
      (isOverTarget && (hasLongPause || isSentenceEnd)) ||
      (currentDuration > 60);

    if (shouldStartNew && !isFirstWord) {
      utterances.push(currentUtterance);
      currentUtterance = null;
    }

    if (!currentUtterance) {
      currentUtterance = {
        speaker: participantData[0].participant.name || 'Speaker',
        start: word.start,
        end: word.end,
        text: word.text
      };
    } else {
      // Continue current utterance
      currentUtterance.text += ' ' + word.text;
      currentUtterance.end = word.end;
    }
  }

  // Push final utterance
  if (currentUtterance) {
    utterances.push(currentUtterance);
  }

  return utterances;
}

/**
 * Process a single recording
 */
function processRecording(recordingPath) {
  const convertedPath = path.join(recordingPath, 'transcript-converted.json');
  
  if (!fs.existsSync(convertedPath)) {
    console.log(`⏭️  Skipping ${path.basename(recordingPath)} - no converted transcript`);
    return null;
  }

  try {
    const data = JSON.parse(fs.readFileSync(convertedPath, 'utf8'));
    const utterances = convertToUtterances(data);
    
    if (utterances.length === 0) {
      console.log(`⚠️  Warning: ${path.basename(recordingPath)} - no utterances generated`);
      return null;
    }

    // Save as transcript.json (the format law app expects)
    const outputPath = path.join(recordingPath, 'transcript.json');
    fs.writeFileSync(outputPath, JSON.stringify({ utterances }, null, 2));
    
    console.log(`✅ ${path.basename(recordingPath)} - ${utterances.length} utterances`);
    return outputPath;

  } catch (error) {
    console.error(`❌ Error processing ${path.basename(recordingPath)}:`, error.message);
    return null;
  }
}

/**
 * Main function
 */
function main() {
  const recordings = [
    '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings/2025/11/10/5c9165e3-1a44-47c6-b351-af46c2558538',
    '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings/2025/11/13/b5071902-43fc-411e-8a7c-69b586a4d664',
    '/Users/damethrigeorge/Library/CloudStorage/OneDrive-Personal/ZoomBot-Recordings/2025/10/22/eefbc253-4917-445d-9bad-0e23d36d1b88'
  ];

  console.log('Converting transcripts to utterances format...\n');

  recordings.forEach(recordingPath => {
    processRecording(recordingPath);
  });

  console.log('\n✨ Done! Transcripts converted to utterances format.');
}

main();
