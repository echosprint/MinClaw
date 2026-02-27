import Database from 'better-sqlite3'

const db = new Database('../data/db/minclaw.db')
const { changes } = db.prepare('DELETE FROM jobs').run()
console.log(`Cleared ${changes} job(s)`)
db.close()
