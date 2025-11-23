#!/usr/bin/env node

/**
 * Migration Script: Add Program Field to Recordings
 * 
 * Purpose: Populate the 'program' field for all existing recordings
 * Run this AFTER updating the Prisma schema and running `npx prisma migrate dev`
 * 
 * What it does:
 * 1. Reads all recordings from database
 * 2. Detects program from courseCode using program-mapper.mjs
 * 3. Updates each recording with the detected program
 * 
 * Usage:
 *   cd api-server
 *   node migrate-add-program.mjs
 */

import { PrismaClient } from '@prisma/client';
import { detectProgram, getProgramName } from '../scripts/program-mapper.mjs';

const prisma = new PrismaClient();

async function migrate() {
  try {
    console.log('\n🔄 Starting migration: Add program field to recordings...\n');
    
    // Get all recordings
    const recordings = await prisma.recording.findMany({
      select: {
        id: true,
        botId: true,
        courseCode: true,
        courseName: true,
        program: true
      }
    });
    
    if (recordings.length === 0) {
      console.log('📭 No recordings found. Nothing to migrate.');
      return;
    }
    
    console.log(`📊 Found ${recordings.length} recordings to process\n`);
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const recording of recordings) {
      try {
        // Skip if already has program field (not 'general' or null)
        if (recording.program && recording.program !== 'general') {
          console.log(`⏭️  ${recording.courseCode} - Already has program: ${recording.program}`);
          skipped++;
          continue;
        }
        
        // Detect program from course code
        const program = detectProgram(recording.courseCode);
        const programName = getProgramName(program);
        
        // Update recording
        await prisma.recording.update({
          where: { id: recording.id },
          data: { program }
        });
        
        console.log(`✅ ${recording.courseCode.padEnd(10)} → ${program.padEnd(25)} (${programName})`);
        updated++;
        
      } catch (error) {
        console.error(`❌ Error updating ${recording.courseCode}:`, error.message);
        errors++;
      }
    }
    
    console.log('\n' + '─'.repeat(60));
    console.log(`\n✨ Migration complete!`);
    console.log(`   Updated: ${updated}`);
    console.log(`   Skipped: ${skipped}`);
    console.log(`   Errors:  ${errors}`);
    console.log(`   Total:   ${recordings.length}\n`);
    
    // Show program summary
    const programCounts = await prisma.recording.groupBy({
      by: ['program'],
      _count: {
        program: true
      }
    });
    
    console.log('📊 Program Distribution:');
    console.log('─'.repeat(60));
    programCounts.forEach(({ program, _count }) => {
      const name = getProgramName(program);
      console.log(`   ${name.padEnd(30)} ${_count.program} recordings`);
    });
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrate();
