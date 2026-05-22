export default {
  async scheduled(event, env, ctx) {
    const result = await env.DB.prepare(`
      UPDATE customer_concerns
      SET status = 'resolved',
          resolved_at = datetime('now'),
          auto_resolved = 1,
          updated_at = datetime('now')
      WHERE status = 'open'
        AND created_at < datetime('now', '-14 days')
    `).run();

    console.log(`Auto-resolved ${result.meta.changes} concerns`);
  }
};
