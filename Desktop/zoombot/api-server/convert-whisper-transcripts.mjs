#!/usr/bin/env node

/**
 * Convert Whisper transcripts to Recall/AssemblyAI format
 * 
 * Whisper format: { text, segments: [{ id, start, end, text }], language }
 * Recall format: [{ participant: { id, name }, words: [{ text, start_timestamp, end_timestamp }] }]
 */

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const prisma = new PrismaClient();

async function convertWhisperToRecallFormat(whisperData) {
    // Create a single participant for Whisper transcripts (no speaker diarization)
    const participant = {
        id: 1,
        name: "Speaker",
        is_host: false,
        platform: "unknown",
        email: null,
        extra_data: {}
    };

    const words = [];
    
    // Convert segments to words
    for (const segment of whisperData.segments || []) {
        // Split segment text into words
        const segmentWords = segment.text.trim().split(/\s+/).filter(w => w);
        
        if (segmentWords.length === 0) continue;
        
        // Calculate time per word (rough approximation)
        const segmentDuration = segment.end - segment.start;
        const timePerWord = segmentDuration / segmentWords.length;
        
        segmentWords.forEach((word, index) => {
            const wordStart = segment.start + (index * timePerWord);
            const wordEnd = segment.start + ((index + 1) * timePerWord);
            
            words.push({
                text: word,
                start_timestamp: {
                    relative: wordStart,
                    absolute: null
                },
                end_timestamp: {
                    relative: wordEnd,
                    absolute: null
                }
            });
        });
    }

    return [{
        participant,
        words
    }];
}

async function main() {
    console.log('🔍 Finding Whisper transcripts...\n');

    // Find all recordings with transcript-whisper.json
    const recordings = await prisma.recording.findMany({
        where: {
            transcriptPath: {
                contains: 'transcript-whisper.json'
            }
        }
    });

    console.log(`Found ${recordings.length} Whisper transcripts\n`);

    let converted = 0;
    let failed = 0;

    for (const recording of recordings) {
        try {
            const courseName = recording.courseName || 'UNKNOWN';
            const courseCode = recording.courseCode || 'Unknown Course';
            console.log(`📁 ${courseName} - ${courseCode}`);
            console.log(`   Bot ID: ${recording.botId}`);

            // Read Whisper transcript
            const whisperPath = recording.transcriptPath;
            const whisperData = JSON.parse(await fs.readFile(whisperPath, 'utf-8'));

            // Convert to Recall format
            console.log('   🔄 Converting format...');
            const recallData = await convertWhisperToRecallFormat(whisperData);

            // Save as transcript-converted.json in the same directory
            const dir = path.dirname(whisperPath);
            const convertedPath = path.join(dir, 'transcript-converted.json');
            
            await fs.writeFile(
                convertedPath,
                JSON.stringify(recallData, null, 2),
                'utf-8'
            );

            // Update database to point to converted transcript
            await prisma.recording.update({
                where: { id: recording.id },
                data: { transcriptPath: convertedPath }
            });

            console.log('   ✅ Converted and saved as transcript-converted.json\n');
            converted++;

        } catch (error) {
            console.error(`   ❌ Error: ${error.message}\n`);
            failed++;
        }
    }

    await prisma.$disconnect();

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✅ Converted: ${converted}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total: ${recordings.length}`);
}

main().catch(console.error);
