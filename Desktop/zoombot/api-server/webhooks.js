const { exec } = require('child_process');

function notify(title, message, sound = 'Glass') {
  const escapedMessage = message.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const escapedTitle = title.replace(/"/g, '\\"').replace(/'/g, "'\\''");
  const cmd = `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "${sound}"'`;
  
  exec(cmd, (error) => {
    if (error) console.error('Notification error:', error.message);
  });
}

module.exports = function(app) {
  // Test endpoint
  app.post('/webhooks/test', (req, res) => {
    console.log('Test webhook:', req.body);
    notify('🧪 Test Webhook', 'System working!', 'Ping');
    res.json({ success: true, body: req.body });
  });
  
  // Recall recording completed webhook
  app.post('/webhooks/recall/recording-completed', async (req, res) => {
    const { bot_id, status, duration } = req.body;
    console.log('Recall webhook received:', { bot_id, status, duration });
    
    if (status === 'completed') {
      const durationMin = duration ? Math.round(duration / 60) : '?';
      notify('🎥 Recording Complete', `Bot ${bot_id?.substring(0, 8)} - ${durationMin}min`, 'Hero');
      
      // Auto-process transcript after 30 seconds (OneDrive sync delay)
      setTimeout(() => {
        console.log('Starting transcript processing for', bot_id);
        
        exec('cd /Users/damethrigeorge/Desktop/zoombot/api-server && node process-diarized-transcripts.mjs',
          (error, stdout, stderr) => {
            if (error) {
              console.error('Transcript processing error:', error);
              notify('❌ Processing Error', 'Check logs for details', 'Basso');
            } else {
              console.log('Transcript processing complete:', stdout);
              notify('📝 Transcript Ready', 'Waiting for AI summary', 'Tink');
            }
          }
        );
      }, 30000);
    }
    
    res.json({ received: true, bot_id, status });
  });
  
  // Manual notification endpoint
  app.post('/api/notify', (req, res) => {
    const { title, message, sound } = req.body;
    
    if (!title || !message) {
      return res.status(400).json({ error: 'title and message required' });
    }
    
    notify(title, message, sound || 'Glass');
    res.json({ success: true });
  });
  
  // AI summary complete notification
  app.post('/api/notify/summary-complete', (req, res) => {
    const { bot_id, course } = req.body;
    const shortId = bot_id?.substring(0, 8) || 'unknown';
    
    notify('🤖 AI Summary Complete', `${course || 'Recording'} - ${shortId}`, 'Funk');
    res.json({ success: true });
  });
};
